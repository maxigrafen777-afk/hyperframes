#!/usr/bin/env bash
# Cold-Open für 1-Minuten-Clips: der Höhepunkt (~2,5 s, leicht gezoomt) läuft ganz vorne,
# dann ein kurzer Weißblitz und der Clip von Anfang an. Hält Zuschauer über die volle Minute.
# Der rote Hook steht schon ab dem ersten Frame (Nutzer 22.11.): er wird aus clip.ass neben
# dem Clip auch über den Teaser gelegt und läuft danach im Clip selbst weiter.
#   tools/teaser.sh <clip.mp4> <ausgabe.mp4> <peak_s im Clip> [teaser_s=2.5] [gamma=1.0]
set -euo pipefail
in=$1; out=$2; p=$3; len=${4:-2.5}; gam=${5:-1.0}  # 5. Argument: Gamma >1 hellt dunkle Nachtszenen im Teaser auf
here=$(cd "$(dirname "$0")/.." && pwd)
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
a=$(python3 -c "print(max(0.0,min($dur-$len,$p-0.9)))")
hook=""
ass="$(dirname "$in")/clip.ass"
if [ -f "$ass" ]; then
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  python3 - "$ass" "$tmp/hook.ass" "$len" <<'EOF'
import re, sys
src, dst, length = sys.argv[1], sys.argv[2], float(sys.argv[3])
end = "0:00:%05.2f" % length
out = []
for line in open(src, encoding="utf-8"):
    if line.startswith("Dialogue:"):
        f = line.split(",", 9)
        if f[3] not in ("Hook", "HookBox"):
            continue
        f[2] = end
        f[9] = re.sub(r"\\fad\([^)]*\)", "", f[9])
        line = ",".join(f)
    out.append(line)
open(dst, "w", encoding="utf-8").writelines(out)
EOF
  if grep -q '^Dialogue:' "$tmp/hook.ass"; then
    hook=",subtitles=filename='$tmp/hook.ass':fontsdir='$here/assets/fonts'"
  fi
fi
ffmpeg -v error -y -ss "$a" -t "$len" -i "$in" -i "$in" -filter_complex "
[0:v]setpts=PTS-STARTPTS,crop=972:1728:54:96,scale=1080:1920,setsar=1,eq=saturation=1.2:contrast=1.08:gamma=$gam$hook,fade=t=out:st=$(python3 -c "print($len-0.12)"):d=0.12:color=white[s1];
[0:a]asetpts=PTS-STARTPTS,afade=t=out:st=$(python3 -c "print($len-0.15)"):d=0.15[t1];
[1:v]setpts=PTS-STARTPTS,setsar=1,fade=t=in:st=0:d=0.15:color=white[s2];[1:a]asetpts=PTS-STARTPTS[t2];
[s1][t1][s2][t2]concat=n=2:v=1:a=1[v][au]" \
  -map "[v]" -map "[au]" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -map_metadata -1 -movflags +faststart "$out"
