---
name: gta-clip-editor
description: Bewertet, schneidet und liefert TikTok-Clips aus GTA-6-Livestreams (große deutsche Streamer: eliasn97, Sidney Friede, Trymacs, MontanaBlack, Papaplatte, Zarbex, xRohat u. a.) mit der clip-pipeline. Lesen bei jedem Weckruf der stündlichen Clip-Aufgabe, bevor Kandidaten bewertet werden, und wenn der Nutzer Feedback zu gelieferten Clips gibt.
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
   - Läuft er nicht (oder „nie gestartet“, z. B. neuer Container), neu starten – **als verfolgte
     Hintergrundaufgabe** (Bash mit `run_in_background: true`, `timeout: 7200000`), nie mit
     `nohup`/`setsid`: Nur eine verfolgte Aufgabe hält den Container wach, sonst wird er nach
     wenigen Minuten Leerlauf angehalten und der Dienst stirbt (passiert am 18.11. um 14:21).
     ```bash
     python3 -c "import demucs, faster_whisper, streamlink" || (pip install -q torch torchaudio --index-url https://download.pytorch.org/whl/cpu && pip install -q demucs streamlink faster-whisper anthropic websockets pydantic numpy)
     test -f config.toml || cp config.example.toml config.toml
     timeout 7100 python3 -m pipeline.watch --config config.toml >> data/watch.log 2>&1
     ```
   - Läuft er noch, aber seit über einer Stunde (Feld `started` in `data/heartbeat.json`), trotzdem
     nicht anfassen: Er endet nach ~2 h von selbst, die Benachrichtigung darüber ist der Anlass zum
     Neustart. Kommt diese Benachrichtigung, sofort neu starten.
   - `data/watch.log` auf Fehler prüfen (`tail -30`).
3. **Kandidaten holen:** `python3 tools/review.py list`.
   Zusätzlich zwischen den stündlichen Läufen: `tools/wait_candidates.sh` als verfolgte
   Hintergrundaufgabe starten (`run_in_background: true`). Sie endet, sobald Kandidaten warten
   (oder der Dienst tot ist) – das weckt mich, ich bewerte sofort und starte sie danach neu.
   So kommen Clips ohne Wartezeit beim Nutzer an (Wunsch: „ständig neue Clips“).
4. **Jeden Kandidaten bewerten:** `python3 tools/review.py show <id>` ausgeben, den
   Kontaktabzug (`data/clips/<id>/sheet.jpg`) ansehen, nach den Regeln unten ein
   Judgment-JSON schreiben (Scratchpad) und `python3 tools/review.py decide <id> <json>`.
   Bei `keep` wird automatisch gerendert.
5. **Gerenderte Clips prüfen** (2–3 Standbilder aus `clip.mp4` ansehen: Untertitel
   lesbar, nichts überlappt, kein schwarzer Balken zwischen Cam und Gameplay, **oben ist wirklich
   die Facecam (eine Person) zu sehen**), dann mit `SendUserFile` schicken:
   `clip.mp4` + den Text aus `post.txt` im Chat. Danach `review.py delivered <id>`.
   Dann ins **Clip-Archiv** legen (siehe Gelerntes 2026-11-19, Archiv-Ablauf).
   Höchstens 3 Clips pro Weckruf, der beste zuerst. Schwache Stunden: lieber nichts schicken.
6. **Lernen:** Neues unter _Gelerntes_ eintragen (Datum, was, Konsequenz). Wiederholt
   sich etwas, als Regel unter _Bewertungsregeln_ aufnehmen oder im Code beheben
   (Detektor-Schwellen, Vokabelliste, Korrekturen in `config.example.toml`). Committen und pushen.
7. Feedback des Nutzers („gepostet“, „schlecht“, Views) unter _Feedback_ festhalten
   und `review.py posted|reject <id>` setzen.

Nie Nutzernamen aus dem Chat an den Nutzer weitergeben oder committen.

## Bewertungsregeln

Wünsche des Nutzers (fest): **Der Hook ist das Wichtigste.** Clips **20–60 s** (meist 25–45).
Streamer egal – nur die Qualität zählt; beide Streams jede Runde gleich prüfen und den besten Clip zuerst schicken.

<!-- judge-rules:start -->

- Hook zuerst: Lässt sich kein starker, belegter Hook formulieren, ist der Clip höchstens hype 6.
  Gute Muster: Konflikt, Erwartungsbruch, kurzes starkes Zitat aus dem Transkript als Teaser,
  direkte Ansprache nur, wenn das Ende liefert. Schlecht: Beschreibung („X spielt GTA 6“),
  Clickbait ohne Einlösung. Pro Clip 3 Hooks entwerfen und den stärksten nehmen.
- Länge 20–60 s, meist 25–45. Kein Leerlauf: lieber dicht als lang.
- Bester bisheriger Typ (Nutzer-Feedback): absurde, sofort verständliche Situation mit NPCs + Streamer, der
  laufend kommentiert (Vorbild #41 Peggys Elektromobil). Solche Kandidaten großzügiger behalten.
- Ein Clip braucht eine echte Pointe: laute/emotionale Reaktion des Streamers, Action (Verfolgung,
  Crash, Schießerei, Chaos) oder einen Lacher. Ruhige Alltags-Fails, bei denen nur der Chat lacht, sind
  zu schwach (Nutzer-Feedback: „langweilig“). Im Zweifel nicht schicken.

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
- Hook SPANNEND formulieren (Nutzer 19.11.): Neugier/Gefahr/Cliffhanger statt Beschreibung –
  „Er ahnt nicht, was gleich passiert…", „Das ging SO schief", „Niemand hat damit gerechnet".
  Wird weiß auf rotem Kasten eingeblendet (Pop-Animation), max. ~28 Zeichen.
- Hook: max. 7 Wörter, nur was belegt ist (Transkript/Bilder), Pointe nicht verraten,
  keine Emojis (Schrift kann sie nicht darstellen). Emojis gehören in die Caption.
- Story-Spoiler (Handlung, Missionsausgang, Cutscenes) verwerfen. Die ersten Tage nach Release besonders streng.
- Lief im Kandidaten deutlich Musik und enthält das Transkript dort Liedtext (Reime,
  englische Songzeilen, Wiederholungen), diese Stelle nicht in den Schnitt nehmen; geht das
  nicht, verwerfen.
- Echte Personen im Stream (Partnerin, Familie, Gäste) nie bloßstellen: ungewollte Entblößung,
  Kleidung, Körper → immer verwerfen, egal wie laut der Chat reagiert.
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
- 2026-11-18 · In den ersten Release-Tagen löst der Chat oft bei Story-Zwischensequenzen aus (z. B. Mission
  „Kapitel 1 – Rohre verlegen“) → als cutscene/spoiler verwerfen. Pausemenü im Bild = schwaches Bild,
  auch wenn der Streamer Gutes sagt (Hot Takes) → nur behalten, wenn er dabei Gameplay oder starke Mimik hat.
- 2026-11-18 · xRohat: Chat feiert Grafik („Cinema“, „Geisteskrank“) beim Tauchen, aber ohne Reaktion des
  Streamers, mit Tutorial-Hinweisen und englischen Missionsdialogen im Bild → hype 5, verworfen.
  Grafik-Wow allein reicht nicht; es braucht eine Reaktion oder ein Ereignis.
- 2026-11-18 · Chat-Insider („Ali“, „Goldmünze von Ali“) erzeugen Ausschläge ohne Moment im Bild → verwerfen.
- 2026-11-18 · Mit Musik-Trennung landen englische Spieldialoge in der Stimmspur und damit in den Untertiteln.
  Bei Missionsdialogen prüfen, ob die Untertitel dann noch Sinn ergeben.
- 2026-11-18 · Nutzer: Hook ist das Wichtigste; Clips 20–60 s; Streamer egal, Inhalt zählt.
  Umgesetzt: Rohschnitt ~70 s (pre 45 / post 15), clamp() erzwingt 20–60 s, Hook 3,5 s im Bild.
- 2026-11-18 · Fehlalarm-Typ „Gesundheit-Welle“: Streamer niest, Chat schreibt im Chor „Gesundheit“ → verwerfen.
- 2026-11-18 · Zarbex hat die Facecam mitten im Stream von unten rechts (y=762) nach rechts Mitte (y≈426)
  verschoben → erster Render zeigte oben Gameplay statt Cam. Lösung: `render/facecam.py` sucht die Cam
  pro Clip (feste Kanten über mehrere Bilder, Rechteck in Cam-Größe, ±2 px Toleranz). An 7 Clips aus 3
  Layouts richtig. Score < 6 → Config-Wert. Trotzdem jedes Mal visuell prüfen.
- 2026-11-18 · Erster ausgelieferter Automatik-Clip: Zarbex Polizeiverfolgung 3 Sterne (#8), Hook
  „Nur 3 Sterne … und das passiert“, 32 s. Schwarzes Wasted-Bild am Ende weggelassen (toter Leerlauf).
- 2026-11-18 · Dienst lief entkoppelt (setsid) und starb, als der Container im Leerlauf angehalten wurde.
  Jetzt als verfolgte Hintergrundaufgabe mit 2 h Laufzeit.
- 2026-11-18 · Nutzer: Facecam „sitzt komisch“. Ursachen: Gameplay-Ränder am Cam-Ausschnitt und Cam zu
  groß (fast 40 % Höhe, 2,3-fach hochskaliert). Lösung: Cam rundum 8 px nach innen, Cam-Feld max. 640 px
  (⅓), beim Beschneiden 25 % oben / 75 % unten (Kopf bleibt).
- 2026-11-18 · Starkes Signal: Der Chat korrigiert den Streamer im Chor („du hast grün genommen“), während er
  es noch nicht merkt → Fail-Clip mit Erwartungsbruch-Hook (#14, „Er wollte unbedingt Blau …“).
- 2026-11-18 · Sponsoring/Unboxing (z. B. Xbox-Paket, „DAUERWERBESENDUNG“ ohne Spiel) → verwerfen.
- 2026-11-18 · Ausbeute erste Stunden: ~25 Kandidaten → 2 Clips. Antwortwellen bleiben der häufigste Ausschuss
  (bei beiden Streamern; sie fragen oft den Chat).
- 2026-11-18 · Ankündigungen („kann ich eine Tankstelle überfallen?“) am Ende des Rohschnitts: Die Pointe
  kommt erst danach. Nicht den ruhigen Vorlauf schicken, sondern auf den Folge-Kandidaten achten.
- 2026-11-18 · Nacktszenen (Duschen) + anzüglicher Chat → verwerfen.
- 2026-11-18 · Verlosungs-Geplänkel (Chat bettelt um PS5, „greedy chat“) erzeugt hohe Lach-Anteile ohne Spielmoment → verwerfen.
- 2026-11-18 · Drastisches Blut/Gore (z. B. blutüberströmte Figur in Nebenmission) → verwerfen; TikTok schränkt das ein.
- 2026-11-18 · xRohat spielt viel Story: die meisten seiner Auslöser sind Zwischensequenzen → Spoiler.
- 2026-11-18 · Song-Momente: Chat feiert Musik („BANGER“, „W song“, „Copyright“) → der Moment IST die Musik
  → immer verwerfen (Musik darf nie veröffentlicht werden; Transkript enthält dann Liedtext).
- 2026-11-18 · Guter Typ: witzige Nebenmissionen (#41 Peggys Elektromobil klauen, Oma rennt hinterher), Chat lacht
  laut (46 % Hype), Streamer kommentiert. Heikle Sätze („Ich liebe Behinderte“) aus dem Schnitt lassen:
  Ende direkt davor setzen.
- 2026-11-18 · Streamer schaltet auf Vollbild-Cam (z. B. Zarbex zeigt BILD-Artikel über sich, #47) → layout "blur"
  (Bild mittig 4:3), nicht "split" – es gibt dann keine eingeblendete Cam (Facecam-Suche meldet Score < 6).
  Schnitt erst ab dem Umschalten beginnen. Drama/Reaktion auf Presse über den Streamer = starker Inhalt.
- 2026-11-18 · xRohat hat seine Cam leicht verkleinert und verschoben (512→486 px, y 104→140). Facecam-Suche
  probiert jetzt 100/95/90/85 % der Config-Größe. Kleinere Stufen (≤ 80 %) finden Minimap/Innenkanten → nicht nutzen.
- 2026-11-18 · „Erster Bug“-Momente: Nur behalten, wenn der Bug im Bild klar und länger als ~2 s zu sehen ist
  (z. B. Figur fliegt, Auto im Boden). Kurzes Kamera-Clipping erkennt auf dem Handy niemand.
- 2026-11-18 · Stark: Alligator-Angriffe (#79, #80 bei xRohat). Florida-Tiere sind ein GTA-6-Meme seit den Trailern,
  dazu laute Panik-Reaktion („Ich drücke Kreis um mein Leben!“). Wiederholt sich so etwas, als „Teil 2“ liefern.
- 2026-11-18 · Whisper macht aus Schreien Fantasiewörter („RENZTROCKING“) → vor dem Rendern aus dem Transkript nehmen.
- 2026-11-18 · „W“-Wellen bei großen Streamern (Trymacs) = meist Spenden/Sub-Gifts, kein Spielmoment → verwerfen.
- 2026-11-18 · Sitzung war ~2 h weg (Worker-Neustart), Dienst lief bis zum 2-h-Timeout weiter, danach tot;
  41 Kandidaten Rückstau. Nach Wiederkehr: Dienst sofort neu starten, Rückstau kompakt sichten
  (Transkript-Anfang + 10 Chatzeilen je Kandidat), nur Hype ≥ ~20 % genauer ansehen.
- 2026-11-18 · Gewalt-Pointen (Halsschuss, „erstechen“) → verwerfen, auch wenn der Chat lacht.
- 2026-11-18 · Abgrenzung zum Peggy-Typ: Klauen/Chaos mit NPC ja; NPC zusammenschlagen/erschießen als Pointe
  (z. B. Frau am Strand niedergeschlagen, #173) nein.
- 2026-11-18 · Tier-Unfall ohne Reaktion des Streamers (#197 Pelikan kracht ins Boot, Zarbex redet weiter übers
  Angeln) funktioniert mit Hook „Achte auf den …“ – der Zuschauer sucht das Tier. Moment in Standbildern suchen
  (Sekundenraster um Chat-Zeit − 4 s), kurz halten (~25 s).
- 2026-11-18 · Story-Abschnitte erzeugen Serien schlechter Kandidaten: Stripclub/Motel-Cutscenes (xHorny-Chat),
  Missions-Schusswechsel mit Score-Musik (Trymacs, musik ≥ 60 s), „hör doch zu“-Chöre, Gore-Kopfschüsse → verwerfen.
- 2026-11-18 · Whisper verhört „Subs“ als „Serbs“ → im Transkript korrigieren.
- 2026-11-19 · Release-Nacht (DE-Release 0 Uhr): fast nur Story-Anfänge, Club-/Dusch-Nacktszenen, Charakter-Editor-
  Abstimmungen und Missions-Schießereien mit Score-Musik. Nacktheit sofort verwerfen (Standbilder vorher prüfen).
  Whisper-Endlosschleifen („waschen, waschen, …“) heißen: dort spricht niemand → Stelle nicht verwenden.
- 2026-11-19 · Hook höchstens ~28 Zeichen: „Beim Überfall kriegt er eine Panikattacke 😭“ lief links aus dem Bild.
  Nach dem Rendern immer Bild bei 1 s prüfen.
- 2026-11-19 · Gut: NPC mit absurder Reaktion beim Überfall (#254 Kassierer mit Panikattacke will seinen Vape),
  Streamer mit schlechtem Gewissen – Peggy-Typ.
- 2026-11-19 · Container-Neustart beendet den Dienst ohne „watch beendet“-Meldung → nach jedem Neustart prüfen und neu starten.
- 2026-11-19 · Gut: Fahrzeug-Chaos mit Tieren (#275 Trymacs mit Quad durch den Kuhstall, Kühe fliegen).
  Kurz schneiden (~24 s) ab kurz vor der Einfahrt.
- 2026-11-19 · Elektromobil/Rollator-Momente sind gefragt (Peggy), aber nicht wenn der Streamer den Besitzer
  dafür erschießt (#274) – dann verwerfen.
- 2026-11-19 · Nutzer: Facecam MUSS sitzen. Render prüft jetzt: gefundene Cam (Rahmen-Score) → nehmen;
  sonst Config-Stelle prüfen; sonst Layout ohne Cam (blur) statt falsch geschnittener Cam.
  Greenscreen-Cams ohne Rahmen (Trymacs, MontanaBlack): facecam_frameless = true. Snapshots alle 10 min
  (data/snapshots/<login>.jpg) – bei jedem neuen Streamer Cam messen und eintragen; jeden Render bei 1 s ansehen.
- 2026-11-19 · Clip-Archiv (Nutzerwunsch): https://claude.ai/artifact/4dzFJJ8s9ua4JSgXA99zcC – jeden gelieferten
  Clip dort ablegen: `tools/archive_copy.sh <id>` (Kopie < 19 MB) → Artifact publish asset:true mit url + file_path
  data/archive/<id>.mp4 → `python3 tools/archive_row.py <id> <asset-id>` → ArtifactData set collection "clips",
  doc_id "c<id>", file_path data/archive/rows/<id>.json. Der Nutzer hakt dort „hochgeladen“ ab.
- 2026-11-19 · Nutzer: Facecam 40 % / Gameplay 60 % (CAM_MIN_H = CAM_MAX_H = 768). Nicht zu klein.
- 2026-11-19 · Nutzer: SPARSAM mit Ressourcen/Limit. Kandidaten kompakt sichten (Transkript + 10 Chatzeilen),
  Standbilder nur bei echten Chancen (Lachen + sichtbarer Moment), keine Extra-Recherche, keine Feinschliff-Schleifen.
- 2026-11-19 · Nutzer: „die ganze Nacht nur ein Clip“ – zu streng. min_hype 6, aber nur mit echter Pointe oder echtem
  Ausraster (siehe Feedback #334). Streamer NUR: eliasn97, papaplatte, trymacs, zarbex,
  schradin, sidneyeweka, willisommer. MontanaBlack nie.
- 2026-11-19 · Nutzer-Feedback: #334 xRohat Truck umgekippt = „sau langweilig“ (kleiner Fail ohne echte Pointe
  reicht NICHT). Zarbex/Peggy-Oma = Maßstab für „überragend“. Qualität vor Menge, aber nicht übervorsichtig.
- 2026-11-19 · Nutzer: AUCH gute Map-Einblicke liefern, wenn Streamer oder Chat ausrasten (Wow-/„Holy“-Momente:
  Aussicht, Stadt, Wetter, Details) – nicht nur Lustiges. Hook dann z. B. „SO sieht Vice City aus“, „Das ist KEIN Trailer“.
- 2026-11-19 · Nutzer: Im roten Hook-Kasten muss IMMER etwas Krasses stehen, damit Leute bleiben (Superlativ,
  Schock, Neugier). Kein neutraler Hook.
- 2026-11-19 · Nutzer: Verbrauch zu hoch. Vorfilter im Dienst: Kandidaten mit < 15 % Lachen/Staunen (ohne
  Clip-Rufe) oder > 85 % Musik werden ohne Claude verworfen. Nur noch echte Chancen wecken den Wächter.
- 2026-11-19 · Nutzer: Nicht nur Lacher – auch coole Missionen/Aktionen, die geschafft werden (Flucht gelungen,
  Heist durch, krasser Stunt), wenn Chat/Streamer jubeln („LETS GO“, „GG“, „W“). Keine Story-Spoiler-Cutscenes.
- 2026-11-19 · Nutzer: Zarbex-Kampf „Lucia wird überwältigt“ war überragend – der Detektor hat ihn verpasst (Chat
  ohne Lachen). Action-Kämpfe/Missionen sind erwünscht (keine Gore-Pointe, keine Gewalt an Zivilisten als Witz).
  Puffer jetzt 7 min; Nutzer-Tipps sofort mit `python3 tools/cut_now.py <login> <sek_zurück> [länge]` schneiden.
- 2026-11-19 · Nutzer: Text lief beim Hochladen aus dem Bild (TikTok-Ränder). Hook ab 17 Zeichen zweizeilig, max. ~65 %
  Bildbreite; Untertitel max. 14 Zeichen/Zeile, Schrift 76.
- 2026-11-18 · Idee: Layout „große Facecam“ für Momente, in denen nur die Reaktion zählt.

## Streamer

### Zarbex (`zarbex`)

- Facecam unten rechts: x=1452, y=762, w=468, h=318 (1920×1080).
- Chat: ~1,7 Nachrichten/s, sehr emote-lastig. Lach-Emotes: zarbexHehe, zarbexGeil, zarbexHyper.
- Stil: lautes Kommentieren, Telefonate, viel Interaktion mit dem Chat (→ viele Antwortwellen).
- GTA-6-Stream ab Release (18.11.2026), u. a. aus Neuseeland.

### Weitere (seit 18.11., Nutzer: „alle großen deutschen Streamer“, ab 0 Uhr v. a. eliasn97, Sidney Friede, Trymacs)

- Priorität = Reihenfolge in `config.example.toml`; höchstens `recorder.max_parallel` (6) Aufnahmen gleichzeitig.
- Trymacs (`trymacs`) und MontanaBlack (`montanablack88`): Greenscreen-Cam ohne Rahmen → Facecam-Suche
  scheitert, Config-Bereich wird genutzt. Papaplatte (`papaplatte`): Rahmen-Cam oben rechts.
- Sidney Friede: Login `sidneyfriede` unbestätigt (war offline). Neue Streamer: Facecam am Standbild
  `data/snapshots/<login>.jpg` messen und in die Config eintragen.

### xRohat (`xrohat`)

- Login vom Nutzer bestätigt (zuerst falsch als `rohat` angenommen).
- Facecam oben rechts: x=1406, y=104, w=512, h=288. Darunter ein Overlay „SPENDENSTAND“ (Charity-Stream),
  das der Gameplay-Ausschnitt meidet. HUD: Kompass oben, Minimap unten links.

## Feedback

- 2026-11-18 · **#41 Zarbex „Peggys Elektromobil“ (35 s, Hook „Er klaut Oma das Elektromobil …“): performt am
  besten** (Nutzer). Warum vermutlich: absurde Situation sofort verständlich (Opa/Oma-Gefährt klauen), klares Bild
  (Oma rennt hinterher), Streamer kommentiert laufend mit schlechtem Gewissen („Es tut mir so leid, Peggy“,
  „Ich bin ein schrecklicher Mensch“), Hook = Konflikt in einem Satz. Konsequenz: absurde Nebenmissionen und
  Alltags-Chaos mit NPCs (Omas, Nachbarn, Tiere) bevorzugen; Fortsetzungen/Callbacks zu solchen Figuren
  (z. B. Shirley/Nachbarin, #88) sind gut.
- 2026-11-18 · #14 xRohat „Grün statt Blau“ (40 s, Hook „Er wollte unbedingt Blau …“): **langweilig**.
  Konsequenz: Kleine Alltags-Fails ohne starke Reaktion des Streamers und ohne visuelle Pointe sind
  höchstens hype 5. Der Chat-Chor allein trägt keinen Clip. 40 s ruhiges Streichen ist zu lang für so wenig.
