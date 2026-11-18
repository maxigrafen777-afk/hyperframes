#!/usr/bin/env bash
# Endet, sobald Kandidaten auf Bewertung warten (oder der Dienst tot ist).
# Als verfolgte Hintergrundaufgabe starten: das Ende weckt Claude zur Bewertung.
cd "$(dirname "$0")/.." || exit 1
for _ in $(seq 1 720); do               # max. 1 h (720 x 5 s)
  n=$(python3 -c "
import sqlite3; c=sqlite3.connect('data/pipeline.sqlite3')
print(c.execute(\"select count(*) from clips where status='TRANSCRIBED'\").fetchone()[0])" 2>/dev/null || echo 0)
  if [ "${n:-0}" -gt 0 ]; then echo "KANDIDATEN: $n"; exit 0; fi
  age=$(python3 -c "import json,time; print(int(time.time()-json.load(open('data/heartbeat.json'))['ts']))" 2>/dev/null || echo 999)
  if [ "$age" -gt 120 ]; then echo "DIENST TOT (Herzschlag vor ${age}s)"; exit 2; fi
  sleep 5
done
echo "NICHTS NEUES (1 h)"
