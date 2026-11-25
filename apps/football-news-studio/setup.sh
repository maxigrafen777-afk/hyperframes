#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v ffmpeg >/dev/null || { echo "ffmpeg fehlt: macOS 'brew install ffmpeg', Linux 'sudo apt install ffmpeg'"; exit 1; }
python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
.venv/bin/python -c "from newsstudio.config import ensure_dirs; from newsstudio.voice.engine import ensure_piper_voice; from newsstudio.config import Settings; ensure_dirs(); ensure_piper_voice(Settings().piper_voice); print('Stimme bereit')"
echo "Fertig. Start mit ./run.sh"
