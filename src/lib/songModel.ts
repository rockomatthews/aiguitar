import { Measure, Song, Track, validateSong } from "./songSchema";

export function createEmptySong(): Song {
  return validateSong({
    metadata: {
      title: "Untitled",
      artist: "Unknown Artist",
      tempo: 120,
      keySignature: "C",
      timeSignature: { beats: 4, beatType: 4 },
      version: "5.00"
    },
    sections: [],
    tracks: []
  });
}

export function ensureMeasureCounts(song: Song): Song {
  const maxMeasures = song.tracks.reduce(
    (max, track) => Math.max(max, track.measures.length),
    0
  );

  const normalizedTracks = song.tracks.map((track) => {
    if (track.measures.length === maxMeasures) {
      return track;
    }

    const padding = Array.from({ length: maxMeasures - track.measures.length }, (_, i) => ({
      index: track.measures.length + i,
      beats: []
    }));

    return {
      ...track,
      measures: [...track.measures, ...padding]
    };
  });

  return {
    ...song,
    tracks: normalizedTracks
  };
}

export function addTrack(song: Song, track: Track): Song {
  return ensureMeasureCounts({
    ...song,
    tracks: [...song.tracks, track]
  });
}

export function updateMetadata(song: Song, metadata: Partial<Song["metadata"]>): Song {
  return {
    ...song,
    metadata: {
      ...song.metadata,
      ...metadata
    }
  };
}

export function summarizeSong(song: Song): string {
  const trackList = song.tracks.map((track) => track.name).join(", ") || "no tracks";
  const measureCount = song.tracks[0]?.measures.length ?? 0;

  return `Title: ${song.metadata.title}; Tempo: ${song.metadata.tempo} BPM; Tracks: ${trackList}; Measures: ${measureCount}`;
}

function createDefaultMeasure(index: number): Measure {
  return {
    index,
    beats: [
      {
        start: 0,
        notes: [
          {
            type: "note",
            string: 6,
            fret: 0,
            duration: { numerator: 1, denominator: 4, dotted: false },
            velocity: 90
          }
        ]
      }
    ]
  };
}

function createDefaultTrack(): Track {
  return {
    id: "guitar",
    name: "Guitar",
    instrument: "Guitar",
    isDrums: false,
    stringCount: 6,
    tuning: [40, 45, 50, 55, 59, 64],
    capo: 0,
    volume: 100,
    pan: 64,
    measures: [createDefaultMeasure(0)]
  };
}

export function ensureMinimumSong(song: Song): Song {
  if (song.tracks.length === 0) {
    return {
      ...song,
      tracks: [createDefaultTrack()]
    };
  }

  const tracks = song.tracks.map((track) => {
    if (!track.measures || track.measures.length === 0) {
      return { ...track, measures: [createDefaultMeasure(0)] };
    }

    const measures = track.measures.map((measure, index) => ({
      ...measure,
      index: typeof measure.index === "number" ? measure.index : index,
      beats: measure.beats?.length ? measure.beats : [createDefaultMeasure(index).beats[0]]
    }));

    return { ...track, measures };
  });

  return { ...song, tracks };
}
