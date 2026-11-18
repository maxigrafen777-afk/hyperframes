# Clip-Pipeline

Nimmt Livestreams auf, erkennt Highlights am Chat, lässt eine KI bewerten,
schneidet 9:16 mit Untertiteln und schickt den Clip per Telegram aufs Handy.

> Nur Streamer clippen, die Clipping erlauben oder eine Kampagne haben, und
> sie im Clip immer als Quelle nennen.

## Stand

| Schritt                             | Modul                             | Status |
| ----------------------------------- | --------------------------------- | ------ |
| Config, Schlüssel                   | `pipeline/config.py`              | ✅     |
| Datenmodelle                        | `pipeline/models.py`              | ✅     |
| Datenbank + Statusmaschine          | `pipeline/db.py`                  | ✅     |
| Chat lesen (Twitch)                 | `pipeline/sources/twitch_chat.py` | ✅     |
| Chat-Auslöser                       | `pipeline/detect/chat_stats.py`   | ✅     |
| Recorder mit Puffer                 | `pipeline/sources/recorder.py`    | ✅     |
| Live-Check (Twitch-API, nur GTA VI) | `pipeline/sources/twitch_api.py`  | ✅     |
| Whisper-Transkript (CPU)            | `pipeline/judge/media.py`         | ✅     |
| KI-Bewertung (Claude)               | `pipeline/judge/judge.py`         | ✅     |
| Render 9:16 + Untertitel            | `pipeline/render/`                | ⏳     |
| Telegram                            | `pipeline/deliver/`               | ⏳     |
| Orchestrator                        | `pipeline/orchestrator.py`        | ⏳     |

## Status je Clip

```
NEW → TRANSCRIBED → JUDGED → RENDERED → DELIVERED → POSTED
  └──────────┴─────────┴──────────┴─→ REJECTED / FAILED
DELIVERED → JUDGED  ("neu rendern")
```

Worker holen Arbeit mit `db.claim(status, worker)`. Stürzt ein Worker ab,
läuft seine Lease aus und der Clip wird erneut vergeben. Nach
`max_attempts` Fehlversuchen landet er in `FAILED`.

Reihenfolge: live vor altem Material, dann höhere Note, dann frischer.
Überlappende Kandidaten desselben Streamers: nur der stärkere bleibt.

## Einrichten

```bash
cd clip-pipeline
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp config.example.toml config.toml   # Streamer eintragen
cp .env.example .env                 # Schlüssel eintragen
pytest
```

## Chat-Detektor testen

Zuerst echten Chat eines Streamers mitschreiben (kein Token nötig), z. B.
während eines GTA-Streams eine Stunde lang:

```bash
python tools/replay_chatlog.py --record <kanal> chat.jsonl
```

Dann den Detektor darauf laufen lassen und die Schwellen in `config.toml`
(`[detect]`) anpassen, bis die Treffer zu den Momenten passen, die du selbst
geclippt hättest:

```bash
python tools/replay_chatlog.py chat.jsonl --config config.toml
```

### Wie der Auslöser rechnet

- **Burst**: Nachrichten in den letzten `burst_s` Sekunden.
- **Baseline**: dieselbe Größe in Fenstern über die letzten `baseline_s` Sekunden (der aktuelle Burst zählt nicht mit).
- **z** = (Burst − Median) / (max(1.4826·MAD, √Median) + 1). Die √Median-Untergrenze verhindert Fehlalarme in ruhigen Chats, wo der MAD fast 0 ist.
- Auslösen bei z ≥ `z_threshold` mit genug verschiedenen Nutzern, oder bei `clip_calls_trigger` verschiedenen Nutzern, die „clip“ schreiben. Danach `cooldown_s` Pause.
- Moment im Bild = stärkste Chat-Sekunde − `chat_delay_s` des Streamers.
