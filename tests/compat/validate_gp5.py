import json
import os
import sys
from io import BytesIO
from urllib import request as urlrequest


def load_fixture(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def fetch_gp5(payload: dict, writer_url: str) -> bytes:
    data = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(
        f"{writer_url}/write",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlrequest.urlopen(req) as response:
        return response.read()


def validate_gp5_bytes(content: bytes) -> None:
    try:
        import guitarpro as gp  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "pyguitarpro is required to validate GP5 files. Install it first."
        ) from exc

    song = gp.parse(BytesIO(content))
    if not song.tracks:
        raise RuntimeError("No tracks were found in the generated GP5 file.")
    if song.tempo <= 0:
        raise RuntimeError("Invalid tempo detected in GP5 file.")


def main() -> int:
    writer_url = os.environ.get("GP5_WRITER_URL", "http://localhost:8000")
    fixture_path = os.environ.get(
        "GP5_FIXTURE_PATH", "tests/fixtures/sample_song.json"
    )

    payload = load_fixture(fixture_path)
    content = fetch_gp5(payload, writer_url)
    validate_gp5_bytes(content)
    print("GP5 validation succeeded.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
