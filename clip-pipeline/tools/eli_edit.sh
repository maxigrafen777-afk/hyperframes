#!/usr/bin/env bash
# Eli-Clips stärker bearbeiten (TikTok „unoriginal“ vermeiden): Farb-/Zoom-Grundlook,
# Zoom-Punch auf den Höhepunkt und Zeitlupen-Wiederholung am Ende.
#   tools/eli_edit.sh <clip.mp4> <ausgabe.mp4> <peak_s im Clip>
set -euo pipefail
in=$1; out=$2; p=$3
F=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
a=$(python3 -c "print(max(0.0,$p-0.6))"); b=$(python3 -c "print(min($dur,$p+2.2))")
r1=$(python3 -c "print(max(0.0,$p-1.6))"); r2=$(python3 -c "print(min($dur,$p+1.6))")
ffmpeg -v error -y -i "$in" -filter_complex "
[0:v]scale=1150:2044,crop=1080:1920,eq=saturation=1.15:contrast=1.06,setsar=1,split=4[v1][v2][v3][v4];
[0:a]asplit=4[a1][a2][a3][a4];
[v1]trim=0:$a,setpts=PTS-STARTPTS[s1];[a1]atrim=0:$a,asetpts=PTS-STARTPTS[t1];
[v2]trim=$a:$b,setpts=PTS-STARTPTS,crop=864:1536:108:250,scale=1080:1920,setsar=1[s2];[a2]atrim=$a:$b,asetpts=PTS-STARTPTS[t2];
[v3]trim=$b,setpts=PTS-STARTPTS[s3];[a3]atrim=$b,asetpts=PTS-STARTPTS[t3];
[v4]trim=$r1:$r2,setpts=2*(PTS-STARTPTS),crop=972:1728:54:120,scale=1080:1920,setsar=1,drawbox=x=(iw-660)/2:y=860:w=660:h=110:color=red@1:t=fill,drawtext=fontfile=$F:text='ZEITLUPE 🔁':fontcolor=white:fontsize=60:x=(w-text_w)/2:y=888[s4];
[a4]atrim=$r1:$r2,asetpts=PTS-STARTPTS,atempo=0.5[t4];
[s1][t1][s2][t2][s3][t3][s4][t4]concat=n=4:v=1:a=1[v][au]" \
  -map "[v]" -map "[au]" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -map_metadata -1 -movflags +faststart "$out"
