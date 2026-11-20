#!/usr/bin/env bash
# Top-5-Best-of aus fünf fertigen 9:16-Clips bauen: Zahlen 5→1, Titelzeile am Anfang.
#   tools/bestof.sh <streamer> <ausgabe.mp4> <clip#5> <clip#4> <clip#3> <clip#2> <clip#1>
set -euo pipefail
name=$1; out=$2; shift 2
F=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
title="TOP 5 ${name^^} MOMENTE"
IN=(); FC=""; i=0; n=5
for f in "$@"; do
  IN+=(-i "$f"); extra=""
  if [ $n = 5 ]; then
    extra=",drawbox=x=90:y=1700:w=900:h=120:color=black@0.75:t=fill:enable='lt(t,3)',drawtext=fontfile=$F:text='$title':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=1728:enable='lt(t,3)'"
  fi
  FC+="[$i:v]scale=1080:1920,setsar=1,fps=30,drawtext=fontfile=$F:text='#$n':fontcolor=white:fontsize=280:borderw=12:bordercolor=red:x=(w-text_w)/2:y=1360:enable='lt(t,2.2)'$extra[v$i];"
  FC+="[$i:a]aresample=48000,aformat=channel_layouts=stereo[a$i];"
  i=$((i+1)); n=$((n-1))
done
FC+="[v0][a0][v1][a1][v2][a2][v3][a3][v4][a4]concat=n=5:v=1:a=1[v][a]"
ffmpeg -v error -y "${IN[@]}" -filter_complex "$FC" -map "[v]" -map "[a]" -c:v libx264 -preset medium -crf 21 \
  -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "$out"
