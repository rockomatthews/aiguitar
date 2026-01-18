from io import BytesIO
from typing import Any, Dict, List, Optional

import guitarpro as gp
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response


app = FastAPI(title="GP5 Writer Service")


def _duration_from_fraction(numerator: int, denominator: int) -> gp.Duration:
    value_map = {
        1: gp.Duration.whole,
        2: gp.Duration.half,
        4: gp.Duration.quarter,
        8: gp.Duration.eighth,
        16: gp.Duration.sixteenth,
        32: gp.Duration.thirtySecond,
        64: gp.Duration.sixtyFourth,
    }
    duration = gp.Duration(value_map.get(denominator, gp.Duration.quarter))
    if numerator != 1:
        duration.isDotted = True
    return duration


def _duration_from_denominator(denominator: int) -> gp.Duration:
    return _duration_from_fraction(1, denominator)


def _guitar_strings(tuning: Optional[List[int]]) -> List[gp.GuitarString]:
    if not tuning:
        tuning = [40, 45, 50, 55, 59, 64]
    return [gp.GuitarString(idx + 1, value) for idx, value in enumerate(tuning)]


def _parse_key_signature(value: Optional[str]) -> gp.KeySignature:
    if not value:
        return gp.KeySignature.CMajor
    normalized = value.strip().lower().replace("key of", "").strip()
    mode = "minor" if "minor" in normalized else "major"
    token = normalized.replace("major", "").replace("minor", "").strip()
    if not token:
        token = "c"
    letter = token[0].upper()
    accidental = ""
    if len(token) > 1:
        if "#" in token:
            accidental = "Sharp"
        elif "b" in token:
            accidental = "Flat"
    enum_name = f"{letter}{mode.capitalize()}{accidental}"
    return getattr(gp.KeySignature, enum_name, gp.KeySignature.CMajor)


def _build_track(song: gp.Song, data: Dict[str, Any]) -> gp.Track:
    track = gp.Track(song)
    track.name = data.get("name", "Track")
    track.isPercussionTrack = bool(data.get("isDrums", False))
    track.instrument = data.get("instrument", "Guitar")
    track.strings = _guitar_strings(data.get("tuning"))
    track.capo = int(data.get("capo", 0))
    track.channel.volume = int(data.get("volume", 100))
    track.channel.pan = int(data.get("pan", 64))
    return track


def _apply_measure_header(header: Dict[str, Any]) -> gp.MeasureHeader:
    measure_header = gp.MeasureHeader()
    time_signature = header.get("timeSignature")
    if time_signature:
        denominator = _duration_from_denominator(time_signature.get("beatType", 4))
        measure_header.timeSignature = gp.TimeSignature(
            time_signature.get("beats", 4),
            denominator,
        )
    if header.get("repeatStart"):
        measure_header.repeatOpen = True
    if header.get("repeatEnd"):
        measure_header.repeatClose = 2
    if header.get("marker"):
        measure_header.marker = gp.Marker(header.get("marker"), gp.RGBColor(40, 40, 40))
    return measure_header


def _add_measure_content(measure: gp.Measure, beats: List[Dict[str, Any]]) -> None:
    voice = measure.voices[0]
    for beat_data in beats:
        beat = gp.Beat(voice)
        beat.status = gp.BeatStatus.normal
        duration = beat_data.get("notes", [{}])[0].get("duration", {})
        beat.duration = _duration_from_fraction(
            duration.get("numerator", 1), duration.get("denominator", 4)
        )
        for note_data in beat_data.get("notes", []):
            if note_data.get("type") == "rest":
                beat.status = gp.BeatStatus.rest
                continue
            note = gp.Note(beat)
            note.string = int(note_data.get("string", 1))
            note.value = int(note_data.get("fret", 0))
            note.type = gp.NoteType.normal
            beat.notes.append(note)
        voice.beats.append(beat)


def song_from_schema(schema: Dict[str, Any]) -> gp.Song:
    song = gp.Song()
    metadata = schema.get("metadata", {})
    song.title = metadata.get("title", "Untitled")
    song.artist = metadata.get("artist", "Unknown Artist")
    song.tempo = int(metadata.get("tempo", 120))
    song.key = _parse_key_signature(metadata.get("keySignature"))
    default_time_signature = metadata.get("timeSignature", {"beats": 4, "beatType": 4})
    song.measureHeaders = []

    tracks_data = schema.get("tracks", [])
    if not tracks_data:
        raise ValueError("At least one track is required.")

    measure_count = max(len(track.get("measures", [])) for track in tracks_data)
    for index in range(measure_count):
        header_data = {}
        for track in tracks_data:
            header_candidate = track.get("measures", [{}])[index].get("header")
            if header_candidate:
                header_data = header_candidate
                break
        if not header_data:
            header_data = {"timeSignature": default_time_signature}
        song.measureHeaders.append(_apply_measure_header(header_data))

    song.tracks = []
    for track_data in tracks_data:
        track = _build_track(song, track_data)
        track.measures = []
        for index, measure_header in enumerate(song.measureHeaders):
            measure = gp.Measure(track, measure_header)
            beats = track_data.get("measures", [{}])[index].get("beats", [])
            _add_measure_content(measure, beats)
            track.measures.append(measure)
        song.tracks.append(track)

    return song


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/write")
def write_gp5(payload: Dict[str, Any]) -> Response:
    try:
        song = song_from_schema(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    output = BytesIO()
    gp.write(song, output)
    return Response(content=output.getvalue(), media_type="application/octet-stream")
