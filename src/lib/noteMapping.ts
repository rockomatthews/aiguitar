import { Track } from "@/lib/songSchema";

const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];

export function mapMidiToStringFret(
  midi: number,
  tuning: number[] = STANDARD_TUNING
): { string: number; fret: number } {
  let bestString = 1;
  let bestFret = 0;
  tuning.forEach((openMidi, index) => {
    const fret = midi - openMidi;
    if (fret >= 0 && fret <= 24) {
      bestString = index + 1;
      bestFret = fret;
    }
  });
  return { string: bestString, fret: bestFret };
}

export function defaultTuningForTrack(track: Track): number[] {
  return track.tuning?.length ? track.tuning : STANDARD_TUNING;
}
