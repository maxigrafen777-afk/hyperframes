---
name: medizin-cartoon
description: Deutsche TikTok-Erklärvideos im Medizin-Cartoon-Stil (Organe/Zähne mit Glupschaugen streiten sich, Eingriff von außen, Arzt erklärt in der Praxis), komplett in Code mit HyperFrames gebaut. Verwenden, wenn der Creator ein neues Video zu einem medizinischen Thema will ("mach ein Video über …", Nierenstein, Mandeln, Weisheitszahn usw.).
---

# Medizin-Cartoon (TikTok, Deutsch)

Hochformat-Kurzvideos, die den Referenzen des Creators folgen (Stil wie die
"Dr. healthcare"-Videos, aber **ohne** deren Wasserzeichen oder Namen; immer
das Handle des Creators). Alles ist Code: SVG-Zeichnungen und GSAP-Timeline in
HyperFrames-Kompositionen. Lies vorher `/hyperframes` (Vertrag, Workflow).

Referenzprojekte, die du kopierst und umbaust: `tiktok/zahnstein/` (neuester Stand: Sicherheitszonen eingehalten, Zoom ≤ 1,12, Wasserzeichen waagerecht bei y 1440, Texte ab y 380), `tiktok/ohrenschmalz/` (neuester Stand: 40 s, kein Cold Open, Augenbrauen/Schweiß, Sticker-Frage in der Mitte), `tiktok/mandeln/` (neuester Stand: deutsche Design-Stimmen, Pausen-Kürzung, drei Figuren) und `tiktok/blinddarm/` (neuester Stand, ~60 s, Laparoskopie mit `lapTool`) und `tiktok/zehennagel/` (aktuellster Stand: Szenen-Reihenfolge, Hook aus `script.hook`, Opfer/Verursacher über `VICTIM`/`CAUSER` in `actLines`, Patient in Seitenansicht) und `tiktok/weisheitszahn/`.
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

## Deutsche Stimmen per Voice-Design (gelernt an den Mandeln)

- Mit Bezahl-Tarif: `POST /v1/text-to-voice/design` (Beschreibung auf Deutsch, „Deutscher Muttersprachler … klares Hochdeutsch ohne Akzent“, `eleven_multilingual_ttv_v2`) liefert 3 Vorschläge; `POST /v1/text-to-voice` legt den gewählten dauerhaft an. Kein „Voices: Read“ nötig.
- Auswahl automatisch: Spracherkennung (Wortfehlerrate 0) und Tonhöhe (Median-F0 per Autokorrelation), so dass die Figuren klar auseinanderliegen (z. B. Zäpfchen 286 Hz, freche Mandel 229 Hz, Türsteher-Mandel 126 Hz, Arzt 100 Hz).
- Angelegte Stimmen (IDs in `tiktok/mandeln/script.json`) für weitere Videos wiederverwenden, damit der Kanal wiedererkennbar klingt (vor allem der Arzt).
- Native Stimmen machen nach Satzzeichen lange Kunstpausen: `voices.mjs` kürzt jede Pause im Satz auf `maxPause` (0,3 s; pro Zeile überschreibbar, z. B. 0,7 s für einen Gag-Beat) und verschiebt die Wortzeiten mit. Ergebnis: flüssiges Hin und Her.
- Bei drei Figuren: `actLines` mit `MOOD` pro Zeile und `lookVec` (Zuhörer schauen zum Sprecher). Beim Zoom auf eine Figur prüfen, dass die anderen Gesichter nicht unter die Untertitel rutschen.

## Feedback des Creators (Mandeln v2) – gilt ab jetzt

- **Lippensynchron:** Münder folgen der Lautstärke-Hüllkurve der echten Aufnahme (`env.py`, 30 Werte/s, in `timings.json` als `env`; `talk()` liest `LIP`). Fester Klapp-Takt wirkte „passt nicht zur Stimme“.
- **Keine Zeitsprung-Karte („Später“)** und **kein Gefahren-/Schwellungsbalken** mehr: die Story läuft am Stück.
- **Arzt kurz halten:** keine Arzt-Stimme während der OP. Die Figuren kommentieren die OP, kurze Schritt-Labels erklären; in der Praxis höchstens ein knapper Satz (wie im ersten Weisheitszahn-Video).
- **Frecher Dialog:** Beleidigungen mit Witz („Fettklöße“ – „Das sind Muskeln, Kleiner“ – „Wackelpudding mit Gesicht“), Running Gags, Callback am Ende (das Eis taucht wieder auf: „Schon wieder ich?!“).
- **Requisiten als Figuren:** Hausmittel/Gegenstände (Eis am Stiel) bekommen Gesicht und eigene Stimme; Eis am Stiel statt Kugel.

## Erkenntnisse aus den eigenen TikTok-Statistiken (ab Ohrenschmalz verbindlich)

Gemessen an den ersten 4 Videos (Stand 3. Nov. 2026):

| Video      | Länge | Ø angeschaut | bis zum Ende | OP-Start |
| ---------- | ----- | ------------ | ------------ | -------- |
| Zehennagel | 70 s  | 24,8 s       | 13,7 %       | ~23 s    |
| Blinddarm  | 64 s  | 16,9 s       | 5,0 %        | ~23 s    |
| Mandeln    | 60 s  | 13,5 s       | 4,8 %        | ~33 s    |

Beim Mandel-Video gingen die meisten bei **0:02**, genau am Schnitt Cold Open → „3 WOCHEN VORHER“. Like-Rate ~7–8 % (gut): der Inhalt gefällt, die Reichweite scheitert an der Bindung.

Daraus folgt:

- **Kein Cold Open, kein Zurückspulen, kein „vorher/später“.** Frame 0 = großer, lesbarer Titel mit einem Alltagsproblem („OHRENSCHMALZ?“) und die Figuren schon im Streit; erster Satz nach ≤ 0,3 s.
- **35–45 s Gesamtlänge**, die erste Aktion (Gegenstand/Instrument kommt ins Bild) spätestens bei Sekunde 8–10.
- **Alle 2–3 s passiert etwas Neues** im Bild.
- **Kommentar-Frage früh**: kurz als Sticker in der Mitte („Kennst du das? Schreib's ↓“) und am Ende; dazu dem Creator raten, sie als ersten Kommentar anzupinnen.
- **Alltags-Themen** schlagen seltene OPs (Zehennagel lief am besten).
- **Cover = erstes Bild mit Titel** (das Mandel-Video ohne Titel im Cover lief am schwächsten).
- **Lustigere Figuren, trotzdem anatomisch richtig:** jede Figur bekommt Augenbrauen (`browPair`, `brows(ch, mood, t)`), Gestresste schwitzen (`sweat`), Körperteile reagieren physisch (Trommelfell beult sich, Pfropf räkelt sich und quetscht), Gegenstände bekommen Accessoires (Wattestäbchen mit Sonnenbrille, die beim „Upps“ verrutscht).
- **SFX nie auf ein Wort legen**, auch nicht auf kurze („Upps“ ging unter einem Boing verloren). Nach dem Rendern den Mix transkribieren.

## Stimmen lebendig, Timing dicht, Musik leise (Ohrenschmalz v2)

- **Lebendigkeit messen:** `f0s.py` gibt Tonhöhe (Median), Tonhöhen-Schwankung in Halbtönen (`var`) und Dynamik aus. Unter ~4 Halbtönen klingt eine Stimme monoton („langweilig“). Voice-Design mit überzeichneten Beschreibungen („extrem hysterisch, schrill“, „sehr tief, schläfrig, schmatzend“, „großspuriger Angeber“), `eleven_ttv_v3`, `guidance_scale: 5`, 6 Vorschläge pro Rolle; den mit hoher `var`, Wortfehlerrate 0 und passender Tonhöhe nehmen.
- **Sprechen:** `eleven_multilingual_v2`, `stability 0.4`, `style 0.6` war im Test lebendiger als v3.
- **Konsistenz-QA:** `f0ref` pro Stimme in `script.json`, `qa.maxF0Dev: 0.3` (Oktaven). Takes, die in eine andere Tonlage kippen (z. B. 308 statt 159 Hz), werden neu erzeugt. Ausnahme: geschriene Einwörter liegen naturgemäß höher.
- **Timing dicht, aber nicht gehetzt:** Zeilen starten direkt nach der vorigen (`GAP` 0,25 s im Streit, 0,3 s in OP/Patient; 0,05 s war dem Creator zu flott, man kam beim Hinschauen nicht hinterher), Tempo 1,0, `"wait"` (0,5–1,5 s) in `script.json` lässt Platz, damit man eine Aktion sehen kann (Stäbchen schiebt, Spritze kommt, Plopp). Szenen enden kurz nach dem letzten Satz (keine feste Mindestlänge). `maxPause` 0,3 s. Zielt ~35–40 s.
- **Musikbett 0,08** (~19 dB unter den Stimmen).
- Aktuelle Stimmen: Trommelfell `qUEezpe9PVeBGCAuvgCT`, Pfropf `60QqaEwKeWbeCvUpTWud`, Wattestäbchen `57UyT2voiMHSkl25qJtO`; Arzt `Og1j4Myr6614gRWlVatR`, Patient `DG0JkxHQrOrx7vnDPwPZ`.

## TikTok-Sicherheitszonen (gemessen am Upload-Screenshot, ab dem nächsten Video verbindlich)

Die TikTok-Oberfläche verdeckt Teile des 1080×1920-Bilds:

- **Oben bis y ≈ 340:** Tabs („LIVE / Gefolgt / Für dich“) und das „Story“-Feld. Dort nie Text: Hook-Titel, Sticker („Kennst du das?“), Schritt-Labels und Kommentar-Frage **erst ab y ≈ 360** (Block von 360 bis ~560).
- **Rechts ab x ≈ 880, y ≈ 880–1700:** Profil, Like, Kommentar, Speichern, Teilen. Dort keine Gesichter und kein Text; Texte zentriert und höchstens ~760 px breit.
- **Unten ab y ≈ 1540:** Name, Beschreibung, KI-Hinweis, Fortschrittsbalken. Untertitel bleiben bei y ≈ 1270; Wasserzeichen über y ≈ 1450 und nicht unter die Beschreibung.
- **Weiter weg statt zu nah:** Die ganze Szene etwa 10–12 % kleiner anlegen (Rand lassen), Kamera-Zooms höchstens Faktor ~1,15 (statt bis 1,5), so dass Gesichter und Instrumente im sicheren Bereich x 60–880, y 360–1500 bleiben.
- **Prüfen:** Vor dem Rendern einen Snapshot mit eingezeichneten Sicherheitszonen ansehen (Overlay-Rahmen), nicht nur das nackte Bild.

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

- **Texte im Bild ausschreiben:** „Schreib's in die Kommentare ↓“, nie nur „Schreib's ↓“. Schluss-Gags müssen ohne Vorwissen verständlich sein (Patient sagt erst, was er vorhat: „Mein Ohr juckt schon wieder“, dann protestiert das Stäbchen).
- Pro Zeile überschreibbare Stimm-Einstellungen: `"settings": {...}` in `script.json`. Kippt ein Satz trotzdem immer in die falsche Tonlage, umformulieren (Ausrufe wie „Vergiss es!“ provozieren Kreischen).
- **Sicherheitszonen-Check per Overlay:** Snapshots mit `--keep` erzeugen und mit ffmpeg `drawbox` die verdeckten Bereiche rot einfärben (oben 0–340, rechts x 880–1080/y 880–1700, unten ab 1540), dann als Raster ansehen.
- Voice-Design braucht mindestens 100 Zeichen Vorschautext und 20 Zeichen Beschreibung.

## Mitmach-Mechanik (ab dem nächsten Video)

Erkenntnis aus einem Vergleichsaccount (3 Videos, 12.000 Follower, Serie „Tag 1/2/3“, Bio „1 Follow = 1 Astronaut / Top-Kommentar = neues Gesetz“): Nicht der Inhalt ist aufwendiger, sondern Zuschauer haben einen **Grund zu kommentieren und zu folgen**. Bei uns blieben Kommentare bei 0, weil die Endfrage nur eine Bitte war („Kennst du das?“).

- **Top-Kommentar entscheidet das nächste Video.** Endkarte statt bloßer Frage: „Welches Organ ist als Nächstes dran? Der Top-Kommentar entscheidet ↓“ (ausgeschrieben, in der Safe Zone).
- **Wahl im nächsten Video einlösen:** Gleich am Anfang (Frame 0, im Titel) „Ihr habt entschieden: <Thema>!“, damit Kommentieren sichtbar belohnt wird.
- **Serie mit fester Patientenfigur:** immer derselbe Patient (z. B. „Patient Kevin – Fall 1, 2, 3 …“), der mit einem neuen Problem kommt, als Endgag und Wiedererkennung. Fallnummer im Titel/Hook.
- **Bio-Vorschlag** für den Creator: „Ihr wählt die Krankheit, ich zeig die OP 🩺 / Top-Kommentar = nächstes Video“.
- Für den Creator einen eigenen Kommentar zum Anpinnen vorschlagen, der zur Wahl anregt.

## Lektion Zahnstein (717 Aufrufe, Ø 27 %, 2,75 % ganz gesehen, die meisten weg bei 0:02)

Zum Vergleich: Ohrenschmalz lag bei 40 % gesehen und 14,5 % ganz gesehen. Der Unterschied liegt im Start: Zahnstein begann mit der **Totalen** (ganzer Mund, kleine Gesichter) und dem erklärenden Titel „So kommt er weg“.

- **Die ersten 2 s sind Nahaufnahme:** großes Gesicht mit starker Emotion, sofort Konflikt. Die Totale („Wo am Körper?“) erst ab ca. 2,5–3 s als Rückzoom einsetzen.
- **Hook-Text provokant statt erklärend** (z. B. „DEIN ZAHN HAT EINEN MITBEWOHNER“, nicht „So kommt er weg“).

## Nierenstein (Projekt `tiktok/nierenstein/`, erstes Video mit allen Regeln)

- **Aufbau:** Frame 0 nah (k 1,8) mit Niere + Stein im Streit, Hook „NIERENSTEIN / SCHLIMMER ALS EINE GEBURT?“ + Chip „PATIENT KEVIN · FALL 1“; bei ~2,3 s kurzer Rückzoom auf den ganzen Bauchraum (Rumpf-Silhouette, Wirbelsäule, Rippen, beide Nieren, Harnleiter, Blase), dann wieder nah.
- **Startrahmen nie per Tween bei t 0 setzen, wenn eine zweite Kamerafahrt bei t 0 startet:** die zweite übernimmt die Anfangswerte (weit) und Frame 0 ist dann die Totale. Die erste Zeile aus `actLines` mit `skip` von der Kamerafahrt ausnehmen.
- **Hausmittel als Figur, medizinisch korrekt scheitern lassen:** Bier gießt in die Niere, der Urin staut sich am Stein (Harnstau: Nierenbecken gelb, Harnleiter dicker, Niere schwillt). Payoff im OP: „Siehste? Ich hab ihn rausgespült!“ – „Das war Wasser, du Pfeife!“.
- **ESWL in 3 Schritten:** Fadenkreuz ortet → Stoßwellen-Kopf von außen, Ringe bündeln sich auf den Stein, Risse, Zerfall → Wasser spült Bröckchen durch den Harnleiter in die Blase.
- **Endgag Patient Kevin:** „Ab heute trink ich viel mehr!“ – Bier: „Endlich!“ – „Wasser.“ – „Mist.“; Endkarte „Welches Organ ist als Nächstes dran? Der Top-Kommentar entscheidet – schreib's in die Kommentare ↓“.
- **Stimmen:** Niere = Trommelfell-Stimme (276 Hz), Stein = Pfropf-Stimme (86 Hz), Bier neu designt `vSzEU6wMkp9JWMpPv0JD` (multilingual_v2 ~110–150 Hz; laute Ausrufe wie „Keine Panik!“ kippen auf 200 Hz → ruhiger formulieren, Stabilität 0,55).
- Objekte, die vom Bildrand kommen (Geräte), nicht wie Lupen aussehen lassen: runder Kopf + breites Gehäuse, das aus dem Bild zeigt.

## Stil v2 nach Referenz mit 23 Mio. Aufrufen (Zäpfchen gegen Verstopfung) – ab jetzt verbindlich

Gemessen (Bild jede Sekunde, Transkript mit Zeiten, Pegel): 62 s Inhalt + TikTok-Endscreen, −15 LUFS, praktisch keine Stille.

- **Ein ruhiges, sofort verständliches Bild statt Effekte:** Die ganzen ersten 28 s sind EINE feste Einstellung (kein Zoom, kein Wackeln, kein Schnitt). Oben ein Längsschnitt durch das Organ (realistische, gedeckte Farben: Beige-Haut, Lachs-Gewebe, Braun; dünne Konturen, weiche Schattierung), unten ein zweites Feld „draußen“ (hellblau), in dem das Hilfsmittel von einer Handschuh-Hand mit Gesicht gehalten wird. Geteiltes Bild: innen das Problem, außen die Lösung.
- **Frame 0 ohne Titel und ohne Sticker:** Das Bild selbst ist der Haken (Kotbrocken mit Gesichtern stecken im Darm). Keine Hook-Schrift, keine Schritt-Labels, keine Endkarte. Untertitel klein (ein Wort, weiß, schmale Kontur, ~40 px), unten im Organbild.
- **Viele kleine Gesichter:** Das Organ hat nur Augen, jeder Brocken hat ein eigenes kleines Gesicht (Gruppenwitz), die Hand ist eine Figur.
- **Dialog ruhig und einfach:** erster Satz bei ~1,7 s und gleich ein Witz („Hey, das ist ein Ausgang!“), dann Frage/Antwort im normalen Sprechtempo, Satzlängen 1–3 s, insgesamt nur ~10 Sätze im ersten Teil.
- **Der Wirkmechanismus ist der Höhepunkt:** Das Mittel wird eingeführt, dann sieht man ~6 s ohne Sprache, wie es wirkt (Wasser breitet sich durchscheinend aus, die Brocken werden heller/weicher, rutschen raus). Danach Erleichterung + „Siehste? Hab ich doch gesagt.“
- **Zweiter Teil = Erklärung (≈ die Hälfte des Videos):** Arzt am Patientenbett, der Patient fragt („Doc, wie hilft das?“), der Arzt erklärt ruhig in 5–6 Sätzen, wie es wirkt. Kaum Animation (Blinzeln, Mund). Für uns: 15–20 s, weil der Creator lange Erklärungen früher zu viel fand.
- **Themen:** alltäglich und leicht peinlich (Verstopfung, Zäpfchen), ein Hilfsmittel, dessen Wirkung man sehen kann.
- Englisch erreicht weltweit ein viel größeres Publikum; eine englische Fassung pro Video ist mit denselben Stimmen-Werkzeugen möglich.

### Stil v2 – Feinheiten (gelernt am Pickel-Video, Feedback „noch nicht wie das Beispiel“)

- **Gesichter wie im Vorbild:** große Augen, die sich fast berühren (`gap ≈ r`), kleine Pupillen ohne Glanzpunkt (`toothFace(..., { pupil: 0.24, sw: 3.5 })`), dünne gebogene Brauen, kleiner Mund. Konturen 3–3,5 px, weiche Verläufe (Lederhaut, Eiter, Luft) statt reiner Flächen.
- **Szene groß:** Querschnitt per Wrapper-Gruppe ~1,35× skalieren, damit Gesichter groß sind; die Kamera bleibt trotzdem fest.
- **Arzt-Szene wie im Vorbild (`stationSvg` in `tiktok/pickel/build.mjs`):** Krankenzimmer (graublaue Wand, weiße Leiste), links steht der Arzt (weißes Haar, eckige Brille, **grüne Maske auf**, weißer Kittel, grüne Krawatte, dunkles Hemd, Stethoskop) und zeigt das Mittel auf der Handschuh-Handfläche; rechts sitzt der Patient im Bett vor einem Kissen, vorne die weiße Bettdecke mit grauen Falten. Frage und Erklärung in DERSELBEN Einstellung. Unter der Maske spricht der Arzt über die Hüllkurve (Maske bewegt sich), der Patient hört mit geschlossenen Augen zu und nickt. Szene 1,3× skaliert.
- **Stimmen passen nicht = Tonlage springt oder Figuren klingen gleich:** `qa.maxF0Dev` 0,2; `f0ref` aus den echten multilingual_v2-Takes setzen (nicht aus der Voice-Design-Vorschau). Jede Figur eigenes Register: Haut ~240 Hz (Frau), Pickel ~185 Hz (frecher Mann, `hmzGETctUW7XCobpQ3UF`), Hand ~170 Hz (ruhige Frau, `pDG6X0RdbndwY5oM9QBN`), Finger ~125 Hz (`vSzEU6wMkp9JWMpPv0JD`), Patient ~120, Arzt ~105 (andere Szene). Voice-Design blockt Beschreibungen mit „kleiner Kerl“ + Kosewort: „erwachsener Mann“ schreiben.
- **Arzt bleibt der Kanal-Arzt** (Wunsch des Creators): auch im Krankenzimmer der ursprüngliche Arzt (weißer Zopf, Halbglatze, runde Goldbrille, buschige Brauen, Maske UNTER dem Kinn, blaue gestreifte Krawatte), nur stehend neben dem Bett. Kopf/Zopf/Maske aus `praxisSvg` übernommen (`DOC_T`-Transform), Mund spricht normal mit `talk("doc")`.
- **Story-Dichte wie im Vorbild:** ein Problem, ein falscher Versuch, eine richtige Lösung. Aktion spätestens bei ~5 s, Höhepunkt (Plopp/Wirkung) bei ~18–21 s, keine Zwischenstationen (kein extra Spray). Setup-Gag mit Pointe am Ende einlösen (Date → „Hi! Ich bin sein kleiner Bruder.“ – „Bitte nicht vor dem Date!“). Nebenfiguren (Bakterien) bekommen einen Satz, der die Medizin zeigt („Juhu! Tiefer rein!“).
- Kleine Figuren: Pickel-Stimme per ffmpeg hochpitchen (`asetrate=44100*1.41,aresample=44100,atempo=1/1.41`, Länge bleibt gleich, Wortzeiten stimmen).
- Fehlt beim `check` „Missing browser script …browser.js“, wurde das CLI ohne Kopierschritt gebaut: `node packages/cli/scripts/build-copy.mjs`.
- Ohne Titel im Bild: dem Creator raten, beim Hochladen in TikTok einen Cover-Text zu setzen (z. B. „Pickel ausdrücken? 😳“), weil das erste Bild das Cover ist.

### Nasenbluten (`tiktok/nasenbluten/`, 41 s) – gelernt

- **Ort erkennbar machen:** Ein abstrakter Schlauch liest sich nicht als Nase. Organe in ihrem Körperumriss zeigen (hier: Kopf im Profil mit Stirn, Nase, Lippen, Kinn, Hals; darin Nasenhöhle → Nasenrachen → Rachen, Zunge), Szene 1,55× skaliert um die Nase.
- **Falsches Hausmittel als Bewegung zeigen:** „Kopf in den Nacken“ = ganze Kopf-Gruppe dreht 24° um die Nasenhöhle (`svgOrigin` nah an den Figuren, sonst wandern sie aus dem Bild), das Blut läuft sichtbar den Rachen hinunter. Richtig = Kopf nach vorne (−8°), Handschuh-Hand drückt die Nasenflügel, Gerinnsel bildet sich.
- Offscreen-Startpositionen in einer gedrehten Gruppe weit genug weg legen, sonst rutschen Objekte beim Kippen ins Bild.
- Pointe in der Arzt-Szene: Kevins Finger wandert wieder zur Nase („Ist da noch was drin?“ – Arzt: „Kevin! Finger weg!“), danach Ja/Nein-Sticker oben („Bohrst du in der Nase? Ja oder Nein – schreib's in die Kommentare ↓“).

### Nasenbluten v2 nach Creator-Vorbild (`tiktok/nasenbluten2/`) – gilt ab jetzt

- **Nicht jede Folge ist eine feste Einstellung:** Das Vorbild zum Nasenbluten nutzt 3–4 einfache, sofort klare Ansichten mit harten Schnitten (Blick in die Nase → Nase von vorne groß → Profil beim Zudrücken → Arzt). Entscheidend ist, dass jede Ansicht in 1 s lesbar ist und das Problem groß im Bild ist (Nase füllt die Breite, Szene 1,6× skaliert).
- **Die Hauptfigur ist der Mensch selbst** (Kevin spricht aus dem Off, ärgert sich): wenige sprechende Nebenfiguren statt vieler; zu viele Figuren (Finger, Hand, Äderchen, Popel) wirkten wie ein Kinder-Schaubild („ist scheiße“).
- **Spannung durch Steigerung:** Es hört nicht auf (Taschentuch 1 voll, Taschentuch 2 voll), dann der falsche Weg, dann der richtige. Innenansicht als Lupen-Einblendung statt eigener Szene.
- **Nicht nachbauen:** Prinzipien übernehmen, aber eigene Story, eigene Gags (sprechende Taschentücher, falsches „Kopf in den Nacken“ sichtbar, Heizungsluft-Fakt, Pointe „Nur ganz kurz…“ – „Kevin!“), eigener Arzt.
- Kurze Ausrufe am Satzanfang („Au!“) verschluckt die Stimme oft; „Autsch!“ funktioniert.

### Nasenbluten v3 – Bildsprache des Vorbilds + lebendige Stimmen

- **Bildsprache 1:1 an das Vorbild anlehnen** (Inhalt eigen): feine dunkle Linien 3 px statt dicker Konturen, weiche beige Haut `#F7E2C9` mit breiten hellen Schattenstrichen, Blut flach korallenrot `#F2545B` ohne Kontur, realistische Hände mit Nagel, echtes weißes Taschentuch mit Falten. Einstieg: Nase im Profil aufgeschnitten (dunkelrote Schleimhaut, Kruste, Augen auf der Innenwand), Finger kratzt von unten. Dann Nase frontal bildfüllend (ohne Lippen), dann schlichtes Profil.
- **Stimmen „langweilig“ → `eleven_v3` mit Emotions-Tags** (`[panicked]`, `[whining]`, `[shocked]`, `[disgusted]`, `[sighs]`, `[relieved]`) für die Hauptfiguren; Arzt bleibt multilingual_v2. `voices.mjs` kann das Modell pro Stimme (`"model": "eleven_v3"` in `voices`). Gemessen: v3 9,7 Halbtöne Schwankung gegenüber 8,1 bei v2. Tempo 1,1, `qa.maxF0Dev` 0,3 (Emotion verschiebt die Tonlage). Neue Stimmen: Kevin `cqyVmSq0c5HqMrXd3PFX`, Nase `iMhFrwuReAMs8t3Bbu7O`.
- `mixstt.mjs` zählt [Tags] als Wörter mit – für die Trefferquote Tags vorher entfernen.

## Erzähl-Format (gelernt an einem viralen deutschen Story-Video, umgesetzt in `tiktok/nasenbluten3/`)

- **Erster Satz = offene Regel/Behauptung**, die erst später aufgelöst wird („Wenn deine Nase blutet, mach nie das, was alle machen.“ → Auflösung bei „Kopf in den Nacken“).
- **Ein Erzähler** (Thriller-Stimme `spxwiZxnePFLHftJHjv9`, multilingual_v2, 9,7 Halbtöne Schwankung) in kurzen Präsens-Sätzen; Figuren nur mit 1–2-Wort-Einwürfen (v3 mit Tags).
- **Schnitt alle ~1,5–2 s:** eine Komposition `film`, alle Bilder als eigene `<svg id="set-…">`, `shot(set, t, px, py, k, dur, push)` schaltet hart um und schiebt langsam rein (Kamera geklemmt, sonst weiße Ränder).
- **Arzt nur als Wendung** (ein Satz: „Das war nicht nur der Finger. Das war die Heizung.“), keine Erklär-Szene am Ende.
- **Doppelte Wendung am Ende + Loop:** Heizung auf fünf, Nase juckt, „Nur ganz kurz…“, Schwarzbild mit Tropfen, dann Ja/Nein-Sticker.
- **Untertitel 2–3 Wörter**, Schlüsselwörter gelb (`emph`) oder rot (`red`) in `script.json`.
- Fehlt beim Rendern `hyperframe.manifest.json` oder ein `*.browser.js`, wurde das CLI nur halb gebaut: `cd packages/cli && bun run build`.

### Fingerknacken (`tiktok/fingerknacken/`, 57 s) – Erzähl-Format v2

- **Haken mit echter, überraschender Geschichte** (Arzt knackte 60 Jahre nur links, Ig-Nobelpreis 2009) als offene Frage; Auflösung erst bei ~42 s. Nach der ersten Erklärung (~25 s) sofort eine **zweite offene Frage** („Aber ein Knacken solltest du ernst nehmen.“).
- **Teil-2-Aufhänger am Ende** („Beim Nacken ist das allerdings eine andere Geschichte.“ + „TEIL 2 – Folgen, damit du's nicht verpasst“) als Grund zum Folgen, dazu Ja/Nein-Frage.
- Feste Texte (Jahreszähler) als HTML-Einblendung über dem Film, nicht im gezoomten SVG, sonst rutschen sie bei Nahaufnahmen aus dem Bild.
- Hände von oben: Daumen innen (zur anderen Hand), kleiner Finger außen – vor dem Rendern prüfen.
- Oma-Stimme `1KkrCu2tQ6TMu2pOQOLs` (v3).
