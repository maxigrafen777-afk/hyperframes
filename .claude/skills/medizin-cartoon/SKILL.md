---
name: medizin-cartoon
description: Deutsche TikTok-Erklärvideos im Medizin-Cartoon-Stil (Organe/Zähne mit Glupschaugen streiten sich, Eingriff von außen, Arzt erklärt in der Praxis), komplett in Code mit HyperFrames gebaut. Verwenden, wenn der Creator ein neues Video zu einem medizinischen Thema will ("mach ein Video über …", Nierenstein, Mandeln, Weisheitszahn usw.).
---

# Medizin-Cartoon (TikTok, Deutsch)

Hochformat-Kurzvideos, die den Referenzen des Creators folgen (Stil wie die
"Dr. healthcare"-Videos, aber **ohne** deren Wasserzeichen oder Namen; immer
das Handle des Creators). Alles ist Code: SVG-Zeichnungen und GSAP-Timeline in
HyperFrames-Kompositionen. Lies vorher `/hyperframes` (Vertrag, Workflow).

Referenzprojekte, die du kopierst und umbaust: `tiktok/blinddarm/` (neuester Stand, ~60 s, Laparoskopie mit `lapTool`) und `tiktok/zehennagel/` (aktuellster Stand: Szenen-Reihenfolge, Hook aus `script.hook`, Opfer/Verursacher über `VICTIM`/`CAUSER` in `actLines`, Patient in Seitenansicht) und `tiktok/weisheitszahn/`.
Bauteile-Bibliothek: `lib/parts.mjs` (Augen, Münder, Gesicht mit `lidFill` für Haut/Nagel, Zahn, Instrumente inkl. Schere und Wattestäbchen, Schmerzstern, Naht, Untertitel).

## Dramaturgie (immer gleich)

| Teil                | Zeit (30-s-Version) | Inhalt                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Hook im Körper   | 0–9 s               | Anatomische Nahaufnahme. Zwei Körperteile mit Gesichtern **streiten sich** (der Verursacher frech und genervt, das Opfer im Schmerz). Schon Frame 0 zeigt beide Gesichter und das Problem (Schmerzstern).                                                                                                                                                                                           |
| 2. Zeitsprung-Karte | ~1,4 s              | Dunkler Navy-Verlauf mit feinem Korn, türkise Uhr (Ring zeichnet sich, Zeiger spulen zwei Runden vor), darunter „SPÄTER“ in Montserrat 900 mit weitem Sperrsatz, Buchstaben steigen gestaffelt aus einer Maske, Akzentlinie wächst. Keine Untertitel dazu. Whoosh rein und raus.                                                                                                                    |
| 3. Eingriff         | ~10 s               | Dieselbe Szene: Instrumente und Handschuhhände kommen schräg von außen ins Bild (Spritze → Skalpell → Hebel → Zange …). Jede Aktion ist ein Beat mit Reaktion der Figur (Schock, betäubt, Panik, Schrei). Danach: Wunde, Naht, die Erleichterung des Opfers.                                                                                                                                        |
| 4. Arzt erklärt     | ~10 s               | Harter Schnitt in die Praxis (grüne Wand, Fenster mit Kräutertöpfen, Tisch mit Akten). Halbnahe auf den Arzt: alter Mann mit weißem Zopf, Halbglatze, runder Goldbrille, buschigen grauen Brauen, Maske unterm Kinn, weißem Kittel, Krawatte, Stethoskop; schreibt auf ein Klemmbrett und schaut zum Sprechen in die Kamera. Erklärt in 2–3 Sätzen medizinisch korrekt, was passiert ist und warum. |

Eine 60-s-Version streckt Teil 1 und Teil 3 (mehr Dialog-Beats), nicht Teil 4.

## Eingriffe realistisch zeigen

Jeder echte OP-Schritt ist ein eigener Beat (Instrument rein → Aktion → Reaktion → Instrument raus). Weisheitszahn als Muster:
Betäubung (Spritze) → Schnitt → **Zahnfleisch sichtbar aufklappen** (Lappen dreht am Scharnier weg und bleibt offen) → Knochen über der Krone wegfräsen (Knochenstücke verschwinden, Späne fliegen) → Zahn mit dem Bohrer teilen (Schnittlinie zeichnet sich) → Krone mit dem Hebel lockern, mit der Zange ziehen → Wurzeln einzeln → spülen → Blutgerinnsel → Lappen zurück → nähen (Nadelhalter, Stich für Stich) → Erleichterung.

## Look (Zahlen, nicht Adjektive)

- 1080×1920, 30 fps. Konturen `#2A1E1E`, 5 px, runde Enden; flächige Farben, höchstens ein Schattenstreifen. Palette in `C` in `lib/parts.mjs`.
- Körperszene: Hintergrund Weinrot `#8B2C3C`, Gewebe Rosa `#E9A2A9`, Knochen Creme `#E9E7D8`, unten Rosa `#D9848F`, Blut `#D0142A`, Gerinnsel `#6E1420`.
- Figuren: Glupschaugen r ≈ 44–52 px mit Lid (Lidstand 0 = offen, 0,4 = genervt, 1 = zu), Pupillen schauen immer auf das, was passiert. Schmerz = „> <“-Augen + Wellenmund. Mund flattert beim Sprechen (`talk`).
- Praxis: Wand `#B8C58E` / `#AAB97F`, Leiste `#7F7B57`, Boden `#A0978A` mit Fliesenlinien in Perspektive.
- Untertitel: **ein Wort**, Montserrat 900, 84 px, weiß, 14 px dunkle Kontur, Großbuchstaben, bei y ≈ 1270 px, Pop-in-Skalierung 0,82 → 1 in 0,09 s. Ohne Satzzeichen am Ende.
- Wasserzeichen: Handle des Creators diagonal (32°), weiß mit 30 % Deckkraft, unten links. Variable `handle` in `index.html`.
- Szenenwechsel sind harte Schnitte, nur die Zeitsprung-Karte bekommt einen Whoosh.

## Arbeitsablauf

1. **Thema → Skript** auf Deutsch, umgangssprachlich und frech in Teil 1 und 3, sachlich-korrekt in Teil 4. Jede Zeile hat höchstens ~8 Wörter (Dialog) und ≈ 3 Wörter/s. Sprecher-Ids: Opfer, Verursacher, `card`, `arzt`.
2. Projekt kopieren: `cp -r tiktok/weisheitszahn tiktok/<thema>` (ohne `renders/`, `.hyperframes/`). `script.json` neu schreiben (Zeilen mit start/end, SFX-Liste).
3. In `build.mjs` die Körperszene für das neue Organ zeichnen: neue Teile als Funktionen in `lib/parts.mjs` ergänzen (wiederverwendbar), das Acting über die Helfer `lids / blink / look / face / squeeze / talk / shake`.
4. `node build.mjs`, dann `npx hyperframes lint` und `npx hyperframes check` (in diesem Repo: `node packages/cli/dist/cli.js …`). GSAP liegt lokal unter `assets/gsap.min.js`, weil das CDN hier blockiert ist.
5. `snapshot --at …` an jedem Beat ansehen: Gesichter lesbar, Instrumentenspitze trifft das Ziel, nichts Wichtiges unter den Untertiteln.
6. **Stimme (ElevenLabs)**: Stimmen-Ids und Einstellungen pro Sprecher stehen in `script.json` unter `voices` (Opfer höher und gestresst, Verursacher frech, Arzt ruhig). `ELEVENLABS_API_KEY=… node voices.mjs` erzeugt `assets/vo/<zeile>.mp3` und `assets/vo/timings.json` mit Wortzeiten aus dem Alignment (`/with-timestamps`); zu lange Takes werden einmal schneller nachgesprochen. `node build.mjs` übernimmt danach die echte Länge als Zeilenende, setzt die Untertitel auf die echten Wortzeiten und legt die Audio-Clips an. Einzelne Zeilen neu: `node voices.mjs l3 l7`. Der Key braucht die Berechtigung „Text to Speech“.
7. Rendern: `render -q delivery -o renders/<thema>_vN.mp4`.

## Erkenntnisse aus den Vorbildern (Analyse von 3 Videos mit Millionen Aufrufen)

Gemessen, nicht geschätzt (Bildübersicht alle 2 s, Transkript mit Wortzeiten, Pegel):

- **Länge 62 s** (+ TikTok-Endscreen). Aufteilung im Weisheitszahn-Vorbild: Streit 0–14 s, Karte 14–15,6 s, weiterer Streit 15–24 s, Eingriff 24–43 s (davon 12 s ganz ohne Sprache, nur SFX), Patient fragt + Arzt erklärt 43–62 s.
- **Kein Hook-Text** im Original, das erste Bild ist die Szene; nach Whoosh + Boing spricht die erste Figur bei etwa 2 s.
- **Schnelles Hin und Her:** Sätze 0,5–1,5 s, etwa 2,4 Wörter/s, kaum Pausen zwischen Sprechern.
- **Figuren mit Motiv und Witz:** Der Verursacher ist sympathisch frech und hat einen Grund („hier unten ist's langweilig, ich will auch kauen“), Pointen wie „Freiheit hat ihren Preis“, ein Furz-Gag. Das Opfer ruft selbst den Arzt („Doc, hol ihn raus!“): Das ist die Überleitung zum Eingriff.
- **Sichtbare Folge + Payoff:** Der Verursacher richtet Schaden an (Loch im Nachbarzahn), das Opfer zeigt es („Guck, was du gemacht hast!“), im Eingriff wird es versorgt, der Arzt erwähnt es.
- **Arzt-Szene:** Der Patient stellt zuerst eine Frage („Doc, das war Folter! Was habt ihr da rausgeholt?“), dann erklärt der Arzt 15–20 s ausführlich und korrekt.
- **Ton ohne Lücken:** keine einzige Stille (< −40 dB) im ganzen Video, laut gemischt (etwa −14 LUFS). SFX auf jeder Aktion (Whoosh, Boing, Squeak, Bohrer, Pop).
- **Untertitel:** ein Wort, weiß mit dunkler Kontur, mittig unten. Zeichnungen flächig, Praxis als Totale mit Arzt und Patient.

## Umsetzung (Hausregeln, über die Vorbilder hinaus)

- **Frame 0 ist das Thumbnail im Feed:** Hook-Titel oben (y ≈ 210–500, 3 Zeilen, Schlüsselwort gelb `#FFE14D`), ab dem ersten Frame voll lesbar, nie hereinskaliert. Dazu Kamera-Punch (1,16 → 1) mit Wackeln, Whoosh + Boom, erster Satz geschrien.
- **Betonung:** Wörter, die im Skript GROSS stehen, werden gelbe, größere Untertitel mit kurzem Kamera-Punch. Höchstens 1 pro Zeile.
- **Mimik aus Tags:** `actLines(scene)` in `build.mjs` leitet das Acting aus den v3-Tags ab (laut = Kneifaugen + Schmerzstern, frech/lachen = Schlafzimmerblick, jammern = Blick nach oben, seufzen = Lider runter; der Zuhörer schaut zum Sprecher).
- **Dramatik im Eingriff:** langsamer Zoom auf den Höhepunkt (Zahn teilen), Wackeln + Impact beim Ziehen, Riser vor der Karte.
- **Szenenfolge:** `kiefer → spaeter → nachher → op → frage → praxis → patient` (`order` in `script.json`). Jede Szene hat eigene Autorenzeit und wächst mit ihren Takes; `build.mjs` legt sie nacheinander.
- **Schluss-Gag + Kommentar-Frage:** Patient mit Folge-Symptom (Hamsterbacken, Kühlpack) fragt nach dem Essen, der Arzt antwortet aus dem Off korrekt, dazu „WIE DICK WAREN DEINE BACKEN?“ + „Schreib's in die Kommentare ↓“, mindestens 2,5 s stehen lassen.
- **Länge:** Ziel ≈ 60 s (Wunsch des Creators: lieber um 1 min als länger). 60–80 s ist die Obergrenze (über 60 s zählt für das Creator-Rewards-Programm); Streit bis zur Karte ≤ 15 s.
- **Stimmen:** `eleven_v3` mit Tags (`[shouting]`, `[laughs]`, `[whining]`, `[slurring]`, `[panicked]`, `[sighs]`, `[mumbling]`). v3 spricht langsam: `tempo` pro Sprecher (Zähne 1,2, Arzt 1,1, Patient 1,08), und die Stille vor dem ersten Wort wird abgeschnitten (außer bei hörbarem Laut wie `[laughs]`). `node voices.mjs --retime` wendet das ohne neue Credits an.
- **Ton:** `node sfx-gen.mjs` erzeugt SFX und ein Musikbett (`bed-long.mp3`, Loop mit Überblendungen; Lautstärke 0,17). SFX können an Zeilen hängen (`"line": "k7", "offset": -0.55`). Die ElevenLabs-Musik-API braucht einen Bezahl-Tarif; Sound-Generation reicht für das Bett. Am Ende `loudnorm=I=-14`.

## Stimmen-Qualität (gelernt am Zehennagel)

- **Stabilität 0,5** („natural“) für alle Figuren. 0,0 („creative“) verfälscht Wörter („Steht dir“ → „Date dir“, „Puh, nur der Rand“ → „Pfff, nur daran“).
- **Keine GROSSBUCHSTABEN im Sprechtext:** v3 liest sie als Abkürzung („DOC“ → „Mark“). Betonung für Untertitel und Kamera-Punch steht separat in `"emph": ["Wort"]` pro Zeile. Lieber „Herr Doktor“ statt „Doc“.
- **Automatische QA:** `qa: { maxTakes: 3, maxWer: 0.1 }` in `script.json`; `voices.mjs` prüft jeden Take per ElevenLabs-Spracherkennung (scribe) gegen den Soll-Text und erzeugt bei Abweichung neu. Am Ende den fertigen Mix noch einmal transkribieren (Ziel ≥ 95 % Übereinstimmung).
- **Tempo höchstens 1,15** (atempo); 1,2 klingt gepresst. Stille vor dem ersten Wort mit 0,15 s Vorlauf trimmen, sonst fehlen Anlaute (P, St).
- **Kontrast zwischen den Figuren:** Opfer und Verursacher klar unterscheidbar besetzen (z. B. Opfer weiblich-gestresst: Jessica, Verursacher lässig-frech: Will). Alle 14 getesteten Standardstimmen sprechen bei Stabilität 0,5 korrekt Deutsch; eigene deutsche Stimmen designen geht nur im Bezahl-Tarif.

## Look (gelernt am Zehennagel)

- **Problem sichtbar machen statt sagen:** Streit spielt im engen Schuh (dunkler Innenraum, quetschende Schuhwände bei jedem Drücken, grüne Stinkewolken).
- **Schuss/Gegenschuss:** `frameTo()` auf das sprechende Gesicht (Opfer k ≈ 1,1, damit die Untertitel frei bleiben; Verursacher k ≈ 1,45, damit das andere Gesicht nicht angeschnitten unten hängt). Rahmen-Ebene (`#@frame`) und Wackel-Ebene (`#@cam`) getrennt.
- **Eingriff:** eigene Umgebung (grünes OP-Tuch, Lampenlicht), Lichtblitz zum Start, Kamera fährt jede Aktion an, Impact-Blitz beim Herausziehen.

## Spannung und OP-Fokus (gelernt am Blinddarm v2)

- **Cold Open:** Die ersten ~2,5 s zeigen den Höhepunkt der OP vorweg (gleiche Aufnahme per `"reuse": "o4"`), dazu der Hook als offene Frage („WIE PASST DER BLINDDARM DURCH 1 CM?“). Dann Zurückspulen (Streifen, ◀◀, Rewind-SFX) und „6 STUNDEN VORHER“. Die Auflösung der Frage kommt erst in der OP.
- **Gefahren-Balken** („PLATZ-GEFAHR“) füllt sich im Streit und blinkt kurz vor der OP: sichtbarer Countdown, der die Spannung trägt.
- **Die OP ist der Kern:** 5 beschriftete Schritte („SCHRITT 2/5 · LUFT & KAMERA“), der Arzt erklärt jeden Schritt aus dem Off, die Figuren reagieren dazwischen. Alle OP-Beats hängen an den Startzeiten der Arzt-Sätze (`a1`–`a6`), nicht an festen Zeiten, sonst laufen Bild und Erklärung auseinander. Ruhige Kamera (ein Rahmen pro Schritt), kein Lichtnebel.
- **Ebenen ohne eigene Szene** (Hook, Untertitel, Wasserzeichen) starten bei echter Zeit 0. Nie `R(0)` verwenden, wenn die erste Szene nicht bei Autorenzeit 0 liegt (sonst laufen die Untertitel um die Teaser-Länge hinterher).

## ElevenLabs-Grenzen (kostenloser Tarif)

- 10.000 Credits pro Monat; QA-Retakes und Spracherkennung zählen mit. Texte vor dem Erzeugen final machen, Retakes sparsam.
- `eleven_multilingual_v2` klingt pro Figur gleichmäßiger als v3 (fester `seed` pro Figur, `previous_text`/`next_text` derselben Figur). v3-Tags werden dafür aus dem Text entfernt; Emotion über Satzzeichen und `style`.
- Englische Standardstimmen sprechen Deutsch nie ganz natürlich. Für muttersprachliche Stimmen braucht der Key „Voices: Read“ (Bibliothek durchsuchen) und „Voices: Write“ (Stimme hinzufügen).

## Stolperfallen

- QA-Normalisierung ignoriert Bindestriche („Kot-Stein“ = „Kotstein“); schwierige Wörter mit Bindestrich schreiben hilft der Aussprache.
- SFX nie direkt auf den Satzanfang legen: Ein Quietschen genau auf „Nur?!“ hat das Wort im Mix verdeckt. Nach dem Rendern den Mix transkribieren (Ziel ≥ 95 %).

- Untertitel liegen bei y ≈ 1270: Gesichter in der Körperszene nicht dorthin legen (Zeh-Gesicht bei y 1500, Nagel-Gesicht darüber).
- Patienten-Szenen in Seitenansicht zeichnen (sitzen, betroffener Körperteil auf Hocker); verkürzte Perspektive auf die Kamera zu ist schwer lesbar.

- Kiefer- und OP-Szene teilen dieselbe Zeichnung (`jaw(prefix)`), Ids also mit Präfix (`k-`, `o-`); im JS steht `@` für das Präfix.
- `shake()` setzt absolute Werte: nie auf ein positioniertes `*-pos`-Instrument anwenden, sondern auf die innere Gruppe.
- `blink(ch, t, v)` mit explizitem Lidwert aufrufen, wenn die Blinzler nicht in zeitlicher Reihenfolge stehen.
- Wasserzeichen trägt `data-layout-ignore`, sonst schlägt der Kontrast-Check an.
- ElevenLabs-Key ohne „Text to Speech“-Recht liefert HTTP 401 `missing_permissions`: im ElevenLabs-Dashboard unter API Keys die Berechtigung freischalten oder einen neuen Key anlegen.

## Regeln

- Medizinischer Inhalt muss stimmen; im Zweifel vorsichtig formulieren und keine Dosierungen oder Heilversprechen nennen.
- Keine fremden Wasserzeichen, Namen oder Logos (kein „Dr.healthcare“, kein TikTok-Endscreen; den fügt TikTok selbst an).
- Kein Gore: Blut ist flach und stilisiert, Wunden werden gleich versorgt.
- Deterministisch: kein `Math.random`, keine Timer; alle Bewegung in der Timeline.
