import { NextResponse } from "next/server";
import { validateSong } from "@/lib/songSchema";

export const runtime = "nodejs";

const MIDI_GEN_URL = process.env.MIDI_GEN_URL;

export async function POST(request: Request) {
  if (!MIDI_GEN_URL) {
    return NextResponse.json({ error: "MIDI_GEN_URL is not configured." }, { status: 500 });
  }

  const body = await request.json();
  const song = validateSong(body);
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
    const detail = await response.text();
    return NextResponse.json({ error: "MIDI generator failed.", detail }, { status: 502 });
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return new NextResponse(buffer, {
    status: 200,
    headers: { "Content-Type": "audio/midi" }
  });
}
