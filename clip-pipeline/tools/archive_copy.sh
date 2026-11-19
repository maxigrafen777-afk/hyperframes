#!/usr/bin/env bash
# Archiv-Kopie eines Clips unter 19 MB (Upload-Grenze des Clip-Archivs: 20 MB).
# Nutzung: tools/archive_copy.sh <clip-id>  ->  data/archive/<id>.mp4
set -euo pipefail
cd "$(dirname "$0")/.."
id=$1; src=data/clips/$id/clip.mp4; out=data/archive/$id.mp4
mkdir -p data/archive
size=$(stat -c %s "$src")
if [ "$size" -lt 19000000 ]; then cp "$src" "$out"; echo "$out (kopiert)"; exit 0; fi
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
vk=$(python3 -c "print(int(min(5500, 18.0*8000/$dur - 160)))")
ffmpeg -v error -y -i "$src" -c:v libx264 -preset medium -b:v ${vk}k -maxrate ${vk}k -bufsize $((vk*2))k \
  -c:a aac -b:a 128k -movflags +faststart "$out"
echo "$out ($(($(stat -c %s "$out")/1000000)) MB, ${vk}k)"
