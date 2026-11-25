# Football News Studio – Technischer Plan

Ziel: tagesaktuelle Fußball-News- und Transfer-Videos (TikTok, 1080×1920, 30 fps, MP4) im redaktionellen
News-Stil, gebaut aus **lizenzierten** MAXPPP-Fotos und PressBox-Videos (Stats Perform), recherchiert aus
mehreren seriösen Quellen, mit eigener Einordnung, geschnitten mit FFmpeg.

Wiederverwendet aus dem ersten Prototyp (`apps/football-studio`): Voice-over (ElevenLabs/Piper,
Wort-Zeitstempel), Sprechtext-Aufbereitung, Audio-Mixing/Ducking, Musikgenerator, Job-Queue, Server-Grundgerüst.
Neu gebaut: Medienbibliothek, Lizenzprüfung, News-Recherche, News-Skript, Szenen-Medien-Zuordnung,
FFmpeg-Editor, Dashboard.

---

## 0. Grundsätze (nicht verhandelbar)

1. **Nur lokale, lizenzierte Medien.** Das Programm lädt nichts von MAXPPP oder PressBox herunter und meldet
   sich dort nicht an. Es liest ausschließlich Dateien, die du selbst in die Import-Ordner legst.
2. **Lizenz-Gate.** Eine Datei ist nur verwendbar, wenn ihr eine vollständige, nicht abgelaufene Lizenz
   zugeordnet ist, die TikTok (bzw. die Zielplattform) und – falls nötig – kommerzielle Nutzung erlaubt.
   Alles andere hat den Status `unklar` oder `gesperrt` und wird von der Zuordnung **nie** gewählt.
   Der Render bricht ab, wenn eine nicht freigegebene Datei im Schnitt steckt (zweite Prüfung kurz vor FFmpeg).
3. **Bildnachweis im Video** (z. B. „Foto: MAXPPP“, „Video: PressBox / Stats Perform“) gemäß Lizenzprofil.
4. **Keine erfundenen Informationen.** Jede Aussage im Skript verweist auf Behauptungen (Claims) mit Quellen.
   Gerüchte werden im Text als Gerücht formuliert („laut Sky“, „soll“) – das wird automatisch geprüft.
5. **Eigenes Design.** News-Stil wie bei großen Fußball-Kanälen, aber eigene Marke, Farben und Grafiken –
   keine Logos/Branding anderer Kanäle; Vereinslogos nur, wenn sie lizenziert in der Bibliothek liegen.

---

## 1. Projektstruktur

```
apps/football-news-studio/
  newsstudio/
    config.py            Einstellungen, Pfade, Quellen-Tiers
    db.py                SQLite-Schema + Migrationen
    library/
      models.py          MediaItem, LicenseProfile, Entity (Spieler/Verein/Trainer/Wettbewerb)
      importer.py        Ordner-Scan, Hash-Dedupe, Metadaten lesen, Thumbnails/Proxies
      metadata.py        IPTC/XMP/EXIF (exiftool), ffprobe-Tags, Sidecars (.xml/.json/.csv), Dateinamen-Parser
      entities.py        Spieler-/Vereins-/Trainer-Verzeichnis (Wikidata) + Alias-Erkennung im Text
      license.py         Lizenzprofile, Gate (verwendbar ja/nein + Grund), Ablaufwarnungen
      shots.py           PressBox: Szenenerkennung (scdet), Shot-Liste, In/Out-Punkte, Clip-Typ
      search.py          Suche (Spieler, Verein, Wettbewerb, Datum, Typ, nur-lizenziert)
    news/
      feeds.py           RSS/News-Suche (Google News, Sportschau, Spiegel, SZ, Transfermarkt …)
      articles.py        öffentliche Artikeltexte extrahieren (robots.txt, keine Paywall-Umgehung)
      stories.py         Tagesthemen: Clustering nach Personen/Vereinen, Trend-Score
      claims.py          Aussagen extrahieren, quellenübergreifend abgleichen, Gerücht vs. bestätigt
    script/
      writer.py          Claude: News-Skript als strukturiertes JSON (Szenen)
      validate.py        Zahlen/Claims/Gerüchte-Kennzeichnung prüfen
      fallback.py        ohne API-Key: sachliches Nachrichten-Briefing mit Quellenangaben
    scenes/
      matcher.py         Szenen ↔ Medien (Scoring, Vielfalt, Lizenz-Gate, Warnungen)
      graphics.py        eigene Grafiken (Transfer-Karte, Zahlen-Karte, Zitat, Bauchbinde) als PNG
    editor/
      timeline.py        Schnittliste (EDL) aus Szenen + Voice-Timing
      ffmpeg_render.py   Segmente rendern, Übergänge, Untertitel (ASS), Audio-Mix, Export
      captions.py        ASS-Untertitel mit Wort-Highlight, Namen/Zahlen hervorgehoben
    voice/               Anbieter-Schnittstelle: ElevenLabs, Piper (+ später Azure/Google)
    pipeline.py          Workflow-Schritte + Job-Queue
    server.py            FastAPI-API
  web/                   Dashboard (Dark Mode)
  tests/                 je Produktionsschritt + End-to-End
  media/                 Import-Ordner (nicht im Git): maxppp/, pressbox/, logos/, music/
  data/                  Datenbank, Proxies, Projekte, Exporte (nicht im Git)
```

---

## 2. Medienbibliothek

**Datenmodell (SQLite)**

| Tabelle           | Wichtige Felder                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `media`           | id, pfad, sha256, typ (foto/video), quelle (MAXPPP/PressBox/sonstige), dateiname, titel/caption, aufnahmedatum, breite/höhe/dauer, wettbewerb, ort, bildnachweis, lizenzprofil_id, lizenzstatus (berechnet), notizen, importiert_am |
| `media_entity`    | media_id, entity_id, rolle (abgebildet/erwähnt), herkunft (metadaten/dateiname/manuell), sicherheit                                                                                                                                 |
| `entity`          | id, typ (spieler/verein/trainer/wettbewerb), name, aliase, wikidata_qid, aktueller verein                                                                                                                                           |
| `license_profile` | id, quelle, vertrag/referenz, erlaubte_plattformen, kommerziell (ja/nein), gültig_bis, bildnachweis-vorlage, einschränkungen (z. B. „keine Werbung“, „max. 60 s Bewegtbild“)                                                        |
| `media_override`  | pro Datei abweichende Lizenzfelder (z. B. eigenes Ablaufdatum)                                                                                                                                                                      |
| `shot`            | media_id, start, ende, typ (spielszene/jubel/interview/training/pressekonferenz), thumbnail                                                                                                                                         |

**Lizenzstatus** wird berechnet: `freigegeben` (alles vollständig, Plattform erlaubt, nicht abgelaufen),
`läuft bald ab` (< 30 Tage), `abgelaufen`, `unklar` (Profil fehlt/unvollständig), `gesperrt` (manuell).

**Suche:** Freitext + Filter (Spieler, Verein, Trainer, Wettbewerb, Zeitraum, Foto/Video, Shot-Typ,
„nur verwendbar“). Beispiel „Harry Kane“ → alle Dateien mit Entity Kane, sortiert nach Aufnahmedatum,
Videos mit ihren Shots.

---

## 3. Import MAXPPP / PressBox

- **Ordner-Import** (`media/maxppp`, `media/pressbox` oder frei wählbar) + Upload im Dashboard; erneuter
  Scan erkennt neue/geänderte Dateien per Hash.
- **MAXPPP-Fotos:** IPTC/XMP über `exiftool` – Caption/Headline, Keywords, Person-in-Image, Credit/By-line,
  Copyright, Aufnahmedatum, Ort, Event. Daraus Spieler/Verein/Wettbewerb/Datum/Bildnachweis.
- **PressBox-Videos:** `ffprobe`-Tags + Sidecar-Dateien (XML/JSON/CSV, die beim Download mitkommen) +
  Dateinamen-Muster (konfigurierbar, z. B. `2026-11-22_FCB-BVB_Kane_goal.mp4`). Dazu automatische
  Shot-Erkennung (`scdet`), Vorschaubilder je Shot, 540p-Proxy für schnelle Vorschau.
- **Entity-Erkennung:** Abgleich der Texte gegen ein Spieler-/Vereins-/Trainer-Verzeichnis (Wikidata, mit
  Aliasen wie „Kane“, „FCB“, „Bayern“). Unsichere Treffer werden markiert und sind im Dashboard bestätigbar.
- **Lizenz beim Import:** Standard-Lizenzprofil je Quelle (einmal mit deinen Vertragsdaten anlegen), pro
  Datei überschreibbar. Ohne Profil → `unklar` → nicht verwendbar.

> Offen: Die genauen Metadaten deiner MAXPPP-/PressBox-Dateien kenne ich nicht. Mit je 2–3 Beispieldateien
> (oder nur deren Metadaten) wird der Parser exakt darauf eingestellt. Bis dahin teste ich mit
> selbst erzeugten Testdateien, die die üblichen IPTC-Felder bzw. Sidecar-Formate nachbilden.

---

## 4. Fußball-Recherche (tagesaktuell)

- **Aktuelle Themen:** Alle 30 Min. Feeds abrufen (geprüft erreichbar: Google News Suche, Sportschau,
  Spiegel Sport, SZ Sport, Transfermarkt-News; kicker und Sport1 blockieren automatische Abrufe → nur über
  Google News als Überschrift + Link). Clustering nach Personen/Vereinen der letzten 24–48 h →
  Trend-Liste („Musiala“, „Kane-Zukunft“ …) mit Anzahl Quellen und Stand.
- **Eingabe eines Themas** („FC Bayern plant einen spektakulären Transfer“) → gezielte News-Suche, Artikel
  öffentlich abrufbarer Seiten lesen (robots.txt beachten, keine Paywall/Login-Umgehung; bei Paywall nur
  Überschrift/Teaser).
- **Claims:** jede Aussage mit Quelle, Datum und Formulierung. Klassifizierung:
  `bestätigt` (offizielle Vereins-/Verbandsquelle oder wörtliches Zitat eines Beteiligten, von Tier-1-Medien
  berichtet), `berichtet` (mehrere unabhängige Tier-1/2-Medien), `Gerücht` (Einzelquelle oder
  Konjunktiv-/Gerüchtesprache: „soll“, „angeblich“, „laut Bericht“, „Interesse“), `widersprüchlich`.
- **Zahlen-Abgleich:** Ablösesummen, Vertragslaufzeiten, Gehälter, Statistiken über alle Quellen vergleichen;
  Abweichungen werden markiert („Sky: 80 Mio., Bild: 100 Mio.“).
- **Quellen-Tiers** konfigurierbar (z. B. Tier 1: Verein offiziell, dpa, kicker, Sky, Sportschau, FAZ, SZ,
  Spiegel; Tier 2: Bild, Sport1, Merkur/tz, Transfermarkt; Tier 3: Aggregatoren).
- Alles wird im Projekt gespeichert: Artikel-URL, Abrufzeit, Textauszug, Hash.

---

## 5. Skriptgenerator

- **Claude (empfohlen, faktisch notwendig für den gewünschten Stil):** Bekommt nur die Claims mit Status
  und Quellen, schreibt 60–120 s journalistisches Deutsch mit Hook, Spannungsbogen, eigener Einordnung,
  hoher Informationsdichte. Ausgabe als strukturiertes JSON pro Szene: Sprechertext, verwendete Claim-IDs,
  Medienwunsch (Entities + Typ: Spielszene/Interview/Foto/Grafik), Bildbewegung, Übergang, Quellenangabe.
- **Prüfer** (unabhängig vom Modell): jede Zahl muss in den Quellen stehen; Szenen mit Gerüchte-Claims
  müssen Gerüchte-Sprache oder eine Quellennennung enthalten; widersprüchliche Claims nur mit Nennung
  beider Versionen; bei Fehlern automatischer zweiter Versuch, sonst Freigabe gesperrt.
- **Ohne API-Key:** nur ein sachliches Kurzbriefing aus Claims mit Quellennennung. Journalistischer Stil und
  echte Einordnung sind damit **nicht** erreichbar – das sage ich offen.

---

## 6. Automatische Szenenzuordnung (Kernstück)

Für jede Szene wird ein Score über alle **verwendbaren** Medien berechnet:

| Kriterium                                                                                                | Gewicht |
| -------------------------------------------------------------------------------------------------------- | ------- |
| Entity-Treffer: Hauptperson der Szene ist abgebildet                                                     | hoch    |
| Verein passt zum Kontext (Kane **im Bayern-Trikot**: Vereinsfeld der Datei + Aufnahmedatum nach Wechsel) | hoch    |
| Medientyp passt zum Satz (Tor/Spiel → Spielszene; „sagte“ → Interview/PK; Training → Training)           | mittel  |
| Aktualität (neuere Aufnahmen bevorzugt)                                                                  | mittel  |
| Vielfalt: Datei/Shot noch nicht verwendet, Wechsel Foto ↔ Video, Video-Anteil ≥ 50 % wenn vorhanden      | mittel  |
| Technische Eignung (Auflösung, Hochformat-Crop möglich)                                                  | niedrig |

- Lange Szenen werden in mehrere Schnitte (2–3,5 s) aufgeteilt → keine endlosen Standbilder.
- Kein passendes lizenziertes Material → **Warnung** im Dashboard mit Grund („keine freigegebenen Kane-Videos;
  2 Fotos abgelaufen“) und Ersatz durch eine eigene Grafik (Transfer-Karte, Zahlen-Karte, Zitat-Karte).
- Im Dashboard ist jede Zuordnung austauschbar (Vorschlagsliste mit Scores, In/Out-Punkt für Videos).

---

## 7. Videoeditor (FFmpeg)

- Pro Schnitt ein Segment 1080×1920/30 fps:
  - **Foto:** Smart-Crop auf 9:16 (Personenschwerpunkt aus Metadaten bzw. Bildmitte) + langsamer
    Zoom/Schwenk (`zoompan`), optional unscharfer Hintergrund bei Querformat.
  - **Video:** Trim auf Shot, Crop/Scale auf 9:16 (oder Querformat mittig über unscharfem Hintergrund),
    Originalton stumm oder leise, Speed-Ramp optional.
  - **Grafiken/Bauchbinden/Headline-Balken/Transfer-Karte:** PNG/MOV-Overlays (Pillow bzw. HTML-Render).
- Übergänge mit `xfade` (Schnitt, Whip/Slide, Zoom, Flash) nach Szenenvorgabe; schnelle Wechsel.
- **Untertitel** als ASS (libass): Wort-für-Wort-Highlight synchron zur Stimme, Namen und Zahlen farbig
  hervorgehoben, in der TikTok-Safe-Zone.
- **Quellen-/Bildnachweis-Einblendung** je Szene; Abspann mit Quellenliste.
- **Audio:** Stimme auf −16 LUFS, dezente Musik mit Sidechain-Ducking, Gesamt −14 LUFS, Fades.
- Export MP4 (H.264 High, AAC 48 kHz), plus schnelle Vorschau in 540p.

---

## 8. Voice-over

Anbieter-Schnittstelle (`synthesize(text, voice, speed) → audio + Wort-Zeitstempel`):
ElevenLabs (deutsche männliche Nachrichtenstimme auswählbar – Voice-ID oder Stimmen-Liste, sobald der Key
die Berechtigung `voices_read` hat), Piper „Thorsten“ lokal als kostenloser Ersatz; weitere Anbieter
(Azure, Google) über dieselbe Schnittstelle. Audio wird exportiert (WAV + MP3).

---

## 9. Dashboard (Dark Mode)

Neues Video · Aktuelle Themen · Medienbibliothek (Suche, Lizenzstatus, Ablaufwarnungen) · MAXPPP-Bilder ·
PressBox-Videos (Shots, Trimmen) · Recherche (Claims mit Status und Quellen) · Skriptbearbeitung ·
Szenen/Medienzuordnung (Warnungen, Austausch) · Video-Vorschau · Export.

---

## 10. Workflow und Tests

| #   | Schritt             | Automatischer Test                                                                                        |
| --- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | Projektstruktur, DB | Schema-Migration, Einstellungen                                                                           |
| 2   | Medienbibliothek    | CRUD, Suche, Lizenz-Gate (abgelaufen/unklar/Plattform fehlt → nie verwendbar)                             |
| 3   | Import              | Testdateien mit IPTC/XMP + PressBox-Sidecars → richtige Entities, Daten, Credits; Shot-Erkennung          |
| 4   | Medienzuordnung     | „Kane verlässt Bayern“ → Kane-Bayern-Material vor Kane-Tottenham; Warnung ohne Material                   |
| 5   | Recherche           | Live: echtes Tagesthema, ≥ 3 Quellen, Claims mit Status                                                   |
| 6   | Skript              | Prüfer: erfundene Zahl → Fehler; Gerücht ohne Kennzeichnung → Fehler                                      |
| 7   | Voice-over          | Wortzeiten monoton, Länge im Zielkorridor                                                                 |
| 8   | Videoschnitt        | 1080×1920, 30 fps, H.264/AAC, Dauer = Voice-over, Lautheit, kein Standbild > 3,5 s, keine gesperrte Datei |
| 9   | Dashboard           | Browser-Test aller Bereiche                                                                               |
| 10  | End-to-End          | Thema eingeben → fertiges MP4                                                                             |

**Testmedien:** Ich habe keinen Zugriff auf deine MAXPPP-/PressBox-Dateien. Für Tests erzeuge ich eigene
Testbilder/-clips mit nachgebildeten Metadaten (klar als Testmaterial markiert). Echte Medien verarbeitet
die Software auf deinem Rechner. Die Medien liegen bei dir, deshalb muss die Software dort laufen
(Installation per `setup.sh` bzw. `setup.ps1`).
