#!/usr/bin/env bash
# Clip in den Nacht-Ordner legen: tools/night_add.sh <id>
set -euo pipefail
cd "$(dirname "$0")/.."
id=$1; d=data/clips/$id; n=data/nacht
mkdir -p "$n"
s=$(python3 -c "import sqlite3;print(sqlite3.connect('data/pipeline.sqlite3').execute('select streamer from clips where id=$id').fetchone()[0].split(':')[1])")
cp "$d/clip.mp4" "$n/${id}_${s}.mp4"; cp "$d/post.txt" "$n/${id}_${s}.txt"
echo "$n/${id}_${s}.mp4"
