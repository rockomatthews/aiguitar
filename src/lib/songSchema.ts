import { z } from "zod";

export const TimeSignatureSchema = z.object({
  beats: z.number().int().min(1).max(32),
  beatType: z.number().int().min(1).max(32)
});

export const DurationSchema = z.object({
  numerator: z.number().int().min(1).max(64),
  denominator: z.number().int().min(1).max(64),
  dotted: z.boolean().default(false),
  tuplet: z
    .object({
      inTimeOf: z.number().int().min(1).max(9),
      notes: z.number().int().min(1).max(9)
    })
    .optional()
});

export const NoteEffectSchema = z
  .object({
    slide: z.boolean().optional(),
    bend: z
      .object({
        type: z.enum(["bend", "release", "bendRelease", "prebend"]),
        value: z.number().int().min(0).max(12)
      })
      .optional(),
    hammerOn: z.boolean().optional(),
    pullOff: z.boolean().optional(),
    vibrato: z.boolean().optional(),
    palmMute: z.boolean().optional(),
    letRing: z.boolean().optional()
  })
  .default({});

export const NoteSchema = z.object({
  type: z.enum(["note", "rest"]),
  string: z.number().int().min(1).max(12).optional(),
  fret: z.number().int().min(0).max(36).optional(),
  midiPitch: z.number().int().min(0).max(127).optional(),
  duration: DurationSchema,
  velocity: z.number().int().min(1).max(127).default(90),
  effects: NoteEffectSchema.optional()
});

export const BeatSchema = z.object({
  start: z.number().min(0),
  notes: z.array(NoteSchema),
  chordName: z.string().optional(),
  text: z.string().optional()
});

export const MeasureHeaderSchema = z.object({
  timeSignature: TimeSignatureSchema.optional(),
  keySignature: z.string().optional(),
  repeatStart: z.boolean().optional(),
  repeatEnd: z.boolean().optional(),
  alternateEnding: z.number().int().min(0).max(8).optional(),
  marker: z.string().optional(),
  tripletFeel: z.enum(["none", "eighth", "sixteenth"]).optional()
});

export const MeasureSchema = z.object({
  index: z.number().int().min(0),
  header: MeasureHeaderSchema.optional(),
  beats: z.array(BeatSchema),
  lyrics: z.string().optional()
});

export const TrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  instrument: z.string(),
  isDrums: z.boolean().default(false),
  stringCount: z.number().int().min(1).max(12).optional(),
  tuning: z.array(z.number().int().min(0).max(127)).optional(),
  capo: z.number().int().min(0).max(24).default(0),
  volume: z.number().int().min(0).max(127).default(100),
  pan: z.number().int().min(0).max(127).default(64),
  measures: z.array(MeasureSchema)
});

export const SectionSchema = z.object({
  name: z.string(),
  startMeasure: z.number().int().min(0),
  length: z.number().int().min(1)
});

export const SongMetadataSchema = z.object({
  title: z.string().default("Untitled"),
  artist: z.string().default("Unknown Artist"),
  album: z.string().optional(),
  tempo: z.number().int().min(30).max(300).default(120),
  tempoName: z.string().optional(),
  keySignature: z.string().default("C"),
  timeSignature: TimeSignatureSchema.default({ beats: 4, beatType: 4 }),
  version: z.string().default("5.00")
});

export const SongSchema = z.object({
  metadata: SongMetadataSchema,
  sections: z.array(SectionSchema).default([]),
  tracks: z.array(TrackSchema),
  draftText: z.string().optional(),
  chordsBySection: z
    .record(z.string(), z.array(z.string()))
    .optional(),
  readyForExport: z.boolean().default(false)
});

export type Song = z.infer<typeof SongSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Measure = z.infer<typeof MeasureSchema>;

export function validateSong(input: unknown): Song {
  return SongSchema.parse(input);
}
