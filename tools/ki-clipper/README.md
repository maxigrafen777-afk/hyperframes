# KI-Clipper

Macht aus einem langen Video (YouTube-Link oder lokale Datei) bis zu 10 TikTok-Clips:

- Analyse des **kompletten** Transkripts durch Claude, Auswahl der spannendsten Momente
- je Clip **30–60 s**, Schnitt immer an Satzgrenzen, keine Überschneidungen
- automatischer **9:16-Schnitt** (1080×1920)
- **deutsche, animierte Untertitel** (Wort-für-Wort-Karaoke)
- **Hook-Titel** in den ersten ~3 Sekunden (schon im ersten Frame sichtbar, also auch Thumbnail)
- Export als **MP4** (H.264 + AAC), gerendert mit HyperFrames

> **Nutzungsrechte:** Verarbeite nur Videos, für die du die Rechte hast (eigener Kanal,
> schriftliche Erlaubnis, passende Lizenz). Das Tool verlangt dafür `--rights-confirmed`
> und legt `rights.json` im Arbeitsordner ab.

## Voraussetzungen

| Was                       | Wofür                          | Installation                                            |
| ------------------------- | ------------------------------ | ------------------------------------------------------- |
| [Bun](https://bun.sh)     | startet das Tool               | `curl -fsSL https://bun.sh/install \| bash`             |
| Node.js ≥ 22, FFmpeg      | HyperFrames-CLI, Schnitt       | Paketmanager deines Systems                             |
| HyperFrames-CLI           | Transkription, Prüfung, Render | im Repo: `bun install && bun run build`                 |
| Parakeet-Modell (Deutsch) | lokale Transkription           | `node packages/cli/dist/cli.js models install parakeet` |
| yt-dlp                    | nur für YouTube-Links          | `pip install yt-dlp` oder `brew install yt-dlp`         |
| `ANTHROPIC_API_KEY`       | KI-Auswahl der Momente         | Schlüssel aus der Claude Console als Umgebungsvariable  |

Das Tool nutzt die gebaute CLI dieses Repos (`packages/cli/dist/cli.js`). Eine andere
CLI kannst du mit `HYPERFRAMES_BIN="npx --yes hyperframes"` setzen.

## Benutzung

```bash
cd tools/ki-clipper
bun install

# YouTube-Link
bun src/cli.ts "https://youtu.be/VIDEO_ID" --rights-confirmed

# Lokale Datei
bun src/cli.ts ~/Videos/podcast.mp4 --rights-confirmed

# Erst nur planen, clips.json prüfen/anpassen, dann rendern
bun src/cli.ts "https://youtu.be/VIDEO_ID" --rights-confirmed --plan-only
bun src/cli.ts "https://youtu.be/VIDEO_ID" --rights-confirmed
```

Alle Optionen: `bun src/cli.ts --help`.

## Ablauf

1. **Quelle**: yt-dlp lädt max. 1080p als MP4 (`source/source.mp4`), oder die lokale Datei wird kopiert.
2. **Transkription**: `hyperframes transcribe --language de` liefert Wörter mit Zeitstempeln
   (`transcript/transcript.json`); daraus werden Sätze (`transcript/sentences.json`).
3. **KI-Auswahl**: Claude bekommt das vollständige, nummerierte Transkript und schlägt Clips als
   Satzbereiche mit Hook-Titel, Begründung und Score vor (strukturierte JSON-Ausgabe). Der Code
   prüft danach selbst: Länge 30–60 s (passt ganze Sätze an), keine Überschneidung, beste zuerst.
   Ergebnis: `clips.json`.
4. **9:16-Schnitt**: FFmpeg schneidet jeden Clip und skaliert auf 1080×1920. Standard ist ein
   Mittenausschnitt; `cropX` in `clips.json` verschiebt ihn (-1 = links, 0 = Mitte, 1 = rechts).
5. **Komposition**: Pro Clip ein HyperFrames-Projekt (`projects/<nr>-<titel>/index.html`) mit
   Video, Hook-Titel und Karaoke-Untertiteln; danach `hyperframes lint` und `check`.
6. **Render**: `renders/<nr>-<titel>.mp4` plus `renders/index.json` mit Titel, Zeiten und Begründung.

Jeder Schritt wird im Arbeitsordner (`clips/<video>/`) gespeichert; ein erneuter Aufruf
überspringt Fertiges. Nach Handänderungen an `clips.json` (Start, Ende, `hookTitle`, `cropX`)
einfach erneut aufrufen; mit `--only 3,5` werden nur diese Clips neu gebaut. `--replan` lässt
die KI neu auswählen.

Die Projekte unter `projects/` lassen sich in der HyperFrames-Desktop-App oder mit
`hyperframes preview` weiter bearbeiten (Hook-Text, Farben `--hook-bg`, `--accent`, Timing).

## Hinweise

- **YouTube-Bot-Prüfung**: Von Servern/Rechenzentren aus verlangt YouTube oft eine Anmeldung.
  Dann die Cookies des eigenen YouTube-Kontos als `cookies.txt` exportieren und mit
  `--cookies cookies.txt` übergeben, oder das Video selbst herunterladen und die Datei angeben.
- **Kurze Videos**: Passen keine 10 Clips à 30 s hinein, plant das Tool entsprechend weniger.
- **Kosten**: Pro Video ein bis zwei Claude-Anfragen (ein 60-min-Transkript sind grob 15–20k Tokens).
  Modell wählbar mit `--model` (Standard `claude-opus-5-5`).
- **Renderzeit**: auf 4 CPU-Kernen etwa 2–3 Minuten pro 30-s-Clip.

## Entwicklung

```bash
bun test          # Unit-Tests (Satzbildung, Clip-Validierung, Untertitel, Crop)
bun run typecheck
```
