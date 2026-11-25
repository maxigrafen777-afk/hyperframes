# Football Story Studio

Lokale Produktionssoftware für Fußball-Storytelling-Videos (TikTok, 1080×1920, MP4) auf Deutsch.
Sie findet täglich neue Themen, recherchiert sie mit Quellen, schreibt ein faktengeprüftes Skript,
erzeugt Voice-over, eigene Grafiken, Untertitel und Musik und rendert das Video mit [HyperFrames](../../README.md).

## Schnellstart

```bash
cd apps/football-studio
./setup.sh                     # Python-Umgebung, Abhängigkeiten, lokale deutsche Stimme, HyperFrames-CLI
export ELEVENLABS_API_KEY=…    # optional: natürlichere Stimme (sonst lokal „Thorsten“ via Piper)
export ANTHROPIC_API_KEY=…     # optional: Skripte frei formuliert von Claude (sonst regelbasiert)
./run.sh                       # Dashboard: http://127.0.0.1:8765
```

Voraussetzungen: Python 3.11+, Node.js 22+ (für `npx hyperframes`), ffmpeg, Chrome/Chromium (lädt HyperFrames bei Bedarf).

## Ablauf

| Schritt            | Modul                                  | Was passiert                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Themenfinder    | `topics.py`                            | Täglich 10 Ideen aus Wikidata-Abfragen (Legenden, vergessene Nationalspieler, tragische Schicksale, historische Spiele) plus kuratierte Geschichten (Abstürze, Transfers). Verwendete oder verworfene Themen sind gesperrt, Vorschläge erst nach 60 Tagen wieder.                                                                                       |
| 2. Recherche       | `research.py`, `sources/`              | Wikidata + deutsche und englische Wikipedia. Geburtsdaten, Orte, Vereinsstationen und Länderspiele werden quellenübergreifend abgeglichen: **verifiziert**, **Einzelquelle** oder **Widerspruch**. Jeder Satz behält seine Einzelnachweise (z. B. kicker, welt.de). Alle Rohtexte liegen als Schnappschuss mit SHA-256 im Projekt.                      |
| 3. Skript          | `script.py`, `speech.py`               | Hook, chronologische Geschichte, Karriere-Grafik, Statistik, Abspann, 60–120 s. Mit Claude (bei `ANTHROPIC_API_KEY`) oder regelbasiert aus belegten Sätzen. Danach prüft ein Faktenprüfer jede Zahl gegen die Quellen; widersprüchliche Fakten sind gesperrt, Privatleben wird herausgefiltert. Erst nach bestandener Prüfung ist die Freigabe möglich. |
| 4. Voice-over      | `voice.py`                             | ElevenLabs (mit Zeichen-Zeitstempeln) oder Piper lokal. Szenenweise Synthese, Zahlen und Daten werden ausgeschrieben („am 3. Spieltag“ → „am dritten Spieltag“), automatische Tempo-Anpassung in den 60–120-s-Korridor.                                                                                                                                 |
| 5. Szenen          | `composer.py`                          | Eigene Grafiken (Hook, Steckbrief, Karriere-Zeitleiste, Statistik-Ring, Jahreszahl, Spielstand, Zitat, Spielfeld-Animation, Abspann) als HTML/SVG. Keine TV-Aufnahmen. Fotos nur von Wikimedia Commons mit freigegebener Lizenz (Standard: CC0, gemeinfrei, CC BY) und Namensnennung im Bild.                                                           |
| 6. Videoeditor     | `composer.py`, `music.py`, `render.py` | Szenen exakt auf die Voice-over-Zeiten gelegt, Ken-Burns-Zoom, Zoom-/Blur-Übergänge, wortgenaue animierte Untertitel in der TikTok-Safe-Zone, selbst komponierte Musik (eigene Rechte) mit Sidechain-Ducking. `hyperframes lint` + `check`, danach Render zu MP4.                                                                                       |
| 7. Dashboard       | `server.py`, `web/`                    | Themen, Projekte, Vorschau-Player, Skript-Editor, Szenen austauschen (Bildtyp, Bildtext oder anderer belegter Recherche-Satz), Recherche/Quellen/Prüfberichte, Neu-Generieren, Export.                                                                                                                                                                  |
| 8. Automatisierung | `pipeline.py`                          | Täglich zur eingestellten Uhrzeit: 10 Ideen, die besten N (Standard 2) werden recherchiert und geskriptet und warten auf Freigabe. Freigabe → Produktion + Vorschau, Export auf Knopfdruck.                                                                                                                                                             |

Alles wird lokal unter `data/` gespeichert (`data/projects/<id>/` mit `project.json`, Quellen, Audio, HyperFrames-Projekt `video/`, `exports/*.mp4`).

## Kommandozeile

```bash
.venv/bin/python -m football_studio topics            # Tagesideen
.venv/bin/python -m football_studio daily             # Tageslauf (z. B. per cron)
.venv/bin/python -m football_studio prepare "Lars Ricken" --category vergessen
.venv/bin/python -m football_studio produce <projekt-id>
.venv/bin/python -m football_studio export <projekt-id>
```

Das HyperFrames-Projekt eines Videos (`data/projects/<id>/video`) lässt sich auch direkt mit `npx hyperframes preview` öffnen und von Hand weiterbearbeiten.

## Tests

```bash
.venv/bin/python -m pytest tests                        # offline, Sekunden
FSS_LIVE=1 .venv/bin/python -m pytest tests/test_live.py  # Wikidata/Wikipedia/Stimmen live
```

## Rechtliches und Grenzen

- Quellen sind Wikipedia/Wikidata und deren Einzelnachweise. Wikipedia ist eine Tertiärquelle: Vor dem Veröffentlichen den Reiter „Recherche“ prüfen, vor allem Fakten mit Status **Einzelquelle**.
- Die regelbasierte Engine übernimmt belegte Sätze nahezu wörtlich (gekürzt). Bei Veröffentlichung Wikipedia als Quelle nennen (steht automatisch im Abspann und in der Beschreibung).
- Musik ist algorithmisch selbst erzeugt. Eigene Titel nur mit Lizenzdatei in `data/music-library/`.
- Personenfotos unterliegen zusätzlich Persönlichkeitsrechten. CC-BY-SA/GFDL-Fotos sind standardmäßig aus, weil Share-Alike das ganze Video betreffen kann.
