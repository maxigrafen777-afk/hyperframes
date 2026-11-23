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
- 2026-11-19 · TikTok-Views (Nutzer-Screenshot, 14:28): Oma-Elektromobil #41 66.082 ≫ Kühlschrank „Rockstar hat es
  nicht gefixt“ #75 1.743 > BILD „versetzt Oma für GTA“ #47 1.106 > Überfall #73 941 > Pelikan #197 869 > Alligator-Deko
  #80 613 > 423 > Alligator #79 225 > 4 Sterne #419 205 > Shirley #88 177 > Panikattacke #254 142.
  Konsequenz: 1) „Oma/Opa/Rentner“-Momente (absurd, liebevoll, schlechtes Gewissen) sind der Hit – Hook mit OMA. 2) Trailer-/Easter-Egg-Vergleiche („Rockstar hat es nicht gefixt“, Detail aus dem Trailer) laufen gut. 3) Zarbex lieferte bisher die stärksten Clips – trotzdem ALLE 7 Streamer gleich gewichten (Nutzer). 4) Reine Action/Flucht ohne Gag (4 Sterne) und Panik-NPC schwächer.
- 2026-11-19 · Nutzer: „sowas ist gut“ – #440 Zarbex trifft seinen NPC-Doppelgänger (Selbstironie, „sogar dieselbe
  Brille“). Streamer, der über sich selbst lacht, + klarer NPC im Bild = guter Clip. Auch ohne große Chat-Welle
  (hier 35 %) zweiten Blick wert. Verworfene mit >= 20 % Chat-Reaktion bei ruhiger Lage nochmal sichten.
- 2026-11-19 · Nutzer: Untertitel im Doppelgänger-Clip hatten Fehler. Vor dem Rendern Transkript im Schnittbereich
  komplett lesen und offensichtliche Whisper-Fehler korrigieren (Namen, Wortsalat, „Buster“/„Sackstuff“ etc.).
- 2026-11-19 · Nutzer: „Sei nicht so kritisch, hau alles rein was ansatzweise gut ist, ich sortiere aus.“ min_hype 5;
  alles ab hype 5 liefern (Pflicht bleibt: keine Nacktheit, kein Gore, keine Musik, keine Story-Spoiler-Cutscene).
- 2026-11-19 · Nutzer: Stimme/Untertitel passten nicht zum Bild. Ursache: Rohschnitt (concat) hat kleine Tonlücken,
  Demucs-Eingang ohne Lücken → Stimmspur ~1 % kürzer, Drift bis 0,5 s nach 45 s. Fix: ffmpeg-Decode mit
  aresample=async=1:first_pts=0. Alte Clips mit `tools/redo_audio.py <id> <judgment>` neu erzeugen.
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
- 19.11.: Eliasn97-Clips bekamen auf TikTok „kann nicht empfohlen werden“. Verdacht: Sponsor-Banner (Quantum/Würth) oben im Gameplay = Werbung ohne Kennzeichnung, dazu Waffe auf Zivilisten (Überfälle). Banner per game_area [96,1080] abgeschnitten. Bei Elias Überfälle mit Waffe auf Menschen meiden, lieber Fails/Fluchten/Lacher.
- 19.11.: Auch Elias-Krokodil-Clip (ohne Banner, ohne Waffe) „kann nicht empfohlen werden“ → Verdacht: nicht originaler Inhalt (eigene Clip-Kanäle). Nutzer: Elias vorerst NICHT liefern, Kandidaten verwerfen; Aufnahme läuft weiter.
- 19.11.: Nach jedem gelieferten Clip PushNotification schicken („Neuer Clip #<id> <Streamer>: <Titel>“) – Nutzerwunsch.
- 19.11. 20:00 TikTok-Views: Doppelgänger 1505, Trymacs Deal eskaliert 1234, Trymacs Karma 909, Trymacs Unspielbar 907, Zarbex Festgenommen 734, UFO 617, Jumbojet 228 / Mast 227 / Bike 104 (frisch). Trymacs läuft stark – Reaktion + klare Situation. Selbstironie/Pech (Doppelgänger, Karma) top.
- 19.11.: Nutzer: Slapstick-Prügeleien mit NPCs (z. B. Zarbex haut wieder eine Oma) DÜRFEN rein. Weiter tabu: Waffe auf Zivilisten / Schießen auf Passanten (TikTok-Risiko), Gore, Nacktheit, Musik, Spoiler.
- 19.11.: Nutzer: Clips ohne Reden des Streamers (Schradin Jetski #617, kaum Worte) sind nicht gut. Nur liefern, wenn der Streamer im Ausschnitt deutlich reagiert/spricht (Faustregel: ≥ 2 Wörter pro 3 s, Reaktion am Höhepunkt).
- 19.11.: Creator-Rewards zahlt nur für Videos > 1 min. Nutzer: vorerst kurze Clips lassen (erst 100k Aufrufe sammeln), danach ggf. auf 61–90 s umstellen.
- 19.11. abends: Nutzer lädt nachts nicht hoch. Nachts KEINE Einzel-Clips/Pushes schicken, sondern jeden guten Clip mit tools/night_add.sh <id> in data/nacht/ legen. Morgens 07:30 (Berlin) Paket: ZIP + Liste + Archiv + eine Push. Erinnerung trig_019yYwsXvvojVAGh8YWBiSGB.
- 19.11. abends: Nutzer will auch kleinere dt. Streamer + mehr Easter-Egg-Videos. Neu: gronkh, dhalucard, letshugotv, unsympathischtv, rewinside, sterzik, pietsmiet, staiy (nur GTA-VI-Kategorie wird aufgenommen). Easter-Egg-Hype-Wörter (ufo/alien/bigfoot/geheim). Neue Streamer haben noch keine Facecam-Config → beim ersten Kandidaten messen (Frame + Raster), sonst Blur-Layout ohne Cam.
- 19.11. spät: Neue Streamer (rewi, pietsmiet usw.) auf Nutzerwunsch wieder raus. Nur noch papaplatte, trymacs, zarbex, schradin, sidneyeweka, willisommer (Elias pausiert). Nutzer will morgen Ergebnisse → großzügiger liefern (hype 5 reicht, wenn Streamer reagiert).

- 20.11.: Nutzer-Feedback: Nacht-Clips waren gut; #704 (Trymacs zerlegt mit Greifarm das Haus, mit Versprecher/Sprachfehler-Moment) war der beste Clip von gestern. Mehr davon: Zerstörungs-Momente mit witzigem Kommentar/Versprecher des Streamers.

- 20.11. Hook-Regel verschärft (Nutzer): Der rote Hook am Anfang muss krasser und aussagekräftiger sein – Zuschauer sollen sofort „oh shit“ denken. Konkretes Ereignis + Eskalation statt Beschreibung. Beispiele: statt „50 STUNDEN GEFARMT… WEG 🔥“ → „SEIN 200K-PORSCHE EXPLODIERT 💥“; statt „OMA DREHT KOMPLETT DURCH“ → „OMA ZIEHT WAFFE AN TANKE 😳“. Zahlen, Schock, Konsequenz; max ~28 Zeichen.

- 20.11. Nutzer: großzügig liefern – lustige Momente, spannende Momente, kranke Szenen, Easter Eggs, lustige Überfälle und Missionen; „alles was irgendwie interessant sein kann“. Harte Grenzen bleiben (Gore, Nacktheit, Musik, Story-Spoiler, Waffe auf Zivilisten).

- 20.11. Post-Text (Nutzer): nur EIN Satz + Hashtags + Quelle. Kein separater Titel, keine zweite Zeile. post.txt enthält jetzt nur caption (ein Satz). Den Titel-Satz als caption verwenden.

- 20.11. Nutzer: „Auch bekloppter Kack kann rein“ – absurde/dumme Momente, Blödsinn, Quatsch-Aktionen, peinliche Fails sind ausdrücklich erwünscht (Leute finden das lustig). Lieber liefern als zu streng sein; nur harte Grenzen gelten.

- 20.11. Nutzer: NPC-Momente und crazy NPC-Shit kommen immer super an, besonders Omas/Rentner – bei Zarbex gezielt darauf achten. Hype-Wörter oma/omi/granny/opa/rentner/npc ergänzt.

## Best-of (täglich ~19 Uhr, Nutzer 20.11.)

- Zusätzlich zu den Einzelclips: Top 5 eines EINZIGEN Streamers. Nutzer will dafür ANDERE kleine Sequenzen als die schon gelieferten Einzelclips: verworfene/vorgefilterte Kandidaten mit witzigem Satz (Transkripte in data/clips/<id>/transcript.json durchsuchen), je 10–14 s.
- Ablauf: pro Schnipsel Judgment-JSON (start/end eng, hook = Titel des Moments) → `review.py rerender <id> <json>` (Untertitel vorher prüfen/korrigieren); zwei Schnipsel aus einem Rohschnitt: erst Clip kopieren, dann neu rendern. Dann `tools/bestof.sh <streamer> data/bestof/top5_<streamer>_<TT-MM>.mp4 <#5> <#4> <#3> <#2> <#1>`.
- Post-Text: ein Satz + Hashtags + Quelle. Länge ~100 s ist ok (über 1 min).
- Erstes Best-of 20.11.: Zarbex – #5 Tür auf ihr Loser, #4 Fahren+Schießen unmöglich, #3 urteilender Blick, #2 geklautes Geld einzahlen, #1 falsches Haus abgerissen.
- 20.11. Feedback zum ersten Best-of: Sequenzen VIEL zu lang. Jede Szene nur 3–6 s, nur die Pointe (Reaktion/Schock/Lacher), kurz und knackig, und die Momente müssen krass sein (Chaos, Crashs, NPC-Wahnsinn, Omas, Fails) – reines Gerede reicht nicht. Gesamtlänge ~25–35 s. Umsetzung: fertige Schnipsel mit ffmpeg -ss/-t auf die Pointe kürzen (Hook bleibt als Titel drin), dann tools/bestof.sh. Beispiel-Link vom Nutzer (TikTok) ist nicht abrufbar.
- Laufend über den Tag kurze krasse Pointen-Momente pro Streamer fürs Best-of merken (auch aus verworfenen Kandidaten), nicht erst um 19 Uhr suchen.
- 20.11. abends Feedback: #952 (Partnerin überfahren) war nix – man SIEHT nicht, was passiert (nur Wasted-Screen + Gerede). Regel: Der Moment muss im Bild sichtbar sein (Crash, NPC-Aktion, Explosion, Fail). Clips, die nur über Erzählen/Chat funktionieren (Rants, Karte, Menü, Ladescreen), nicht mehr liefern. Lieber weniger, dafür spannend.
- 20.11. Nutzer: „Wenn es fies ist, ist es grundsätzlich lustig“ – fiese Aktionen gegen NPCs (bewerfen, veräppeln, ausrauben, schubsen) sind erwünscht. Grenzen bleiben: kein Gore, nichts Sexuelles, keine Waffe auf Zivilisten.
- 20.11. Nutzer: „Psychomax“-Momente von Trymacs (er übertreibt komplett, eskaliert gegen NPCs, Chat schreibt psycho/omE) sind ein Trend auf TikTok – ab und zu davon liefern, Hook z. B. „PSYCHOMAX IST ZURÜCK 💀“. Hype-Wörter psycho/psychomax/omE ergänzt.
- 20.11. abends: Elias (eliasn97) wieder aktiv (Nutzer). NUR bei Eli jeden Clip nach dem Rendern mit `tools/eli_edit.sh <clip> <out> <peak_s>` stark bearbeiten (Grundzoom + Farbe, Zoom-Punch auf den Höhepunkt, Zeitlupen-Wiederholung), weil TikTok seine Clips sonst als unoriginal einstuft. Ausgabe als clip.mp4 liefern.
- 20.11. Nutzer: Wenn Streamer ihre Meinung zum Spiel sagen oder GTA 6 kritisieren (Steuerung, Fahrphysik, Bugs, „unrealistisch“, Fazit), kommt das gut an – solche Rants als Clips liefern (Ausnahme zur Sichtbarkeitsregel). Post-Satz mit Frage an die Community („Stimmt ihr zu? 👇“). Beispiele: #944 Trymacs „zu unrealistisch?!“, #983 Zarbex Fazit. Hype-Wörter ergänzt.
- 20.11. Hook-Optik (Nutzer): roter Hook dicker/größer/auffälliger (Bold, 90–96 px, dicke Box, Pop-Animation), ~3,5 s sichtbar, dann ausblenden. Inhalt = Clipfänger: provokanter Satz, der zum Weiterschauen zwingt (z. B. „ER ZERSTÖRT IHR HAUS 💀“, „DAS HÄTTE ER NICHT TUN SOLLEN“, „NIEMAND RECHNET MIT DER OMA“).
- 21.11. nachts: Platte lief voll (data/clips 14 GB, data/raw 10 GB). Bei jedem Weckruf aufräumen: `find data/raw -name '*.mp4' -mmin +180 -delete; find data/clips -name '*.wav' -mmin +180 -delete; find data/archive -maxdepth 1 -name '*.mp4' -delete` (Archiv-Kopien sind nach Upload überflüssig).
- 21.11. 01:45 Nacht-Modus (Nutzer): ganze Nacht weiter clippen, KEINE Einzelsendungen/Pushes; gute Clips mit tools/night_add.sh <id> sammeln (+ review.py delivered). Präsentation um 10:00 Berlin (send_later „Nacht-Paket 10 Uhr“).
- 21.11. Nutzer: Auch lustige Storys der Streamer aus ihrem Leben sind interessant (Ängste, Partys, Alltag) – als Story-Clip liefern, Post-Satz mit Frage an die Community.
- 21.11.: Trymacs schaut nachmittags teils fremde Streams (anderer Streamer mit „INZONE“-Cam) – dann ist auch die Facecam-Region falsch. Solche Kandidaten verwerfen. Render-Tool erzwingt Mindestlänge ~20 s: kurze Teilstücke stattdessen aus einem langen Render mit ffmpeg trim/concat schneiden (siehe #1152).

## 22.11.: Creator-Rewards-Modus (Nutzer)

- Nutzer ist jetzt im TikTok-Rewards-Programm: AB SOFORT nur Clips ÜBER 1 Minute, ideal 61–70 s (knapp drüber). Trotzdem top: starke Hook (provokant, Clipfänger), sichtbarer Moment, durchgehend Sprache.
- config: [clip] pre_roll 65 / post_roll 25 / max_len 100; [judge] min_len 61 / max_len 72. Kurze Momente: Kontext davor + Reaktion danach mitnehmen, ruhige Stellen raus-schneiden (trim/concat) statt Füllmaterial.
- Best-of (19 Uhr) ebenfalls >1 min halten (5 Szenen à ~12–14 s).
- 22.11. Hook-Optik v2 (Nutzer): rote Box mit abgerundeten Ecken (ASS-Zeichnung \p1, \_rounded_rect), Schrift dicker (Montserrat Black + weiße 2,2-px-Kontur), größer (bis 112 px). Erinnerung Nutzer: Meinungen/Kritik der Streamer zum Spiel kommen gut an (siehe #1241, #983).
- 22.11. Tagesziel (Nutzer): ca. 9 Clips pro Tag (> 1 min, gute Hook). Bei jedem Weckruf mitzählen (`delivered` heute); hängt man hinterher, Standard leicht senken (hype 5 mit klarer Pointe/Reaktion oder Spielkritik reicht), aber Grenzen bleiben.

## Cold-Open (22.11.)

Clips über 1 min müssen die gleichen Aufrufe holen wie vorher: jeden Clip nach dem Render mit
`tools/teaser.sh clip.mp4 out.mp4 <peak_s im Clip>` versehen (Höhepunkt 2,5 s vorne, Zoom, Weißblitz).
peak_s im Clip = peak_s - start_s. Nur Clips, die die ganze Minute tragen.

- 22.11. Nutzer: Der rote Hook muss ab dem allerersten Frame stehen – auch über dem Cold-Open. `tools/teaser.sh` legt die Hook-Zeilen aus `clip.ass` jetzt automatisch über den Teaser.
- 22.11. abends Nutzer: KEIN Vorspann/Cold-Open mehr! Der rote Hook-Satz kommt direkt am Anfang des Clips – also das normale clip.mp4 liefern, tools/teaser.sh NICHT mehr benutzen.
- 22.11. abends Nutzer: 1-min-Clips performen deutlich schlechter – „probier was, es muss besser laufen“. Ab jetzt:
  1. Jeden Clip nach dem Render mit `tools/tighten.py <id> [--protect A B]` straffen (Sprechpausen > 0,9 s raus, Hook-Anfang und
     sichtbare Action per --protect [Rohschnitt-Zeiten] geschützt, nie unter 61 s). Fenster dafür eher lang wählen (≈72 s), dann auf ~61–64 s dicht schneiden. clip_tight.mp4 liefern.
  2. Wenn mehrere mittelgute Momente eines Streamers da sind: „3 in 1“-Video (3 Pointen à ~20 s, ein gemeinsamer roter Hook) statt einen Moment zu strecken.
  3. Hook als offene Schleife formulieren (Pointe kommt am Ende: „WARTE AUF DEN FLÜGEL …“), damit bis zum Schluss geschaut wird.

### Nutzer-Feedback 23.11. (Schradin #1557)

- Clips ohne echtes Reden (nur Schreie/„oh oh oh“, Streamer läuft von der Cam weg) kommen NICHT gut an → verwerfen. Der Streamer muss sprechen und in der Cam zu sehen sein.
- Weiße Schrift muss lesbar sein: keine Clips, in denen die Untertitel kaum Text haben oder über hellem Bild verschwinden.
- Facecam-Position vor jedem Render gegen den Rohschnitt prüfen: Zarbex hat die Cam am 23.11. verschoben (oben war ein Streifen Spiel zu sehen) → config.toml neu gemessen.
- 23.11. Hook-Optik v3 (Nutzer): Schrift im roten Balken dünner (Montserrat SemiBold) mit schwarzem Rand (3 px), kurze Zeilen (≤16 Zeichen), groß. So lassen.
