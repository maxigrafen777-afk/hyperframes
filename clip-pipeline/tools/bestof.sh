#!/usr/bin/env bash
# Top-5-Best-of aus fünf fertigen 9:16-Schnipseln bauen.
# 23.11. (Nutzerzahlen: Ø 8,8 s Wiedergabe beim alten Format): ganz vorne 2,5 s vom
# stärksten Moment (#1) als Action-Einstieg mit „WARTE AUF PLATZ 1“, danach #5→#1.
# Platzierung nur klein unten rechts, keine Titelzeile – pro Bild höchstens ein Text.
#   TEASER=<start_s im #1-Schnipsel> tools/bestof.sh <streamer> <ausgabe.mp4> <#5> <#4> <#3> <#2> <#1>
set -euo pipefail
name=$1; out=$2; shift 2
F=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
tz=${TEASER:-0}
IN=(-ss "$tz" -t 2.5 -i "${@: -1}"); i=1; n=5
FC="[0:v]scale=1080:1920,setsar=1,fps=30,drawbox=x=140:y=1560:w=800:h=130:color=0xE61E1E@1:t=fill,drawtext=fontfile=$F:text='WARTE AUF PLATZ 1':fontcolor=white:fontsize=66:borderw=3:bordercolor=black:x=(w-text_w)/2:y=1592[v0];"
FC+="[0:a]aresample=48000,aformat=channel_layouts=stereo[a0];"
for f in "$@"; do
  IN+=(-i "$f")
  FC+="[$i:v]scale=1080:1920,setsar=1,fps=30,drawtext=fontfile=$F:text='#$n':fontcolor=white:fontsize=150:borderw=8:bordercolor=0xE61E1E:x=w-text_w-50:y=h-text_h-160[v$i];"
  FC+="[$i:a]aresample=48000,aformat=channel_layouts=stereo[a$i];"
  i=$((i+1)); n=$((n-1))
done
FC+="[v0][a0][v1][a1][v2][a2][v3][a3][v4][a4][v5][a5]concat=n=6:v=1:a=1[v][a]"
ffmpeg -v error -y "${IN[@]}" -filter_complex "$FC" -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 19 \
  -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "$out"
