# Grusel-Storys (TikTok-Serie, Deutsch)

Interaktive Horror-Serie in der Du-Perspektive: Am Ende jeder Folge schreiben die
Zuschauer **A** oder **B** in die Kommentare, die Mehrheit entscheidet Teil 2.
Alles ist Code: 3D-Szene in Three.js (`folge1/assets/scene.js`, lokal unter `assets/three/`, weil das CDN
hier gesperrt ist), Untertitel und Endkarte als HyperFrames-Kompositionen, 1080×1920, 30 fps.

| Folge | Ordner    | Thema                                                               |
| ----- | --------- | ------------------------------------------------------------------- |
| 1     | `folge1/` | Stockwerk 13: der Aufzug hält in einem Stockwerk, das es nicht gibt |

## Bauen

```bash
cd tiktok/grusel/folge1
python3 sfx.py            # synthetische SFX (deterministisch) -> assets/sfx/*.mp3
python3 voices.py         # Erzähler -> assets/vo/<zeile>.mp3 + timings.json
node build.mjs            # index.html (3D-Bühne + Ton) + compositions/{captions,overlay}.html
node ../../../packages/cli/dist/cli.js lint
node ../../../packages/cli/dist/cli.js snapshot --at 4,20,40.7   # 3D-Beats ansehen (check dauert mit 3D sehr lange)
node ../../../packages/cli/dist/cli.js render -q delivery -o renders/stockwerk13_teil1.mp4
# Lautheit nah an den Vorbildern, Spitzen begrenzt, kleiner Fade gegen den Boom-Spike in Frame 0:
ffmpeg -i renders/stockwerk13_teil1.mp4 -c:v libx264 -crf 21 -preset slow -pix_fmt yuv420p \
  -af "afade=t=in:d=0.025,volume=3.4dB,alimiter=limit=0.75:attack=1:release=60:level=false" \
  -c:a aac -b:a 192k -movflags +faststart renders/stockwerk13_teil1_final.mp4
```

Text und Timing stehen in `script.json`. Jede Zeile hat `id`, `text`, optional `emph`
(rote Untertitel) und `gap` (Pause davor). Alle Schnitte und Aktionen hängen an den
Wortzeiten der Erzählung (`W_("n9", "dreizehn")`), nicht an festen Sekunden: `build.mjs` schreibt sie als
`window.__STK.ev` in `index.html`, `scene.js` berechnet daraus jedes Bild als reine Funktion von t
(Kamera pro Schnitt, Türen, Anzeige, Licht, Mimik).

### 3D-Set (`scene.js`, Einheiten in Metern)

- Kabine x −0,9…0,9, z −1,6…0, Tür bei z = 0. Bedienfeld und Zettel an der Frontwand neben der Tür
  (von hinten gesehen rechts, damit das A-Etikett im Wahl-Shot auf den EG-Knopf zeigen kann).
- Lobby (EG) und Flur im 13. Stock liegen beide vor der Tür (z > 0) und werden umgeschaltet.
- Figur: Gliederpuppe aus Kapseln/Kugeln, Gesicht aus Ringen, Brauen und Mund (`setExpr`: neutral,
  worried, shock). Silhouette: dieselbe Figur in unbeleuchtetem Schwarz mit leuchtenden Augen und Grinsen.
- Achtung: von hinten auf +z geschaut liegt +x links im Bild.

## Stimme

`script.json → voice.engine`:

- `"elevenlabs"` (aktuell): **Brian** (`nPczCjzI2devNBz1zQrb`), `eleven_multilingual_v2`, Stabilität 0,5.
  Wortzeiten aus `/with-timestamps`, jede Zeile wird per scribe gegen den Text geprüft
  (`qa: maxTakes 3, maxWer 0.1`, Ziffern werden normalisiert). Brian spricht ~3 Wörter/s wie die Vorbilder.
  Die Bibliothekssuche nach deutschen Stimmen braucht „Voices: Read“ am Key.
- `"mbrola"`: Notlösung offline, `espeak-ng` + MBROLA `mb-de6` (`apt-get install espeak-ng mbrola mbrola-de6`),
  180 wpm, danach tiefer, wärmer, komprimiert, kleiner Raum. Wortzeiten werden aus den Pausen im Signal
  plus Silbengewichtung geschätzt.

Danach `node build.mjs`: Untertitel, Schnitte und Audio-Clips übernehmen die neuen Längen.

## Erkenntnisse aus den Vorbildern (3 Folgen einer U-Bahn-Serie, gemessen)

- **Länge** 96–117 s + 3 s TikTok-Endscreen. Unsere Folgen: ~60–65 s.
- **Kein Hook-Text**: Frame 0 ist die Szene, der Erzähler startet nach ~0,3 s mit „Stell dir vor …“.
  Teil 2+ starten mit einem Rückblick: „Also, hast du dich entschieden …?“
- **Du-Form**, gezeigt wird eine Figur (Gliederpuppe mit einfachem Gesicht), keine Ego-Kamera.
- **Tempo**: ~3 Wörter/s, ein Schnitt alle 3–4 s (Totale → Reaktion im Gesicht → Gegenstand als Vollbild).
- **Gegenstände als Karten**: Handy (Uhrzeit, 3 % Akku, kein Netz), Zettel mit abgerissener Regel,
  Lageplan, Countdown. Der abgerissene Zettel ist der Cliffhanger.
- **Bedrohung**: schwarze Silhouette mit leuchtenden Augen und gezacktem Grinsen, meist nur angedeutet.
- **Wahl**: Der Erzähler nennt die Optionen; sobald eine genannt wird, erscheint ein Etikett mit Linie zum
  Objekt in der Szene („A BLEIBEN“ → Knopf). Ende: „Also, was machst du?“ + ängstliches Gesicht.
- **Teil 2** zeigt beide Wege: der verlierende endet im Schreckmoment, Zurückspulen (◀◀), dann der
  Mehrheitsweg bis zur nächsten Wahl. Ein Chip oben zeigt den laufenden Weg.
- **Ton**: sehr laut (−7 bis −8 LUFS integriert), keine Stille außer dem Endscreen, Drone darunter,
  SFX auf jedem Schnitt.
- **Untertitel**: 1–2 Wörter, weiß, fett, Großbuchstaben, dunkle Kontur, bei ~68 % der Bildhöhe.

## Hausregeln (aus dem Medizin-Skill übernommen)

- Frame 0 ist das Thumbnail: rote „13“ auf der Etagenanzeige + Boom + Erzähler ab 0,3 s.
- Nie digitale Stille: Drone läuft durch, SFX nie direkt auf einen Satzanfang.
- Untertitel nicht doppelt zu Text im Bild (Zettel, Endkarte) und nicht über Gesichtern.
- Kein Wasserzeichen. Deterministisch: kein `Math.random`, keine Timer.

## Teil 2 (Stockwerk 13) – Ansätze

- **A gewinnt**: Rückblick, B als Schreckmoment (Flur, Türen knallen zu, Silhouette direkt hinter dir),
  Zurückspulen, dann A: Aufzug fährt runter, die Anzeige zählt weiter: −1, −2, … → neue Wahl.
- **B gewinnt**: A als Schreckmoment (Licht aus, die Stimme kommt jetzt aus dem Lautsprecher in der Kabine),
  Zurückspulen, dann B: hinter dir schließt sich der Aufzug, alle Wohnungstüren gehen gleichzeitig zu → neue Wahl.
