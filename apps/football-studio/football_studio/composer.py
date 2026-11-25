"""VIDEOEDITOR: erzeugt aus Skript + Voice-over ein HyperFrames-Projekt (HTML → MP4, 1080×1920).

* Szenen werden exakt auf die Voice-over-Zeiten gelegt (Synchronisierung).
* Jede Szene: eigener Hintergrund mit langsamem Zoom (Ken Burns), Zoom-/Blur-Übergang.
* Untertitel: wortgenau animiert (2–3 Wörter je Gruppe, aktives Wort hervorgehoben).
* Alle Bilder/Grafiken sind eigenständig erzeugt (CSS/SVG); optionale Fotos nur mit freier Lizenz.
"""

from __future__ import annotations

import html
import json
import re
import shutil
from pathlib import Path

W, H = 1080, 1920
OVERLAP = 0.4  # Überblendung zwischen Szenen (s)


def esc(s) -> str:
    return html.escape(str(s or ""), quote=True)


def _fit(text: str, max_px: int, width: int = 820, ratio: float = 0.46, min_px: int = 60) -> int:
    longest = max((len(w) for w in str(text).split()), default=1)
    total = len(str(text))
    by_word = width / (ratio * max(longest, 1))
    by_lines = width * 2.2 / (ratio * max(total, 1))
    return int(max(min_px, min(max_px, by_word, by_lines)))


BASE_CSS = """
#root { position:absolute; inset:0; overflow:hidden; background:var(--ground); color:var(--ink);
  font-family:'Inter',sans-serif; }
.bg { position:absolute; left:-60px; top:-60px; width:1200px; height:2040px; }
.bg-floodlight { background:
  radial-gradient(ellipse 700px 900px at 8% 0%, rgba(255,255,240,.20), transparent 60%),
  radial-gradient(ellipse 700px 900px at 92% 0%, rgba(255,255,240,.16), transparent 60%),
  radial-gradient(ellipse 900px 700px at 50% 100%, var(--glow), transparent 70%),
  linear-gradient(180deg, #050a07 0%, #0b1f14 55%, #06120b 100%); }
.bg-pitch { background:
  repeating-linear-gradient(180deg, rgba(255,255,255,.035) 0 160px, transparent 160px 320px),
  radial-gradient(ellipse 900px 900px at 50% 45%, rgba(40,120,60,.55), transparent 70%),
  linear-gradient(180deg, #06140b, #0d2a17 50%, #06140b); }
.bg-grid { background:
  linear-gradient(rgba(255,255,255,.05) 2px, transparent 2px) 0 0/120px 120px,
  linear-gradient(90deg, rgba(255,255,255,.05) 2px, transparent 2px) 0 0/120px 120px,
  radial-gradient(ellipse 800px 1000px at 50% 40%, rgba(30,90,60,.6), transparent 70%),
  linear-gradient(180deg, #050b08, #0a1c12); }
.bg-stripes { background:
  repeating-linear-gradient(115deg, rgba(255,255,255,.04) 0 60px, transparent 60px 140px),
  radial-gradient(ellipse 900px 700px at 50% 30%, var(--glow), transparent 70%),
  linear-gradient(180deg, #070b0a, #102016 60%, #060c09); }
.beam { position:absolute; top:-200px; width:340px; height:1500px; transform-origin:50% 0%;
  background:linear-gradient(180deg, rgba(255,255,230,.18), transparent 80%); }
.vignette { position:absolute; inset:0; background:radial-gradient(ellipse 760px 1150px at 50% 42%, transparent 55%, rgba(0,0,0,.65)); }
.content { position:absolute; left:120px; right:120px; top:250px; height:620px; display:flex; flex-direction:column;
  justify-content:center; align-items:center; text-align:center; }
.kicker { font-family:'Inter'; font-weight:900; font-size:34px; letter-spacing:.18em; text-transform:uppercase;
  color:#071008; background:var(--accent); padding:10px 22px; border-radius:6px; }
.display { font-family:'League Gothic'; text-transform:uppercase; line-height:.92; letter-spacing:.01em; color:var(--ink); }
.accent { color:var(--accent); }
.sub { font-family:'Inter'; font-weight:700; font-size:44px; color:rgba(255,255,255,.86); margin-top:28px; line-height:1.2; }
.rule { width:220px; height:10px; background:var(--accent); border-radius:5px; margin-top:34px; transform-origin:0 50%; }
"""


def _bg(sid: str, variant: str) -> str:
    beams = ""
    if variant in ("floodlight", "stripes"):
        beams = f'<div id="{sid}-beam1" class="beam" style="left:60px"></div><div id="{sid}-beam2" class="beam" style="left:700px"></div>'
    return f'<div id="{sid}-bg" class="bg bg-{esc(variant)}">{beams}</div><div class="vignette"></div>'


def _visual_html(sid: str, v: dict, photo: dict | None, first: bool = False) -> tuple[str, str]:
    """Liefert (Markup, GSAP-Code) für den Inhalt einer Szene."""
    t = v.get("type", "keyword")
    js: list[str] = []
    E = lambda x: f'"#{sid}-{x}"'  # noqa: E731
    if t == "hook":
        name = v.get("headline", "")
        size = _fit(name, 230, ratio=0.42)
        img = ""
        if photo and photo.get("used"):
            img = (f'<div id="{sid}-photo" style="width:380px;height:380px;border-radius:50%;overflow:hidden;'
                   f'border:8px solid var(--accent);margin-bottom:40px"><img src="assets/photo.jpg" '
                   f'style="width:100%;height:100%;object-fit:cover" alt=""></div>')
            js.append(f"tl.fromTo({E('photo')},{{scale:0.6,opacity:0}},{{scale:1,opacity:1,duration:0.6,ease:'back.out(1.6)'}},0.1);")
        markup = (f'<div class="content">{img}<div id="{sid}-kick" class="kicker">Fußball-Story</div>'
                  f'<div id="{sid}-name" class="display" style="font-size:{size}px;margin-top:34px">{esc(name)}</div>'
                  f'<div id="{sid}-rule" class="rule"></div>'
                  f'<div id="{sid}-q" class="display accent" style="font-size:150px;margin-top:10px">?</div></div>')
        o0 = 1 if first else 0  # Frame 0 ist das Thumbnail: Name sofort sichtbar
        js += [f"tl.fromTo({E('kick')},{{y:-40,opacity:{o0}}},{{y:0,opacity:1,duration:0.4,ease:'power3.out'}},0.05);",
               f"tl.fromTo({E('name')},{{scale:1.12,opacity:{o0}}},{{scale:1,opacity:1,duration:0.55,ease:'power4.out'}},0.0);",
               f"tl.fromTo({E('rule')},{{scaleX:0}},{{scaleX:1,duration:0.5,ease:'power2.out'}},0.5);",
               f"tl.fromTo({E('q')},{{scale:0,rotation:-25}},{{scale:1,rotation:0,duration:0.5,ease:'back.out(2.2)'}},0.9);",
               f"tl.to({E('q')},{{scale:1.12,duration:0.35,ease:'power1.inOut',yoyo:true,repeat:3}},1.6);"]
        return markup, "\n".join(js)
    if t == "profile":
        name = v.get("headline", "")
        size = _fit(name, 150, ratio=0.42)
        rows = "".join(
            f'<div id="{sid}-it{i}" style="display:flex;justify-content:space-between;align-items:baseline;width:800px;'
            f'padding:16px 26px;margin-top:14px;background:rgba(255,255,255,.07);border-left:10px solid var(--accent);border-radius:8px">'
            f'<span style="font-weight:700;font-size:30px;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.1em;margin-right:24px">{esc(it["label"])}</span>'
            f'<span style="font-weight:900;font-size:{40 if len(str(it["value"])) < 22 else 32}px;text-align:right">{esc(it["value"])}</span></div>'
            for i, it in enumerate(v.get("items", [])))
        markup = (f'<div class="content"><div id="{sid}-name" class="display" style="font-size:{size}px;margin-bottom:30px">{esc(name)}</div>{rows}</div>')
        js.append(f"tl.fromTo({E('name')},{{y:60,opacity:0}},{{y:0,opacity:1,duration:0.5,ease:'power3.out'}},0.05);")
        for i, _ in enumerate(v.get("items", [])):
            js.append(f"tl.fromTo({E(f'it{i}')},{{x:-40,opacity:0}},{{x:0,opacity:1,duration:0.4,ease:'power3.out'}},{0.35 + i * 0.22:.2f});")
        return markup, "\n".join(js)
    if t == "timeline":
        rows = v.get("rows", [])[:5]
        items = "".join(
            f'<div id="{sid}-r{i}" style="display:flex;align-items:center;width:820px;margin:8px 0;position:relative">'
            f'<div style="width:34px;height:34px;border-radius:50%;background:var(--accent);flex:none;box-shadow:0 0 30px var(--accent)"></div>'
            f'<div style="text-align:left;margin-left:30px"><div style="font-family:\'JetBrains Mono\';font-weight:700;font-size:28px;color:var(--accent)">{esc(r["years"])}<span style="font-family:Inter;color:rgba(255,255,255,.7);margin-left:18px">{esc(r.get("apps", ""))}</span></div>'
            f'<div class="display" style="font-size:{_fit(r["team"], 70, width=740, ratio=0.42, min_px=44)}px">{esc(r["team"])}</div></div></div>'
            for i, r in enumerate(rows))
        markup = (f'<div class="content" style="align-items:flex-start;text-align:left">'
                  f'<div id="{sid}-h" class="kicker" style="margin-bottom:18px">{esc(v.get("headline", "Stationen"))}</div>'
                  f'<div style="position:relative"><div id="{sid}-line" style="position:absolute;left:15px;top:30px;bottom:30px;width:4px;background:rgba(255,255,255,.35);transform-origin:50% 0%"></div>{items}</div></div>')
        js.append(f"tl.fromTo({E('h')},{{opacity:0,y:-30}},{{opacity:1,y:0,duration:0.4}},0.05);")
        js.append(f"tl.fromTo({E('line')},{{scaleY:0}},{{scaleY:1,duration:{0.4 + 0.3 * len(rows):.2f},ease:'none'}},0.2);")
        for i in range(len(rows)):
            js.append(f"tl.fromTo({E(f'r{i}')},{{x:80,opacity:0}},{{x:0,opacity:1,duration:0.45,ease:'power3.out'}},{0.25 + i * 0.3:.2f});")
        return markup, "\n".join(js)
    if t in ("stat", "year", "score"):
        value = str(v.get("value", ""))
        label = v.get("label", "") if t == "stat" else ""
        sub = v.get("sub", "")
        size = _fit(value, 250 if t == "stat" else (340 if t == "year" else 300), width=560 if t == "stat" else 820, ratio=0.45, min_px=120)
        ring = ""
        if t == "stat":
            ring = (f'<svg id="{sid}-ring" width="760" height="760" viewBox="0 0 760 760" style="position:absolute;left:50%;top:50%;margin:-380px 0 0 -380px">'
                    f'<circle cx="380" cy="380" r="340" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="14"/>'
                    f'<circle id="{sid}-arc" cx="380" cy="380" r="340" fill="none" stroke="var(--accent)" stroke-width="14" stroke-linecap="round" '
                    f'stroke-dasharray="2136" stroke-dashoffset="2136" transform="rotate(-90 380 380)"/></svg>')
            js.append(f"tl.fromTo({E('arc')},{{attr:{{'stroke-dashoffset':2136}}}},{{attr:{{'stroke-dashoffset':420}},duration:1.4,ease:'power2.out'}},0.1);")
        frame = ""
        if t == "score":
            frame = 'border:8px solid var(--accent);border-radius:24px;padding:10px 60px;background:rgba(0,0,0,.45);'
        style = "-webkit-text-stroke:4px var(--accent);color:transparent;" if t == "year" else ""
        markup = (f'<div class="content">{ring}<div style="position:relative;display:flex;flex-direction:column;align-items:center">'
                  f'<div id="{sid}-v" class="display" style="font-size:{size}px;{style}{frame}">{esc(value)}</div>'
                  + (f'<div id="{sid}-l" class="display accent" style="font-size:{_fit(label, 90, width=520, ratio=0.42, min_px=48)}px;margin-top:6px">{esc(label)}</div>' if label else "")
                  + (f'<div id="{sid}-s" class="sub" style="max-width:{520 if t == "stat" else 820}px;font-size:{36 if t == "stat" else 44}px">{esc(sub)}</div>' if sub else "")
                  + "</div></div>")
        num = re.fullmatch(r"\d{1,4}", value)
        if num and t == "stat":
            start = 0
            js.append(f"(function(){{var el=document.querySelector({E('v')});var o={{n:{start}}};"
                      f"tl.fromTo(o,{{n:{start}}},{{n:{int(value)},duration:1.1,ease:'power3.out',onUpdate:function(){{el.textContent=Math.round(o.n);}}}},0.1);}})();")
        js.append(f"tl.fromTo({E('v')},{{scale:0.7,opacity:0}},{{scale:1,opacity:1,duration:0.5,ease:'back.out(1.7)'}},0.05);")
        if label:
            js.append(f"tl.fromTo({E('l')},{{y:40,opacity:0}},{{y:0,opacity:1,duration:0.4,ease:'power3.out'}},0.45);")
        if sub:
            js.append(f"tl.fromTo({E('s')},{{y:30,opacity:0}},{{y:0,opacity:1,duration:0.4,ease:'power3.out'}},0.7);")
        return markup, "\n".join(js)
    if t == "quote":
        text = v.get("text", "")
        size = _fit(text, 170, ratio=0.42, min_px=72)
        markup = (f'<div class="content"><div id="{sid}-t" class="display" style="font-size:{size}px">'
                  f'<span id="{sid}-qm" class="accent" style="display:inline-block">„</span>{esc(text)}'
                  f'<span id="{sid}-qe" class="accent" style="display:inline-block">“</span></div>'
                  + (f'<div id="{sid}-s" class="sub">{esc(v.get("sub"))}</div>' if v.get("sub") else "") + "</div>")
        js += [f"tl.fromTo({E('t')},{{scale:1.25,opacity:0,filter:'blur(12px)'}},{{scale:1,opacity:1,filter:'blur(0px)',duration:0.55,ease:'power4.out'}},0.05);",
               f"tl.fromTo({E('qm')},{{x:-60,opacity:0}},{{x:0,opacity:1,duration:0.4,ease:'power3.out'}},0.3);",
               f"tl.fromTo({E('qe')},{{x:60,opacity:0}},{{x:0,opacity:1,duration:0.4,ease:'power3.out'}},0.4);"]
        if v.get("sub"):
            js.append(f"tl.fromTo({E('s')},{{opacity:0}},{{opacity:1,duration:0.4}},0.8);")
        return markup, "\n".join(js)
    if t == "outro":
        markup = (f'<div class="content"><div id="{sid}-ball" style="width:200px;height:200px;margin-bottom:24px">{BALL_SVG}</div>'
                  f'<div id="{sid}-h" class="display" style="font-size:130px">{esc(v.get("headline", "Folge für mehr"))}</div>'
                  f'<div id="{sid}-s" class="display accent" style="font-size:{_fit(v.get("sub", ""), 130, ratio=0.42)}px">{esc(v.get("sub", ""))}</div>'
                  f'<div id="{sid}-src" style="margin-top:36px;font-weight:700;font-size:28px;max-width:820px;color:rgba(255,255,255,.75)">{esc(v.get("sources", "Quellen: Wikipedia · Wikidata"))}</div></div>')
        js += [f"tl.fromTo({E('ball')},{{y:-500,rotation:-200}},{{y:0,rotation:0,duration:0.9,ease:'bounce.out'}},0.05);",
               f"tl.fromTo({E('h')},{{scale:0.6,opacity:0}},{{scale:1,opacity:1,duration:0.5,ease:'back.out(1.8)'}},0.4);",
               f"tl.fromTo({E('s')},{{y:50,opacity:0}},{{y:0,opacity:1,duration:0.45,ease:'power3.out'}},0.65);",
               f"tl.fromTo({E('src')},{{opacity:0}},{{opacity:1,duration:0.4}},1.0);"]
        return markup, "\n".join(js)
    if t == "pitch":
        text = v.get("text", "")
        markup = (f'<div class="content"><svg width="760" height="495" viewBox="0 0 860 560" style="margin-bottom:30px">'
                  f'<rect x="10" y="10" width="840" height="540" rx="8" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="5"/>'
                  f'<line x1="430" y1="10" x2="430" y2="550" stroke="rgba(255,255,255,.5)" stroke-width="5"/>'
                  f'<circle cx="430" cy="280" r="90" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="5"/>'
                  f'<rect x="10" y="150" width="130" height="260" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="5"/>'
                  f'<rect x="720" y="150" width="130" height="260" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="5"/>'
                  f'<path id="{sid}-path" d="M 120 420 C 300 380, 360 160, 560 200 S 760 300, 800 280" fill="none" stroke="var(--accent)" '
                  f'stroke-width="9" stroke-dasharray="1100" stroke-dashoffset="1100" stroke-linecap="round"/>'
                  f'<circle id="{sid}-dot" cx="800" cy="280" r="20" fill="#fff"/></svg>'
                  f'<div id="{sid}-t" class="display" style="font-size:{_fit(text, 150, ratio=0.42)}px">{esc(text)}</div></div>')
        js += [f"tl.fromTo({E('path')},{{attr:{{'stroke-dashoffset':1100}}}},{{attr:{{'stroke-dashoffset':0}},duration:1.3,ease:'power2.inOut'}},0.1);",
               f"tl.fromTo({E('dot')},{{scale:0,transformOrigin:'50% 50%'}},{{scale:1,duration:0.3,ease:'back.out(3)'}},1.3);",
               f"tl.fromTo({E('t')},{{y:60,opacity:0}},{{y:0,opacity:1,duration:0.5,ease:'power3.out'}},0.35);"]
        return markup, "\n".join(js)
    # keyword (Standard)
    text = v.get("text", "")
    size = _fit(text, 220, ratio=0.42, min_px=80)
    markup = (f'<div class="content"><div id="{sid}-t" class="display" style="font-size:{size}px">{esc(text)}</div>'
              f'<div id="{sid}-rule" class="rule" style="width:420px"></div></div>')
    js += [f"tl.fromTo({E('t')},{{scale:1.6,scaleX:1.9,opacity:0,filter:'blur(14px)'}},"
           f"{{scale:1,scaleX:1,opacity:1,filter:'blur(0px)',duration:0.6,ease:'power4.out'}},0.05);",
           f"tl.fromTo({E('rule')},{{scaleX:0}},{{scaleX:1,duration:0.5,ease:'power2.out'}},0.45);"]
    return markup, "\n".join(js)


BALL_SVG = ('<svg viewBox="0 0 100 100" width="200" height="200"><circle cx="50" cy="50" r="47" fill="#fff" stroke="#111" stroke-width="3"/>'
            '<polygon points="50,30 66,42 60,61 40,61 34,42" fill="#111"/>'
            '<path d="M50 30 L50 4 M66 42 L90 34 M60 61 L75 84 M40 61 L25 84 M34 42 L10 34" stroke="#111" stroke-width="3"/></svg>')


def scene_html(sid: str, scene: dict, duration: float, photo: dict | None, accent: str, first: bool = False) -> str:
    v = scene["visual"]
    markup, js = _visual_html(sid, v, photo, first)
    bg = v.get("bg", "floodlight")
    beams = ""
    if bg in ("floodlight", "stripes"):
        beams = (f"tl.fromTo('#{sid}-beam1',{{rotation:-14}},{{rotation:6,duration:{duration:.2f},ease:'sine.inOut'}},0);"
                 f"tl.fromTo('#{sid}-beam2',{{rotation:12}},{{rotation:-8,duration:{duration:.2f},ease:'sine.inOut'}},0);")
    return f"""<template>
  <style>
    {BASE_CSS.replace('#root', f'#{sid}-root')}
  </style>
  <div id="{sid}-root" data-composition-id="{sid}" data-width="{W}" data-height="{H}" style="--accent:{esc(accent)};--ink:#fff;--ground:#06100a;--glow:rgba(198,255,61,.16)">
    {_bg(sid, bg)}
    <div id="{sid}-stage" style="position:absolute;inset:0">
      {markup}
    </div>
  </div>
  <script>
    (function () {{
      const tl = gsap.timeline({{ paused: true }});
      tl.fromTo('#{sid}-bg', {{ scale: 1.0 }}, {{ scale: 1.14, duration: {duration:.2f}, ease: 'none' }}, 0);
      {beams}
      {"" if first else f"tl.fromTo('#{sid}-stage', {{ scale: 1.22, opacity: 0, filter: 'blur(18px)' }}, {{ scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.45, ease: 'power3.out' }}, 0);"}
      tl.fromTo('#{sid}-stage', {{ y: 0 }}, {{ y: -26, duration: {max(duration - 0.5, 0.5):.2f}, ease: 'none' }}, 0.45);
      {js}
      window.__timelines["{sid}"] = tl;
    }})();
  </script>
</template>
"""


def caption_groups(words: list[dict], max_words: int = 3) -> list[dict]:
    groups: list[dict] = []
    cur: list[dict] = []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        brk = (len(cur) >= max_words or re.search(r"[.!?,;:]$", w["text"]) or nxt is None
               or nxt["scene"] != w["scene"] or (nxt["start"] - w["end"]) > 0.15
               or sum(len(x["text"]) for x in cur) > 20)
        if brk:
            groups.append({"words": cur, "start": cur[0]["start"], "end": cur[-1]["end"]})
            cur = []
    # Gruppen bis kurz vor die nächste halten (kein Flackern)
    for g in groups:
        g["start"] = round(max(0.05, g["start"] - 0.06), 3)
    for i, g in enumerate(groups):
        nxt = groups[i + 1]["start"] if i + 1 < len(groups) else g["end"] + 0.6
        g["end"] = round(max(g["start"] + 0.1, min(nxt - 0.02, g["end"] + 0.5)), 3)
    return groups


def captions_html(groups: list[dict], accent: str) -> str:
    parts, js = [], []
    for gi, g in enumerate(groups):
        chars = sum(len(w["text"]) for w in g["words"])
        longest = max(len(w["text"]) for w in g["words"])
        size = int(min(74 if chars <= 12 else (64 if chars <= 18 else 56), 620 / (0.86 * max(longest, 1))))
        spans = " ".join(f'<span id="cw{gi}-{wi}" class="cw">{esc(w["text"])}</span>' for wi, w in enumerate(g["words"]))
        parts.append(f'<div id="cg{gi}" class="cg" style="font-size:{size}px">{spans}</div>')
        js.append(f"tl.set('#cg{gi}',{{visibility:'visible',opacity:1}},{g['start']});")
        js.append(f"tl.fromTo('#cg{gi}',{{scale:0.86,y:24}},{{scale:1,y:0,duration:0.16,ease:'back.out(2)'}},{g['start']});")
        for wi, w in enumerate(g["words"]):
            js.append(f"tl.to('#cw{gi}-{wi}',{{color:'{accent}',scale:1.08,duration:0.06}},{max(g['start'], w['start']):.3f});")
            js.append(f"tl.to('#cw{gi}-{wi}',{{color:'#ffffff',scale:1,duration:0.08}},{max(w['end'], w['start'] + 0.12):.3f});")
        js.append(f"tl.to('#cg{gi}',{{opacity:0,duration:0.08}},{g['end'] - 0.08:.3f});")
        js.append(f"tl.set('#cg{gi}',{{opacity:0,visibility:'hidden'}},{g['end']:.3f});")
    return f"""<template>
  <style>
    #captions-root {{ position:absolute; inset:0; pointer-events:none; }}
    .cg {{ position:absolute; left:120px; width:660px; top:960px; text-align:center; visibility:hidden; opacity:0;
      font-family:'Montserrat',sans-serif; font-weight:800; text-transform:uppercase; line-height:1.08; color:#fff;
      text-shadow:0 6px 0 rgba(0,0,0,.55), 0 0 24px rgba(0,0,0,.7); -webkit-text-stroke:3px #000; paint-order:stroke fill; }}
    .cw {{ display:inline-block; }}
  </style>
  <div id="captions-root" data-composition-id="captions" data-width="{W}" data-height="{H}" data-layout-allow-overlap>
    {''.join(parts)}
  </div>
  <script>
    (function () {{
      const tl = gsap.timeline({{ paused: true }});
      {chr(10).join(js)}
      window.__timelines["captions"] = tl;
    }})();
  </script>
</template>
"""


def build(project_dir: Path, project: dict, settings) -> Path:
    """Schreibt das HyperFrames-Projekt nach ``<projekt>/video`` und liefert den Pfad."""
    script = project["script"]
    voice = project["voice"]
    video = project_dir / "video"
    if video.exists():
        shutil.rmtree(video)
    (video / "compositions").mkdir(parents=True)
    (video / "assets").mkdir()
    shutil.copy(project_dir / "voice" / "voiceover.wav", video / "assets" / "voiceover.wav")
    shutil.copy(project_dir / "music" / "music_ducked.wav", video / "assets" / "music.wav")
    photo = project.get("research", {}).get("photo")
    if photo and photo.get("used") and (project_dir / photo["file"]).exists():
        shutil.copy(project_dir / photo["file"], video / "assets" / "photo.jpg")
    else:
        photo = None
    accent = settings.accent_color
    total = round(voice["duration"] + 0.4, 2)
    times = {t["id"]: t for t in voice["scene_times"]}
    scenes = script["scenes"]
    hosts = []
    for i, sc in enumerate(scenes):
        sid = sc["id"]
        st = 0.0 if i == 0 else max(0.0, times[sid]["start"] - 0.12)
        nxt = (times[scenes[i + 1]["id"]]["start"] - 0.12) if i + 1 < len(scenes) else total
        dur = round((nxt - st) + (OVERLAP if i + 1 < len(scenes) else 0), 3)
        if i + 1 == len(scenes):
            dur = round(total - st, 3)
        v = dict(sc["visual"])
        if v.get("type") == "outro":
            v["sources"] = "Quellen: Wikipedia · Wikidata" + (" · " + photo["attribution"] if photo else "")
        if v.get("type") == "hook" and photo:
            v["photo_attr"] = photo["attribution"]
        (video / "compositions" / f"{sid}.html").write_text(scene_html(sid, {**sc, "visual": v}, dur, photo, accent, first=(i == 0)), "utf-8")
        hosts.append(
            f'      <div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" '
            f'data-start="{st:.3f}" data-duration="{dur:.3f}" data-track-index="{1 + i % 2}" data-track-kind="graphics" '
            f'data-width="{W}" data-height="{H}" style="z-index:{i + 1}"></div>'
        )
    groups = caption_groups(voice["words"])
    (video / "compositions" / "captions.html").write_text(captions_html(groups, accent), "utf-8")
    attribution = ""
    if photo:
        attribution = (f'      <div id="photo-credit" class="clip" data-start="0" data-duration="{times[scenes[0]["id"]]["end"] + 0.3:.2f}" '
                       f'data-track-index="5" style="position:absolute;left:0;right:0;top:880px;text-align:center;font:600 28px Inter;padding:0 120px;'
                       f'color:rgba(255,255,255,.8);z-index:900">{esc(photo["attribution"])}</div>\n')
    index = f"""<!doctype html>
<html lang="de" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <title>{esc(script['title'])}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * {{ margin:0; padding:0; box-sizing:border-box; }}
      html, body {{ width:{W}px; height:{H}px; overflow:hidden; background:#06100a; }}
      #root {{ position:relative; width:100%; height:100%; background:#06100a; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="{W}" data-height="{H}" data-fps="{settings.fps}">
{chr(10).join(hosts)}
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="{total}" data-track-index="4" data-track-kind="captions" data-width="{W}" data-height="{H}" style="z-index:800"></div>
{attribution}      <audio id="voiceover" class="clip" src="assets/voiceover.wav" data-start="0" data-track-index="6" data-volume="1"></audio>
      <audio id="music" class="clip" src="assets/music.wav" data-start="0" data-track-index="7" data-volume="1"></audio>
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
"""
    (video / "index.html").write_text(index, "utf-8")
    (video / "hyperframes.json").write_text(json.dumps({
        "$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
        "paths": {"blocks": "compositions", "components": "compositions/components", "assets": "assets"},
        "media": {"autoProxy": True},
    }, indent=2), "utf-8")
    (video / "meta.json").write_text(json.dumps({"id": project["id"], "name": script["title"]}, ensure_ascii=False), "utf-8")
    return video
