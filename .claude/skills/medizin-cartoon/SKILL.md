---
name: medizin-cartoon
description: Deutsche TikTok-Erklärvideos im Medizin-Cartoon-Stil (Organe/Zähne mit Glupschaugen streiten sich, Eingriff von außen, Arzt erklärt in der Praxis), komplett in Code mit HyperFrames gebaut. Verwenden, wenn der Creator ein neues Video zu einem medizinischen Thema will ("mach ein Video über …", Nierenstein, Mandeln, Weisheitszahn usw.).
---

# Medizin-Cartoon (TikTok, Deutsch)

Hochformat-Kurzvideos, die den Referenzen des Creators folgen (Stil wie die
"Dr. healthcare"-Videos, aber **ohne** deren Wasserzeichen oder Namen; immer
das Handle des Creators). Alles ist Code: SVG-Zeichnungen und GSAP-Timeline in
HyperFrames-Kompositionen. Lies vorher `/hyperframes` (Vertrag, Workflow).

Referenzprojekt, das du kopierst und umbaust: `tiktok/weisheitszahn/`.
Bauteile-Bibliothek: `lib/parts.mjs` (Augen, Münder, Zahn, Instrumente, Schmerzstern, Naht, Untertitel).

## Dramaturgie (immer gleich)

| Teil                | Zeit (30-s-Version) | Inhalt                                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Hook im Körper   | 0–9 s               | Anatomische Nahaufnahme. Zwei Körperteile mit Gesichtern **streiten sich** (der Verursacher frech und genervt, das Opfer im Schmerz). Schon Frame 0 zeigt beide Gesichter und das Problem (Schmerzstern).                                                                                         |
| 2. Zeitsprung-Karte | ~1,4 s              | Schwarz, lila Blumenmuster, türkise Schrift „SPÄTER…“ (oder „15 MINUTEN SPÄTER“ in Gelb). Whoosh rein und raus.                                                                                                                                                                                   |
| 3. Eingriff         | ~10 s               | Dieselbe Szene: Instrumente und Handschuhhände kommen schräg von außen ins Bild (Spritze → Skalpell → Hebel → Zange …). Jede Aktion ist ein Beat mit Reaktion der Figur (Schock, betäubt, Panik, Schrei). Danach: Wunde, Naht, die Erleichterung des Opfers.                                      |
| 4. Arzt erklärt     | ~10 s               | Harter Schnitt in eine flache Praxisszene (grüne Wand, Leiste, graue Fliesen). Arzt im weißen Kittel mit hellblauer Kleidung, Patient im Stuhl oder Bett. Kaum Bewegung, nur Mund, Blinzeln, leichte Armbewegung. Der Arzt erklärt in 2–3 Sätzen medizinisch korrekt, was passiert ist und warum. |

Eine 60-s-Version streckt Teil 1 und Teil 3 (mehr Dialog-Beats), nicht Teil 4.

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
6. **Stimme**: Deutsch braucht HeyGen (`/media-use`, `npx hyperframes auth login`); Kokoro (`hyperframes tts`) kann kein Deutsch. Pro Figur eine eigene Stimme (Opfer höher und gestresst, Verursacher frech, Arzt ruhig). Danach transkribieren (`transcribe --model small --language de`) und die Wortzeiten statt `wordTimes()` in die Untertitel geben; die Zeilenfenster in `script.json` an die echte Audiolänge anpassen.
7. Rendern: `render -q delivery -o renders/<thema>_vN.mp4`.

## Regeln

- Medizinischer Inhalt muss stimmen; im Zweifel vorsichtig formulieren und keine Dosierungen oder Heilversprechen nennen.
- Keine fremden Wasserzeichen, Namen oder Logos (kein „Dr.healthcare“, kein TikTok-Endscreen; den fügt TikTok selbst an).
- Kein Gore: Blut ist flach und stilisiert, Wunden werden gleich versorgt.
- Deterministisch: kein `Math.random`, keine Timer; alle Bewegung in der Timeline.
