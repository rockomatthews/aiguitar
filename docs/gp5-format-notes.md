# GP5 Format Notes

This project targets Guitar Pro 5 (`.gp5`) output. The format is proprietary and
binary, so the writer service uses the PyGuitarPro library to handle serialization.

Key aspects to consider:

- Version strings (e.g. `5.00`) must be consistent with GP5 readers.
- Track settings include tuning, string count, and MIDI channel parameters.
- Measure headers must preserve time signatures, repeats, and markers.
- Beats are grouped into voices; note durations are encoded as denominator values.
- Effects (slides, bends, hammer-on/pull-off) are stored as note flags and
  serialized per beat.

For reference, see PyGuitarPro documentation and open-source GP5 parsers for
format reverse engineering.
