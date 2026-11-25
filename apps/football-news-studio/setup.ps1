$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Write-Host "ffmpeg fehlt: 'winget install Gyan.FFmpeg' ausführen und PowerShell neu öffnen"; exit 1 }
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -q --upgrade pip
.\.venv\Scripts\python.exe -m pip install -q -r requirements.txt
.\.venv\Scripts\python.exe -c "from newsstudio.config import ensure_dirs, Settings; from newsstudio.voice.engine import ensure_piper_voice; ensure_dirs(); ensure_piper_voice(Settings().piper_voice); print('Stimme bereit')"
Write-Host "Fertig. Start mit .\run.ps1"
