---
name: gta-clip-editor
description: Bewertet, schneidet und liefert TikTok-Clips aus GTA-6-Livestreams (Zarbex, xRohat) mit der clip-pipeline. Lesen bei jedem Weckruf der stündlichen Clip-Aufgabe, bevor Kandidaten bewertet werden, und wenn der Nutzer Feedback zu gelieferten Clips gibt.
---

# GTA-Clip-Editor

Ziel: aus Livestreams die Momente finden, die auf TikTok funktionieren, und dem
Nutzer fertige 9:16-Clips plus Text in den Chat schicken. Er lädt sie nach und
nach hoch. Nur bestehendes Material schneiden, nichts erfinden, Quelle im Post-Text nennen.

**Pflicht: Musik darf nie veröffentlicht werden** – weder GTA-Radio noch Hintergrundmusik
des Streamers. Die Pipeline verwendet nur die per Demucs getrennte Stimmspur
(`render.remove_music = true`, nie ausschalten). Steht im Transkript gesungener Liedtext
(siehe „Musik … in Sekunden“ in `show`), um diese Stelle herumschneiden oder verwerfen.

## Ablauf bei jedem Weckruf

Arbeitsverzeichnis: `clip-pipeline/`. Config: `config.toml` (Kopie von `config.example.toml`).

1. **Diese Datei lesen** (vor allem _Bewertungsregeln_ und _Gelerntes_).
2. **Dienst prüfen:** `python3 tools/review.py status`.
   - Läuft er nicht (oder „nie gestartet“, z. B. neuer Container), neu starten:
     ```bash
     pip install -q torch torchaudio --index-url https://download.pytorch.org/whl/cpu && pip install -q demucs streamlink faster-whisper anthropic websockets pydantic numpy 2>&1 | grep -v WARNING
     test -f config.toml || cp config.example.toml config.toml
     nohup python3 -m pipeline.watch --config config.toml > data/watch.log 2>&1 &
     ```
   - `data/watch.log` auf Fehler prüfen (`tail -30`).
3. **Kandidaten holen:** `python3 tools/review.py list`.
4. **Jeden Kandidaten bewerten:** `python3 tools/review.py show <id>` ausgeben, den
   Kontaktabzug (`data/clips/<id>/sheet.jpg`) ansehen, nach den Regeln unten ein
   Judgment-JSON schreiben (Scratchpad) und `python3 tools/review.py decide <id> <json>`.
   Bei `keep` wird automatisch gerendert.
5. **Gerenderte Clips prüfen** (2–3 Standbilder aus `clip.mp4` ansehen: Untertitel
   lesbar, nichts überlappt, kein schwarzer Balken zwischen Cam und Gameplay, Cam-Ausschnitt
   stimmt), dann mit `SendUserFile` schicken:
   `clip.mp4` + den Text aus `post.txt` im Chat. Danach `review.py delivered <id>`.
   Höchstens 3 Clips pro Weckruf, der beste zuerst. Schwache Stunden: lieber nichts schicken.
6. **Lernen:** Neues unter _Gelerntes_ eintragen (Datum, was, Konsequenz). Wiederholt
   sich etwas, als Regel unter _Bewertungsregeln_ aufnehmen oder im Code beheben
   (Detektor-Schwellen, Vokabelliste, Korrekturen in `config.example.toml`). Committen und pushen.
7. Feedback des Nutzers („gepostet“, „schlecht“, Views) unter _Feedback_ festhalten
   und `review.py posted|reject <id>` setzen.

Nie Nutzernamen aus dem Chat an den Nutzer weitergeben oder committen.

## Bewertungsregeln

<!-- judge-rules:start -->

- Antwortwelle erkennen: Stellt der Streamer kurz vor dem Chat-Ausschlag eine Frage an
  den Chat („oder?“, „wie findet ihr …?“, „was meint ihr?“) und der Chat antwortet
  („ja“, „ne“, „bude“, „geil“, „10/10“), ist das kein Highlight: hype höchstens 3.
- Begrüßungs- und Geplauder-Wellen (Moin, Grüße, Raid-Begrüßungen, Fragen an den Streamer) sind kein Highlight.
- Starke Zeichen: Lachen im Chat (LUL, KEKW, hahaha, xD, Kanal-Lach-Emotes wie zarbexHehe),
  WutFace/RedFlag/Fail-Emotes, Clip-Rufe, und eine laute oder emotionale Reaktion des Streamers.
- Ist das Gameplay dunkel oder statisch, trägt die Facecam den Moment: layout "split", der
  Hook bezieht sich auf die Reaktion.
- Schnitt: nicht mitten im Satz anfangen, wenn es sich vermeiden lässt; am ersten Satz
  einsteigen, der den Moment verständlich macht. Nach der Pointe/Reaktion 0,5–1 s stehen lassen.
  Ideal 12–35 s.
- Hook: max. 6 Wörter, nur was belegt ist (Transkript/Bilder), Pointe nicht verraten,
  keine Emojis (Schrift kann sie nicht darstellen). Emojis gehören in die Caption.
- Story-Spoiler (Handlung, Missionsausgang, Cutscenes) verwerfen. Die ersten Tage nach Release besonders streng.
- Lief im Kandidaten deutlich Musik und enthält das Transkript dort Liedtext (Reime,
  englische Songzeilen, Wiederholungen), diese Stelle nicht in den Schnitt nehmen; geht das
  nicht, verwerfen.
- Beleidigungen gegen echte Dritte, die bloßstellen (nicht freundschaftliches Frotzeln), verwerfen.
<!-- judge-rules:end -->

## Gelerntes

- 2026-11-18 · Antwortwellen sind der häufigste Fehlalarm (3 von 6 Auslösern am ersten Tag).
  Ja/Nein-Wellen filtert der Detektor (`answer_words`), „geil“-Antworten noch nicht → Bewertung sortiert sie aus.
- 2026-11-18 · Vorgefertigte Twitch-Nachrichten („Alles Gute zum Partner-Jubiläum!“) und Bots (fossabot)
  verfälschen die Baseline → `ignore_patterns` / `ignore_users`.
- 2026-11-18 · Lachen wird als Muster erkannt (hahaha, xD, lol); Kanal-Emotes stehen in `hype_words`.
- 2026-11-18 · z-Schwelle 3,5 an 30 min Zarbex-Chat eingestellt: 2 echte Momente, 0 Fehlalarme.
- 2026-11-18 · Whisper verhört „zockst“ → „schockst“, „Privatjet“ → „Privatschat“. Gegenmittel:
  `whisper.vocabulary` (Hinweis) und `whisper.corrections` (feste Ersetzung). Transkript vor dem Rendern überfliegen.
- 2026-11-18 · Schimpfwörter in Untertiteln maskieren (`render.censor`), Ton bleibt.
- 2026-11-18 · Telefon-Rant-Momente (Streamer macht Kumpel am Telefon fertig) funktionieren; Chat lacht stark.
- 2026-11-18 · Nutzer: Musik zwingend entfernen. Umgesetzt mit Demucs (htdemucs, CPU, ~0,5× Echtzeit);
  nur die Stimmspur wird gerendert und transkribiert. Nebenwirkung: Spielgeräusche (Crash, Schüsse)
  fallen auch weg.
- 2026-11-18 · Nutzer: schwarzer Balken zwischen Facecam und Gameplay stört. Ursache: Zarbex blendet
  zeitweise oben einen 60-px-Balken („DAUERWERBESENDUNG“) ein, manchmal liegt der Text aber direkt
  auf dem Bild. Lösung: Balken pro Clip automatisch erkennen (`render/letterbox.py`).
- 2026-11-18 · Nutzer: Twitch-Name im Video nicht nötig (`render.show_credit = false`); Quelle bleibt im Post-Text.
- 2026-11-18 · Idee: Layout „große Facecam“ für Momente, in denen nur die Reaktion zählt.

## Streamer

### Zarbex (`zarbex`)

- Facecam unten rechts: x=1452, y=762, w=468, h=318 (1920×1080).
- Chat: ~1,7 Nachrichten/s, sehr emote-lastig. Lach-Emotes: zarbexHehe, zarbexGeil, zarbexHyper.
- Stil: lautes Kommentieren, Telefonate, viel Interaktion mit dem Chat (→ viele Antwortwellen).
- GTA-6-Stream ab Release (18.11.2026), u. a. aus Neuseeland.

### xRohat (`xrohat`)

- Login vom Nutzer bestätigt (zuerst falsch als `rohat` angenommen). Facecam noch nicht gemessen
  (Standbild landet in `data/snapshots/xrohat.jpg`).

## Feedback

(noch keins)
