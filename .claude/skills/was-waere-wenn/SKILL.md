---
name: was-waere-wenn
description: Deutsche TikTok-Serie "Was wäre, wenn …?" (Wissens-Gedankenexperimente, Hochformat, Erzählerstimme, eine durchgehende Kamerafahrt durch eine gezeichnete Welt), komplett in Code mit HyperFrames gebaut. Verwenden, wenn der Creator eine neue Folge will ("Was wäre, wenn wir zwei Monde hätten?", "… die Erde aufhört sich zu drehen" usw.).
---

# Was wäre, wenn …? (TikTok, Deutsch)

Referenzprojekt: `tiktok/mond/` (Folge 1, v4). Kopieren und umbauen:
`build.mjs` (Welt, Beats, Untertitel, Ton), `script.json` (Zeilen, Stimme, SFX),
`voices.mjs` (ElevenLabs + QA), `sfx-gen.mjs`, `env.py`, `f0s.py`. Lies vorher `/hyperframes`.
Projekt-Regeln aus `.claude/skills/medizin-cartoon/SKILL.md` (Sicherheitszonen, Stimmen-QA,
Lautheit) gelten hier auch.

## Arbeitsregel des Creators (verbindlich)

**Selbst kritisieren und sofort korrigieren, bevor du abgibst.** Nach jedem Build:
Snapshots an jedem Beat ansehen und jede Schwäche, die du selbst erkennst, direkt beheben,
statt sie nur zu nennen: leere Bildhälften, Szenen ohne Bewegung während der Sprecher redet,
Text doppelt (Overlay wiederholt die Untertitel), unlogische Orte (Löwen am deutschen Strand),
Füll-Beats ohne Pointe, CSS, das sich gegenseitig überschreibt, Elemente vor wichtigen
Bildteilen. Erst rendern, wenn dir beim Durchsehen nichts mehr auffällt. Im Bericht nur noch
sagen, was du korrigiert hast und was ehrlich offen bleibt.

## Look ab v5: POV in echtem 3D (Feedback: "zu einfach, zu langweilig, mehr aus Sicht eines Menschen")

- Kein HeyGen und kein neues Konto (Creator will keine Zusatzkosten). Stattdessen `pov.mjs`:
  Three.js r149 (`assets/three.min.js`, im `index.html` geladen) mit freien Texturen aus dem
  three.js-Repo (`assets/tex/`: NASA-Erde Tag/Nacht/Wolken, Mond, Milchstraße, Wasser-Normalen),
  gerendert aus `render(t)` über `tl.eventCallback("onUpdate")` + `hf-seek`, Texturen über
  `window.__hf.buildReady`.
- Jede Station ist eine Einstellung aus deiner Sicht: Augenhöhe, Handkamera-Wackeln, Gegenstände
  im Bild (Handy mit Kalender-App, Taschenlampe, Finsternis-Brille). Flache Grafik nur noch für
  Texte, Karten und Stempel.
- Stolperfallen: Wolken stecken im Alpha-Kanal von `earth_clouds_1024.png`; Wolken und Erde
  brauchen dieselbe Lichtrichtung; beim Zoom auf ein Land die Sonne mitdrehen, sonst liegt es
  auf der Nachtseite; GSAP auf einer `<g>` mit eigenem `transform` überschreibt die Position
  (immer eine äußere Gruppe zum Platzieren, eine innere zum Animieren); Meeres-Ebene bis vor die
  Kamera ziehen, sonst schaut unten der Himmel durch. Render dauert ~9 min (Software-WebGL).

## Inhalt

- **Mischung aus echt und witzig:** etwa 4 echte Staun-Fakten + 1–2 Gags. Echte Fakten mit
  Überraschung ("Moment, echt?"), keine Schulbuch-Fakten. Gags sind wahr oder klar als Witz
  erkennbar (Ostern fällt aus = wahr, Werwölfe arbeitslos = Witz am Ende).
- **"Du"-Bezug** an jeder Station (dein Haus, dein Deutschland, dein Ostern).
- **Höhepunkt konkret**, nie abstrakt: nicht "Achse kippt 64°", sondern
  "Deutschland: Sommer = Wüste, Winter = Arktis".
- **Fakten belegen**, im Zweifel "könnte". Mond-Folge: Ostern (Nicäa-Regel), Löwen-Angriffe in
  dunklen Nächten (Packer et al. 2011), Sonne/Mond 400× Durchmesser und 400× Abstand,
  Gezeiten ohne Mond ~⅓, Achse ohne Mond instabil (Laskar 1993; vorsichtig formulieren).
- **Ende:** Kommentar-Frage ("Was würdest du am meisten vermissen?") + Teaser der nächsten Folge
  ("Teil 2: …", "Folgen, damit du es nicht verpasst").

## Stimme und Tempo (Feedback: "zu langsam, zu viele Pausen")

- Eigene Erzählerstimme `JYafmsWQW103q9CaNv5y` ("Was wäre wenn – Erzähler"), für jede Folge.
- `eleven_multilingual_v2`, stability 0.4, style 0.55, `tempo` 1.12, `maxPause` 0.12.
- Pausen zwischen Sätzen (`WAIT` in `build.mjs`) 0.1–0.35 s; Kamerafahrten laufen,
  während schon gesprochen wird. Längere Pause nur vor einem Gag (Werwolf: 0.85 s, Heulen davor).
- Zahlen ausschreiben ("vierhundertmal"), Komposita mit Bindestrich ("Frühlings-Vollmond").

## Bild

- 1080×1920, eine Welt-SVG (Weltall oben → Himmel → Küste → Unterwasser), Kamera = `#cam` (y),
  `#zoom` (≤ 1,15), `#shake`. Ortswechsel, die nicht in die Welt passen (Savanne), als
  Vollbild-Overlay, das von rechts hereinwischt.
- Trägerelement: der gestrichelte Geister-Mond taucht in jeder Station auf.
- Erde aus echten Küstenpunkten (Länge/Breite, orthografische Projektion), nie freihändig.
- Flache Formen + statisches Bildkorn (`assets/grain.png`, overlay 0.22). Akzent Gelb `#FFD23F`.
- Hook: Titel ab Frame 0, Ereignis in der ersten Sekunde (Mond bekommt Risse und implodiert).
- Overlays nie im Untertitel-Band (y ≈ 1210–1330) und nicht im TikTok-Rand (oben < 340,
  rechts x > 880 bei y 880–1700, unten > 1540).
- CSS-Falle: `.ov` setzt `left/right: 0` und zentriert; eigene Positionen über die `#id`
  setzen, sonst werden Marken zu Vollbreiten-Balken.

## Ablauf

1. Skript in `script.json` → `node voices.mjs` (QA per Spracherkennung) → `node sfx-gen.mjs`.
2. `node build.mjs` → `lint` → `check` → Snapshots an jedem Beat → **selbst korrigieren**.
3. `render -q delivery`, dann `loudnorm=I=-14:TP=-1.5`, fertigen Mix transkribieren (alle Wörter).
