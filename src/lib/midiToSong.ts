import { parseMidi } from "midi-file";
import { Song, Track } from "@/lib/songSchema";
import { mapMidiToStringFret, defaultTuningForTrack } from "@/lib/noteMapping";

type MidiTrackEvent = {
  deltaTime: number;
  type: string;
  subtype?: string;
  noteNumber?: number;
  velocity?: number;
  channel?: number;
};

function ensureTrack(name: string, instrument: string, isDrums: boolean): Track {
  return {
    id: name.toLowerCase(),
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

export function midiToSong(baseSong: Song, midiBytes: Buffer): Song {
  const midi = parseMidi(midiBytes);
  const ticksPerBeat = midi.header.ticksPerBeat ?? 480;
  const beatsPerMeasure = 4;
  const ticksPerMeasure = ticksPerBeat * beatsPerMeasure;

  const tracks: Track[] = [
    ensureTrack("Guitar", "Guitar", false),
    ensureTrack("Bass", "Bass", false),
    ensureTrack("Drums", "Drum Kit", true)
  ];

  midi.tracks.slice(1).forEach((track, trackIndex) => {
    let absolute = 0;
    const targetTrack = tracks[Math.min(trackIndex, tracks.length - 1)];
    const tuning = defaultTuningForTrack(targetTrack);

    track.forEach((event: MidiTrackEvent) => {
      absolute += event.deltaTime;
      if (event.type !== "channel" || event.subtype !== "noteOn") return;
      if (!event.noteNumber || (event.velocity ?? 0) === 0) return;

      const measureIndex = Math.floor(absolute / ticksPerMeasure);
      const beatIndex = Math.floor((absolute % ticksPerMeasure) / ticksPerBeat);

      while (targetTrack.measures.length <= measureIndex) {
        targetTrack.measures.push({ index: targetTrack.measures.length, beats: [] });
      }

      const measure = targetTrack.measures[measureIndex];
      const { string, fret } = mapMidiToStringFret(event.noteNumber, tuning);
      const beat = {
        start: beatIndex,
        notes: [
          {
            type: "note" as const,
            string,
            fret,
            duration: { numerator: 1, denominator: 4, dotted: false },
            velocity: event.velocity ?? 90,
            midiPitch: event.noteNumber
          }
        ]
      };
      measure.beats.push(beat);
    });
  });

  return {
    ...baseSong,
    tracks
  };
}
