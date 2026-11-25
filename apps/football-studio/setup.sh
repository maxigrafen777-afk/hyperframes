#!/usr/bin/env bash
# Einmalige Einrichtung: Python-Umgebung, Abhängigkeiten, lokale deutsche Stimme, HyperFrames-CLI.
set -euo pipefail
cd "$(dirname "$0")"
command -v ffmpeg >/dev/null || { echo "ffmpeg fehlt (z. B. 'brew install ffmpeg' / 'apt install ffmpeg')"; exit 1; }
command -v npx >/dev/null || { echo "Node.js 22+ fehlt (npx wird für HyperFrames benötigt)"; exit 1; }
python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
.venv/bin/python - <<'PY'
from football_studio.voice import ensure_piper_voice
from football_studio.config import Settings, ensure_dirs
ensure_dirs()
print("Piper-Stimme:", ensure_piper_voice(Settings().piper_voice))
PY
HYPERFRAMES_SKIP_SKILLS=1 npx -y hyperframes@0.9.94 --version >/dev/null && echo "HyperFrames-CLI bereit"
echo "Fertig. Start: ./run.sh  →  http://127.0.0.1:8765"
