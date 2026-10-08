"""Convert cue mp3 files in this folder to short mono AAC-LC .m4a files.

Needs ffmpeg and ffprobe on PATH. Output sits next to the source and is
what sounds.json should name: AAC-LC, mono, about 40 kbit/s, at most 0.5 s.
"""

import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MAX_SECONDS = 0.5
BITRATE = "40k"
# Drop leading silence, then trailing silence. Internal gaps stay.
TRIM = (
    "silenceremove="
    "start_periods=1:start_duration=0.02:start_threshold=-40dB:"
    "stop_periods=-1:stop_duration=0.04:stop_threshold=-40dB"
)


def run(args):
    done = subprocess.run(args, capture_output=True, text=True)
    if done.returncode != 0:
        sys.stderr.write(done.stderr)
        raise SystemExit(done.returncode)


def duration(path):
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "csv=p=0",
            str(path),
        ],
        text=True,
    )
    return float(out.strip())


def convert(src: Path):
    dest = src.with_suffix(".m4a")
    trimmed = src.with_suffix(".trim.wav")
    run([
        "ffmpeg", "-y", "-i", str(src),
        "-ac", "1", "-ar", "44100",
        "-af", TRIM,
        str(trimmed),
    ])
    length = duration(trimmed)
    filters = []
    if length > MAX_SECONDS:
        fade = 0.04
        start = MAX_SECONDS - fade
        filters = ["-af", f"atrim=end={MAX_SECONDS},afade=t=out:st={start:.3f}:d={fade}"]
    run([
        "ffmpeg", "-y", "-i", str(trimmed),
        "-ac", "1",
        "-c:a", "aac", "-profile:a", "aac_low", "-b:a", BITRATE,
        "-movflags", "+faststart",
        *filters,
        str(dest),
    ])
    trimmed.unlink()
    final = duration(dest)
    print(f"{src.name} -> {dest.name}  {length:.3f}s trimmed, {final:.3f}s aac")


def main():
    sources = sorted(HERE.glob("*.mp3"))
    if not sources:
        raise SystemExit(f"no mp3 files in {HERE}")
    for src in sources:
        convert(src)


if __name__ == "__main__":
    main()
