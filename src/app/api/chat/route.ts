import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  addTrack,
  createEmptySong,
  ensureMeasureCounts,
  updateMetadata
} from "@/lib/songModel";
import { Song, SongSchema, Track, validateSong } from "@/lib/songSchema";

export const runtime = "nodejs";

type ChatRequest = {
  message: string;
  song?: Song;
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

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Update the song based on this instruction and return JSON only:\n${userPrompt}`
      }
    ]
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  let parsed: ChatResponse;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error("OpenAI did not return valid JSON.");
  }

  const validatedSong = SongSchema.safeParse(parsed.song);
  if (!validatedSong.success) {
    const retry = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
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
      throw new Error("OpenAI failed to repair the JSON response.");
    }
    parsed = JSON.parse(retryContent);
  }

  if (!parsed.song) {
    throw new Error("OpenAI response missing 'song' object.");
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
  return measures
    .filter((measure) => typeof measure?.index === "number" && Array.isArray(measure?.beats))
    .map((measure) => ({
      ...measure,
      beats: measure.beats ?? []
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

  if (tempo) {
    updated = updateMetadata(updated, { tempo });
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

  if (updated.tracks.length === 0) {
    followUps.push("What instruments should the song include (e.g. guitar, bass, drums)?");
  }

  if (!tempo) {
    followUps.push("What tempo should we use? You can reply like '120 bpm'.");
  }

  if (!key) {
    followUps.push("What key do you want the song in?");
  }

  const readyForExport =
    /generate\s*\.?gp5|export|generate file|create gp5/i.test(message) || song.readyForExport;

  const reply = readyForExport
    ? "I can generate the GP5 file now. Press 'Generate .GP5 File' when you're ready."
    : "Got it. I updated the song settings and track list based on your request.";

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
        const fallback = applyMessageToSong(baseSong, message);
        response = {
          ...fallback,
          reply:
            "I hit an AI formatting error, so I used a simple fallback. Try again or refine your request.",
          followUps: fallback.followUps
        };
      }
    } else {
      const fallback = applyMessageToSong(baseSong, message);
      response = { ...fallback };
    }

    const normalized = normalizeSong(response.song, baseSong);
    return NextResponse.json({ ...response, song: normalized });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected error generating response.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
