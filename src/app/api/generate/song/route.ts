import { NextResponse } from "next/server";
import OpenAI from "openai";
import { Song, SongSchema } from "@/lib/songSchema";
import { createEmptySong, ensureMusicalSong } from "@/lib/songModel";
import { midiToSong } from "@/lib/midiToSong";

export const runtime = "nodejs";

const MIDI_GEN_URL = process.env.MIDI_GEN_URL;
const SONGWRITER_API_KEY = process.env.SONGWRITER_API_KEY ?? process.env.OPENAI_API_KEY;
const SONGWRITER_BASE_URL = process.env.SONGWRITER_BASE_URL;
const SONGWRITER_MODEL = process.env.SONGWRITER_MODEL ?? "gpt-4o-mini";

type SongwriterRequest = {
  title: string;
  genre: string;
};

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

function sanitizeMeasures(measures: Song["tracks"][number]["measures"]) {
  return measures.map((measure, index) => ({
    ...measure,
    index: typeof measure?.index === "number" ? measure.index : index,
    beats: Array.isArray(measure?.beats) ? measure.beats : []
  }));
}

function sanitizeTracks(tracks: Song["tracks"]) {
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

async function callSongwriterAI(title: string, genre: string): Promise<Song> {
  if (!SONGWRITER_API_KEY) {
    throw new Error("SONGWRITER_API_KEY (or OPENAI_API_KEY) is not configured.");
  }

  const client = new OpenAI({
    apiKey: SONGWRITER_API_KEY,
    baseURL: SONGWRITER_BASE_URL || undefined
  });

  const systemPrompt = `
You are a songwriter assistant that outputs a full Guitar Pro song schema as JSON.
Return strict JSON with a top-level key "song" and nothing else.
The song must include:
- metadata (title, tempo, keySignature, timeSignature)
- sections with startMeasure and length
- tracks with measures and beats
- draftText (full lyrics + section map)
- chordsBySection (map of section name to chord list)
- readyForExport set to true

The output must match the schema. Do not include markdown.
`.trim();

  const userPrompt = JSON.stringify({
    title,
    genre,
    instruction:
      "Write a complete song with lyrics, chord progression, and a sectioned structure. Ensure multiple measures per track."
  });

  const response = await client.chat.completions.create({
    model: SONGWRITER_MODEL,
    temperature: 0.5,
    response_format: { type: "json_object" },
    max_tokens: 1500,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Songwriter AI returned an empty response.");
  }

  const parsed = JSON.parse(content) as { song?: Song };
  if (!parsed.song) {
    throw new Error("Songwriter AI response is missing the song object.");
  }

  const validated = SongSchema.parse(parsed.song);
  return validated;
}

async function mergeWithMidi(song: Song): Promise<Song> {
  if (!MIDI_GEN_URL) return song;
  const response = await fetch(`${MIDI_GEN_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tempo: song.metadata.tempo,
      key: song.metadata.keySignature,
      measures: song.tracks[0]?.measures.length || 8
    })
  });

  if (!response.ok) {
    return song;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const withMidi = midiToSong(song, buffer);
  return { ...song, tracks: withMidi.tracks };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SongwriterRequest;
    const title = payload.title?.trim();
    const genre = payload.genre?.trim();
    if (!title || !genre) {
      return NextResponse.json({ error: "Title and genre are required." }, { status: 400 });
    }

    const baseSong = createEmptySong();
    let song = await callSongwriterAI(title, genre);
    song = normalizeSong(song, baseSong);
    song = { ...song, readyForExport: true };
    song = await mergeWithMidi(song);
    song = ensureMusicalSong(song);

    return NextResponse.json({ song, reply: song.draftText ?? "Song generated.", followUps: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error generating song.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
