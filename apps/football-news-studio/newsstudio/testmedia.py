"""Erzeugt TESTMATERIAL (keine echten Agenturbilder!) mit realistischen Metadaten,
damit Import, Zuordnung und Schnitt ohne echte MAXPPP-/PressBox-Dateien getestet werden können."""

from __future__ import annotations

import json
import struct
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Helvetica.ttc",
                   "C:/Windows/Fonts/arialbd.ttf"]


def font(size: int):
    for f in FONT_CANDIDATES:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default(size)


def _iptc_app13(fields: dict[tuple[int, int], list[str] | str]) -> bytes:
    data = b"\x1c\x01\x5a\x00\x03\x1b\x25\x47"  # 1:90 Zeichensatz UTF-8
    for (rec, ds), val in fields.items():
        for v in (val if isinstance(val, list) else [val]):
            b = v.encode("utf-8")
            data += bytes([0x1C, rec, ds]) + struct.pack(">H", len(b)) + b
    res = b"8BIM" + struct.pack(">H", 0x0404) + b"\x00\x00" + struct.pack(">I", len(data)) + data
    if len(data) % 2:
        res += b"\x00"
    payload = b"Photoshop 3.0\x00" + res
    return b"\xff\xed" + struct.pack(">H", len(payload) + 2) + payload


def _xmp(persons: list[str], credit: str, desc: str) -> bytes:
    li = "".join(f"<rdf:li>{p}</rdf:li>" for p in persons)
    return f"""<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
 xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" photoshop:Credit="{credit}">
<dc:description><rdf:Alt><rdf:li xml:lang="x-default">{desc}</rdf:li></rdf:Alt></dc:description>
<Iptc4xmpExt:PersonInImage><rdf:Bag>{li}</rdf:Bag></Iptc4xmpExt:PersonInImage>
</rdf:Description></rdf:RDF></x:xmpmeta>""".encode()


def _card(text: str, sub: str, color: tuple, size=(2400, 1600)) -> Image.Image:
    im = Image.new("RGB", size, color)
    d = ImageDraw.Draw(im)
    for i in range(0, size[0], 160):
        d.line([(i, 0), (i - 600, size[1])], fill=tuple(min(255, c + 25) for c in color), width=40)
    d.ellipse([size[0] * 0.38, size[1] * 0.18, size[0] * 0.62, size[1] * 0.62], fill=(240, 220, 200))  # "Person"
    d.rectangle([size[0] * 0.33, size[1] * 0.6, size[0] * 0.67, size[1]], fill=tuple(max(0, c - 60) for c in color))
    d.rectangle([0, 0, size[0], 150], fill=(0, 0, 0))
    d.text((40, 30), "TESTMATERIAL – KEIN AGENTURBILD", font=font(80), fill=(255, 210, 0))
    d.text((60, size[1] - 330), text, font=font(130), fill=(255, 255, 255))
    d.text((60, size[1] - 170), sub, font=font(80), fill=(255, 255, 255))
    return im


def make_photo(path: Path, person: str, club: str, caption: str, date: str, color=(170, 20, 30), byline="Test Fotograf"):
    path.parent.mkdir(parents=True, exist_ok=True)
    im = _card(person, f"{club} · {date}", color)
    tmp = path.with_suffix(".tmp.jpg")
    im.save(tmp, "JPEG", quality=88, xmp=_xmp([person], "MAXPPP", caption))
    raw = tmp.read_bytes()
    tmp.unlink()
    iptc = _iptc_app13({(2, 120): caption, (2, 25): [person, club, "Fussball"], (2, 80): byline,
                        (2, 110): "MAXPPP", (2, 116): "TEST", (2, 55): date.replace("-", ""), (2, 90): "München"})
    path.write_bytes(raw[:2] + iptc + raw[2:])
    return path


def make_video(path: Path, title: str, colors: list[tuple], seconds_per_shot: float = 2.5, sidecar: dict | None = None,
               sidecar_format: str = "xml"):
    """Mehrere 'Shots' (harte Schnitte) mit Bewegung, damit Szenenerkennung etwas findet."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmpdir = path.parent / (path.stem + "_tmp")
    tmpdir.mkdir(exist_ok=True)
    parts = []
    for i, c in enumerate(colors):
        img = tmpdir / f"s{i}.png"
        _card(title, f"Shot {i + 1} · TESTVIDEO", c, size=(1920, 1080)).save(img)
        part = tmpdir / f"s{i}.mp4"
        frames = int(seconds_per_shot * 25)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", str(img), "-vf",
                        f"zoompan=z='1+0.002*on':x='iw/2-(iw/zoom/2)+on*2':y='ih/2-(ih/zoom/2)':d={frames}:s=1920x1080:fps=25",
                        "-frames:v", str(frames), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", str(part)],
                       check=True)
        parts.append(part)
    lst = tmpdir / "list.txt"
    lst.write_text("".join(f"file '{p.name}'\n" for p in parts))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-f", "lavfi", "-i",
                    "sine=frequency=220:sample_rate=48000", "-shortest", "-c:v", "copy", "-c:a", "aac",
                    "-metadata", f"title={title}", "-metadata", "comment=TESTMATERIAL", str(path)], check=True)
    for p in tmpdir.iterdir():
        p.unlink()
    tmpdir.rmdir()
    if sidecar:
        if sidecar_format == "json":
            path.with_suffix(".json").write_text(json.dumps(sidecar, ensure_ascii=False, indent=1))
        else:
            body = "".join(f"<{k}>{', '.join(v) if isinstance(v, list) else v}</{k}>" for k, v in sidecar.items())
            path.with_suffix(".xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?><asset>{body}</asset>')
    return path


def build_test_library(root: Path) -> list[Path]:
    """Kleine Testbibliothek rund um FC Bayern / Kane / Musiala / Kompany / Eberl."""
    m, v = root / "maxppp", root / "pressbox"
    files = [
        make_photo(m / "MAXPPP_Kane_FCB_2026.jpg", "Harry Kane", "FC Bayern München",
                   "Harry Kane (FC Bayern München) bejubelt sein Tor in der Bundesliga", "2026-11-08"),
        make_photo(m / "MAXPPP_Kane_Tottenham_2022.jpg", "Harry Kane", "Tottenham Hotspur",
                   "Harry Kane of Tottenham Hotspur during the Premier League match", "2022-10-01", color=(20, 30, 120)),
        make_photo(m / "MAXPPP_Musiala_01.jpg", "Jamal Musiala", "FC Bayern München",
                   "Jamal Musiala (FC Bayern München) im Spiel gegen Borussia Dortmund", "2026-10-25"),
        make_photo(m / "MAXPPP_Musiala_02.jpg", "Jamal Musiala", "FC Bayern München",
                   "Jamal Musiala beim Training des FC Bayern", "2026-11-12", color=(150, 10, 40)),
        make_photo(m / "MAXPPP_Kompany.jpg", "Vincent Kompany", "FC Bayern München",
                   "Trainer Vincent Kompany an der Seitenlinie", "2026-11-01", color=(90, 10, 20)),
        make_photo(m / "MAXPPP_Eberl.jpg", "Max Eberl", "FC Bayern München",
                   "Sportvorstand Max Eberl spricht mit Journalisten", "2026-11-20", color=(60, 60, 60)),
        make_video(v / "2026-11-08_FCB-BVB_Kane_goal_highlights.mp4", "Kane Tor gegen BVB",
                   [(180, 20, 30), (20, 120, 40), (200, 200, 30)],
                   sidecar={"title": "Bayern v Dortmund – Kane goal", "players": ["Harry Kane"],
                            "teams": ["FC Bayern München", "Borussia Dortmund"], "competition": "Bundesliga",
                            "date": "2026-11-08", "copyright": "Stats Perform"}),
        make_video(v / "2026-11-12_FCB_Training_Musiala.mp4", "Musiala Training",
                   [(120, 20, 30), (30, 90, 30)],
                   sidecar={"title": "FC Bayern training session", "persons": "Jamal Musiala; Vincent Kompany",
                            "team": "FC Bayern München", "type": "training", "recorded": "2026-11-12"}, sidecar_format="json"),
        make_video(v / "2026-11-20_FCB_Pressekonferenz_Eberl_interview.mp4", "Eberl PK", [(40, 40, 40), (60, 50, 50)],
                   sidecar={"title": "Press conference Max Eberl", "people": "Max Eberl", "club": "FC Bayern München"}),
    ]
    (root / "README_TESTMATERIAL.txt").write_text("Alle Dateien hier sind automatisch erzeugtes Testmaterial, keine Agenturmedien.\n")
    return files
