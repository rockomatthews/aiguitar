import { NextResponse } from "next/server";
import { validateSong } from "@/lib/songSchema";

export const runtime = "nodejs";

const GP5_WRITER_URL = process.env.GP5_WRITER_URL;

export async function POST(request: Request) {
  if (!GP5_WRITER_URL) {
    return NextResponse.json(
      { error: "GP5_WRITER_URL is not configured on the server." },
      { status: 500 }
    );
  }
  const body = await request.json();
  const song = validateSong(body);

  const response = await fetch(`${GP5_WRITER_URL}/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(song)
  });

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json(
      {
        error: "GP5 writer service failed.",
        detail,
        writerUrl: GP5_WRITER_URL
      },
      { status: 502 }
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${song.metadata.title || "song"}.gp5"`
    }
  });
}
