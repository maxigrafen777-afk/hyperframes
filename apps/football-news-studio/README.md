# Football News Studio

Produktionssoftware für **tagesaktuelle Fußball-News- und Transfer-Videos** (TikTok, 1080×1920, 9:16, 30 fps, MP4)
aus **deinen lizenzierten MAXPPP-Fotos und PressBox-Videos (Stats Perform)**. Technischer Plan: [PLAN.md](PLAN.md).

## Installation

Voraussetzungen: Python 3.11+, ffmpeg (mit libass), Internetzugang für Nachrichten und Stimme.

```bash
# macOS / Linux
./setup.sh
./run.sh                      # → http://127.0.0.1:8770
```

```powershell
# Windows (PowerShell)
.\setup.ps1
.\run.ps1                     # → http://127.0.0.1:8770
```

Optionale Schlüssel (als Umgebungsvariablen vor dem Start setzen):

| Variable             | Wofür                                                          | Ohne Schlüssel                                                                                        |
| -------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`  | Claude schreibt journalistische Skripte mit eigener Einordnung | **Briefing-Modus**: sachliche, belegte Meldungen mit Quellennennung – bitte redaktionell überarbeiten |
| `ELEVENLABS_API_KEY` | natürliche deutsche Nachrichtenstimme (männlich, wählbar)      | lokale Stimme „Thorsten“ (Piper), kostenlos                                                           |

## Arbeitsablauf

1. **Medien einlesen**: Lizenzierte Dateien nach `media/maxppp/` und `media/pressbox/` kopieren (oder im Dashboard hochladen),
   „Ordner neu einlesen“. Fotos werden über IPTC/XMP erkannt (Bildtext, Personen, Fotograf, Datum), Videos über
   Dateiname, Video-Tags und Begleitdateien (`.xml`, `.json`, `.csv`, `manifest.csv`). Videos werden automatisch in Shots zerlegt.
2. **Lizenzen eintragen** (Reiter „Lizenzen“): je Quelle Plattformen, kommerzielle Nutzung, Ablaufdatum, Bildnachweis –
   und bestätigen. **Ohne bestätigte, vollständige Lizenz verwendet das Programm keine einzige Datei.**
3. **Neues Video**: Thema eintippen oder eines der aktuellen Themen anklicken. Das System recherchiert (Sportschau, FAZ,
   Spiegel, SZ, Welt, n-tv, t-online, Merkur/tz, Transfermarkt, Google News …), trennt bestätigt / berichtet / Gerücht /
   Meinung, schreibt das Skript, ordnet passende Medien zu, vertont und rendert eine Vorschau.
4. **Kontrollieren**: Vorschau ansehen, Skript bearbeiten, Medien je Schnitt austauschen, Warnungen prüfen.
5. **Exportieren**: „Final exportieren“ → MP4 in voller Qualität, −14 LUFS, mit Bildnachweisen und Quellen.

## Was das Programm nicht tut

- Es lädt nichts von MAXPPP, PressBox oder anderen geschützten Quellen herunter und meldet sich dort nirgends an.
- Es liest keine Artikel hinter Paywalls und beachtet `robots.txt` (dann nur Überschrift + Link).
- Es kann deine Verträge nicht prüfen – die Lizenzangaben trägst du ein. Bei Unklarheit: Anbieter fragen.

## Tests

```bash
.venv/bin/python -m pytest tests                                    # Bibliothek, Lizenzen, Zuordnung, Skript, Schnitt
NS_LIVE=1 .venv/bin/python -m pytest -s tests/test_production.py   # + echtes Tagesthema bis zum fertigen MP4
```

Die Tests verwenden automatisch erzeugtes **Testmaterial** (Platzhalterbilder mit nachgebildeten Agentur-Metadaten),
niemals echte Agenturmedien.
