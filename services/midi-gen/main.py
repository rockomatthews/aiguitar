from io import BytesIO
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from mido import Message, MidiFile, MidiTrack, MetaMessage, bpm2tempo


app = FastAPI(title="MIDI Generator Service")


def _parse_tempo(payload: Dict[str, Any]) -> int:
    tempo = payload.get("tempo") or payload.get("metadata", {}).get("tempo") or 120
    try:
        return int(tempo)
    except (TypeError, ValueError):
        return 120


def _parse_measures(payload: Dict[str, Any]) -> int:
    measures = payload.get("measures") or payload.get("length") or 8
    try:
        return max(1, int(measures))
    except (TypeError, ValueError):
        return 8


def _parse_key(payload: Dict[str, Any]) -> str:
    key = payload.get("key") or payload.get("metadata", {}).get("keySignature") or "C"
    return str(key)


def _progression_for_key(key: str) -> List[int]:
    # Simple default progression in MIDI root notes (C, Eb, F, Gb style)
    base = 48  # C3
    return [base, base + 3, base + 5, base + 8]


def _build_track(name: str, program: int, notes: List[int], measures: int, ppq: int, channel: int) -> MidiTrack:
    track = MidiTrack()
    track.append(MetaMessage("track_name", name=name, time=0))
    if channel != 9:
        track.append(Message("program_change", program=program, channel=channel, time=0))

    ticks_per_beat = ppq
    ticks_per_measure = ticks_per_beat * 4

    for measure_idx in range(measures):
        root = notes[measure_idx % len(notes)]
        for beat in range(4):
            start_time = 0 if (measure_idx == 0 and beat == 0) else ticks_per_beat
            note_on = Message("note_on", note=root, velocity=90, channel=channel, time=start_time)
            note_off = Message("note_off", note=root, velocity=0, channel=channel, time=ticks_per_beat)
            track.append(note_on)
            track.append(note_off)
        # compensate for measure length if last beat added extra
        track[-1].time = ticks_per_measure - (ticks_per_beat * 4) + track[-1].time

    return track


def _build_drum_track(measures: int, ppq: int) -> MidiTrack:
    track = MidiTrack()
    track.append(MetaMessage("track_name", name="Drums", time=0))
    ticks_per_beat = ppq
    ticks_per_measure = ticks_per_beat * 4

    kick = 36
    snare = 38
    hat = 42

    for measure_idx in range(measures):
        for beat in range(4):
            time = 0 if (measure_idx == 0 and beat == 0) else ticks_per_beat
            note = kick if beat in (0, 2) else snare
            track.append(Message("note_on", note=note, velocity=90, channel=9, time=time))
            track.append(Message("note_off", note=note, velocity=0, channel=9, time=int(ticks_per_beat * 0.5)))
            track.append(Message("note_on", note=hat, velocity=60, channel=9, time=0))
            track.append(Message("note_off", note=hat, velocity=0, channel=9, time=int(ticks_per_beat * 0.5)))
        track[-1].time = ticks_per_measure - (ticks_per_beat * 4) + track[-1].time

    return track


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/generate")
def generate(payload: Dict[str, Any]) -> Response:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload.")

    tempo_bpm = _parse_tempo(payload)
    measures = _parse_measures(payload)
    key = _parse_key(payload)
    progression = _progression_for_key(key)

    midi = MidiFile(type=1)
    midi.ticks_per_beat = 480

    meta_track = MidiTrack()
    meta_track.append(MetaMessage("set_tempo", tempo=bpm2tempo(tempo_bpm), time=0))
    meta_track.append(MetaMessage("time_signature", numerator=4, denominator=4, time=0))
    midi.tracks.append(meta_track)

    midi.tracks.append(_build_track("Guitar", program=30, notes=progression, measures=measures, ppq=midi.ticks_per_beat, channel=0))
    midi.tracks.append(_build_track("Bass", program=32, notes=progression, measures=measures, ppq=midi.ticks_per_beat, channel=1))
    midi.tracks.append(_build_drum_track(measures=measures, ppq=midi.ticks_per_beat))

    buffer = BytesIO()
    midi.save(file=buffer)
    return Response(content=buffer.getvalue(), media_type="audio/midi")
