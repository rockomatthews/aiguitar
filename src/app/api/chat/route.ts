import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  addTrack,
  createEmptySong,
  ensureMeasureCounts,
  updateMetadata,
  createDefaultMeasure,
  createDefaultTrack
} from "@/lib/songModel";
import { Song, SongSchema, Track, validateSong } from "@/lib/songSchema";

export const runtime = "nodejs";

type ChatRequest = {
  message: string;
  song?: Song;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
};

type ChatResponse = {
  reply: string;
  song: Song;
  followUps: string[];
};

function parseTempo(message: string): number | undefined {
  const match = message.match(/(\d{2,3})\s*bpm/i);
  if (!match) return undefined;
  const tempo = Number(match[1]);
  if (Number.isNaN(tempo)) return undefined;
  return tempo;
}

function parseKey(message: string): string | undefined {
  const match = message.match(/\bkey\s+of\s+([A-G](#|b)?\s?(major|minor)?)\b/i);
  if (!match) return undefined;
  return match[1].replace(/\s+/g, " ").trim();
}

function hasInstrument(message: string, instrument: string): boolean {
  return message.toLowerCase().includes(instrument);
}

function buildTrack(id: string, name: string, instrument: string, isDrums = false): Track {
  return {
    id,
    name,
    instrument,
    isDrums,
    stringCount: isDrums ? undefined : 6,
    tuning: isDrums ? undefined : [40, 45, 50, 55, 59, 64],
    capo: 0,
    volume: 100,
    pan: 64,
    measures: []
  };
}

function buildDraftResponse(baseSong: Song, draftText: string): ChatResponse {
  return {
    reply: draftText,
    followUps: [],
    song: SongSchema.parse({
      ...baseSong,
      draftText,
      readyForExport: false
    })
  };
}

function buildChecklist(song: Song) {
  const checklist = [
    { id: "title", label: "Song title", done: Boolean(song.metadata.title) },
    { id: "tempo", label: "Tempo (BPM)", done: Boolean(song.metadata.tempo) },
    { id: "key", label: "Key signature", done: Boolean(song.metadata.keySignature) },
    { id: "tracks", label: "Tracks (guitar/bass/drums)", done: song.tracks.length > 0 },
    {
      id: "measures",
      label: "At least one measure",
      done: song.tracks.some((track) => track.measures.length > 0)
    },
    {
      id: "beats",
      label: "At least one beat",
      done: song.tracks.some((track) =>
        track.measures.some((measure) => (measure.beats?.length ?? 0) > 0)
      )
    }
  ];

  return {
    checklist,
    missing: checklist.filter((item) => !item.done)
  };
}

function nextChecklistPrompt(song: Song): string | null {
  const { missing } = buildChecklist(song);
  const next = missing[0];
  if (!next) return null;
  switch (next.id) {
    case "tracks":
      return "Which instruments should I include (guitar, bass, drums, synth)?";
    case "tempo":
      return "What tempo should we use? You can reply like '140 bpm'.";
    case "key":
      return "What key should the song be in?";
    case "measures":
      return "How many measures should I draft to start?";
    case "beats":
      return "Should I add a basic beat pattern to the first measure?";
    default:
      return "What should I add next?";
  }
}

function parseTitle(message: string): string | undefined {
  const match = message.match(/called\s+'([^']+)'/i) || message.match(/called\s+\"([^\"]+)\"/i);
  return match?.[1];
}

function buildLocalDraft(message: string, baseSong: Song): ChatResponse {
  const titleMatch = message.match(/called\s+'([^']+)'/i);
  const title = parseTitle(message) ?? titleMatch?.[1] ?? baseSong.metadata.title ?? "Untitled";
  const tempo = parseTempo(message) ?? baseSong.metadata.tempo ?? 96;
  const key = parseKey(message) ?? baseSong.metadata.keySignature ?? "D minor";

  const song = {
    ...baseSong,
    metadata: {
      ...baseSong.metadata,
      title,
      tempo,
      keySignature: key
    },
    tracks: baseSong.tracks.length ? baseSong.tracks : [createDefaultTrack()]
  };

  const draftText = `${baseSong.draftText ? `${baseSong.draftText}\n\n` : ""}TITLE: ${title}
Tempo: ${tempo} BPM
Key: ${key}

[INTRO]
Chugging guitars build tension, lead guitar teases a motif.

[VERSE]
Short, clipped lines about the theme you specified.

[CHORUS]
Repeat the core hook; keep it big and anthemic.

[BRIDGE]
Half-time breakdown before final chorus.`;

  return buildDraftResponse(song, draftText);
}

async function callOpenAI(message: string, song: Song): Promise<ChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const client = new OpenAI({ apiKey });
  const systemPrompt = `
You are an assistant that updates a Guitar Pro song schema.
Return strict JSON with keys: reply (string), followUps (string[]), song (full song object).
The reply must be a long-form creative response that includes:
- full song lyrics with sections
- riff map and section-by-section structure
- chorus chord progression
- lead guitar parts when requested

The song object must include:
- draftText (full creative write-up)
- chordsBySection (map of section name to chord list)
- sections and tracks based on the schema.
- readyForExport: set true ONLY when the user explicitly asks to generate/export the GP5 file.

Do not include markdown or extra text outside of JSON.
Return a full song object. Example shape:
{
  "reply": "...",
  "followUps": [],
  "song": {
    "metadata": { "title": "...", "artist": "...", "tempo": 96, "keySignature": "D minor", "timeSignature": {"beats":4,"beatType":4}, "version":"5.00" },
    "sections": [],
    "tracks": [],
    "draftText": "...",
    "chordsBySection": {},
    "readyForExport": false
  }
}
`.trim();

  const userPrompt = JSON.stringify({
    instruction: message,
    currentSong: song
  });

  const responsePromise = client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    max_tokens: 1200,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Update the song based on this instruction and return JSON only:\n${userPrompt}`
      }
    ]
  });
  const response = await Promise.race([
    responsePromise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AI response timed out.")), 15000)
    )
  ]);

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  let parsed: ChatResponse;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return buildDraftResponse(song, content);
  }

  const validatedSong = SongSchema.safeParse(parsed.song);
  if (!validatedSong.success) {
    const retry = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      max_tokens: 1200,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Fix the JSON to match the schema. Return JSON only.\nSchema errors:\n${JSON.stringify(validatedSong.error.issues)}\nOriginal response:\n${content}`
        }
      ]
    });
    const retryContent = retry.choices[0]?.message?.content?.trim();
    if (!retryContent) {
      return buildDraftResponse(song, content);
    }
    try {
      parsed = JSON.parse(retryContent);
    } catch (error) {
      return buildDraftResponse(song, content);
    }
  }

  if (!parsed.song) {
    return buildDraftResponse(song, parsed.reply ?? content);
  }

  const finalSong = SongSchema.parse(parsed.song);
  const reply = parsed.reply ?? "Updated the song.";
  const hydratedSong = {
    ...finalSong,
    draftText: parsed.song?.draftText ?? reply,
    chordsBySection: parsed.song?.chordsBySection ?? finalSong.chordsBySection
  };

  return {
    reply,
    followUps: parsed.followUps ?? [],
    song: SongSchema.parse(hydratedSong)
  };
}

function sanitizeSections(sections: Song["sections"]) {
  return sections
    .filter((section) => Number.isFinite(section.startMeasure) && Number.isFinite(section.length))
    .map((section, index) => ({
      ...section,
      startMeasure: section.startMeasure ?? 0,
      length: section.length ?? 1,
      name: section.name || `Section ${index + 1}`
    }));
}

function sanitizeMeasures(measures: Track["measures"]) {
  return measures.map((measure, index) => ({
    ...measure,
    index: typeof measure?.index === "number" ? measure.index : index,
    beats: Array.isArray(measure?.beats) ? measure.beats : []
  }));
}

function sanitizeTracks(tracks: Track[]) {
  return tracks.map((track, index) => ({
    ...track,
    id: track.id || `track-${index + 1}`,
    measures: sanitizeMeasures(track.measures ?? [])
  }));
}

function normalizeSong(song: Song, fallback: Song): Song {
  return {
    ...fallback,
    ...song,
    sections: sanitizeSections(song.sections ?? []),
    tracks: sanitizeTracks(song.tracks ?? fallback.tracks)
  };
}

function applyMessageToSong(song: Song, message: string): { song: Song; reply: string; followUps: string[] } {
  let updated = song;
  const followUps: string[] = [];
  const tempo = parseTempo(message);
  const key = parseKey(message);
  const title = parseTitle(message);
  const wantsChords = /chord/i.test(message);
  const wantsMeasure = /create a measure|add a measure|new measure|create a bar|add a bar/i.test(message);
  const wantsMore = /add more|keep refining|keep going|expand|continue/i.test(message);

  if (tempo) {
    updated = updateMetadata(updated, { tempo });
  }

  if (title) {
    updated = updateMetadata(updated, { title });
  }

  if (key) {
    updated = updateMetadata(updated, { keySignature: key });
  }

  if (hasInstrument(message, "drum") && !updated.tracks.find((t) => t.isDrums)) {
    updated = addTrack(updated, buildTrack("drums", "Drums", "Drum Kit", true));
  }

  if (hasInstrument(message, "bass") && !updated.tracks.find((t) => t.instrument === "Bass")) {
    updated = addTrack(updated, buildTrack("bass", "Bass", "Bass"));
  }

  if (hasInstrument(message, "guitar") && !updated.tracks.find((t) => t.instrument === "Guitar")) {
    updated = addTrack(updated, buildTrack("guitar", "Guitar", "Guitar"));
  }

  updated = ensureMeasureCounts(updated);

  if (wantsMeasure || wantsMore) {
    updated = {
      ...updated,
      tracks: updated.tracks.map((track) => ({
        ...track,
        measures: [...track.measures, createDefaultMeasure(track.measures.length)]
      }))
    };
  }

  if (wantsChords) {
    updated = {
      ...updated,
      chordsBySection: {
        ...(updated.chordsBySection ?? {}),
        Chorus: ["D5", "F5", "G5", "Bb5"],
        Verse: ["D5", "D5", "F5", "G5"]
      }
    };
  }

  const checklist = buildChecklist(updated);
  if (checklist.missing.find((item) => item.id === "tracks")) {
    followUps.push("Which instruments should I include (guitar, bass, drums, synth)?");
  }
  if (checklist.missing.find((item) => item.id === "tempo")) {
    followUps.push("What tempo should we use? You can reply like '140 bpm'.");
  }
  if (checklist.missing.find((item) => item.id === "key")) {
    followUps.push("What key should the song be in?");
  }
  if (checklist.missing.find((item) => item.id === "measures")) {
    followUps.push("How many measures should I draft to start?");
  }
  if (!updated.chordsBySection) {
    followUps.push("Should I generate chord progressions for the verse and chorus?");
  }

  const readyForExport =
    /generate\s*\.?gp5|export|generate file|create gp5/i.test(message) || song.readyForExport;

  const guidedPrompt = nextChecklistPrompt(updated);
  const reply = readyForExport
    ? "I can generate the GP5 file now. Press 'Generate .GP5 File' when you're ready."
    : guidedPrompt ?? "Draft updated. Tell me to add chords, riffs, or more measures.";

  return { song: { ...updated, readyForExport }, reply, followUps };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequest;
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const baseSong = body.song ? validateSong(body.song) : createEmptySong();
    let response: ChatResponse;

    if (process.env.OPENAI_API_KEY) {
      try {
        response = await callOpenAI(message, baseSong);
      } catch (err) {
        response = buildLocalDraft(message, baseSong);
      }
    } else {
      response = buildLocalDraft(message, baseSong);
    }

    const normalized = normalizeSong(response.song, baseSong);
    return NextResponse.json({ ...response, song: normalized });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error generating response.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
