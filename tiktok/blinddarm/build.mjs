// Blinddarm. Generates index.html + compositions/*.html from script.json.
// Run: node build.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import {
  C,
  S,
  toothFace,
  lapTool,
  painStar,
  mouth,
  wordTimes,
  CAPTION_CSS,
} from "../../.claude/skills/medizin-cartoon/lib/parts.mjs";

const script = JSON.parse(readFileSync(new URL("./script.json", import.meta.url), "utf8"));
const W = 1080;
const H = 1920;
const SC = script.scenes;
const lines = script.lines;
// ElevenLabs-Takes (voices.mjs): echte Länge ersetzt das geschätzte Zeilenende.
// Jede Szene arbeitet in ihrer "Autorenzeit" (script.json). Werden die Takes
// länger, wächst die Szene, und alle späteren Szenen rutschen nach hinten
// (Echtzeit = R(t)); die Beats innerhalb einer Szene bleiben gleich.
const VO_FILE = new URL("./assets/vo/timings.json", import.meta.url);
const VO = existsSync(VO_FILE) ? JSON.parse(readFileSync(VO_FILE, "utf8")) : {};
const ORDER = script.order;
const GAP = {
  streit: 0.08,
  spaeter: 0,
  nachher: 0.08,
  op: 0.15,
  frage: 0.2,
  praxis: 0.3,
  patient: 0.25,
};
const PAD = {
  streit: 0.35,
  spaeter: 0,
  nachher: 0.4,
  op: 0.4,
  frage: 0.4,
  praxis: 0.4,
  patient: 2.4,
};
const ORIG = Object.fromEntries(ORDER.map((id) => [id, [...SC[id]]]));
// Szene jeder Zeile einmal vorab (nach Original-Start) festlegen.
const sceneOf0 = (t) => ORDER.find((id) => t >= ORIG[id][0] && t < ORIG[id][1]) ?? ORDER.at(-1);
const LINE_SCENE = Object.fromEntries(lines.map((l) => [l.id, sceneOf0(l.start)]));
// Szenen laufen in ORDER nacheinander; SHIFT = Echtzeit-Start minus Autoren-Start.
const SHIFT = {};
let realT = 0;
for (const id of ORDER) {
  const [a, b] = ORIG[id];
  let prevEnd = -1;
  for (const l of lines.filter((x) => LINE_SCENE[x.id] === id && VO[x.id])) {
    if (prevEnd > 0 && l.start < prevEnd + GAP[id]) l.start = +(prevEnd + GAP[id]).toFixed(2);
    l.end = +(l.start + VO[l.id].duration).toFixed(2);
    prevEnd = l.end;
  }
  const end = prevEnd > 0 ? Math.max(b, prevEnd + PAD[id]) : b;
  SC[id] = [a, +end.toFixed(2)];
  SHIFT[id] = +(realT - a).toFixed(3);
  realT += end - a;
}
const R = (t, scene = sceneOf0(t)) => +(t + SHIFT[scene]).toFixed(3);
const RL = (l) => R(l.start, LINE_SCENE[l.id]);
const DUR = +realT.toFixed(2);
const HOOK_END = 3.3;
// Betonte Wörter (im Skript GROSS geschrieben) -> gelbe Untertitel + Kamera-Punch.
// Betonte Wörter stehen pro Zeile in "emph" (der Sprechtext bleibt normal
// geschrieben, sonst liest v3 GROSSBUCHSTABEN als Abkürzung).
const bare = (w) => w.toLowerCase().replace(/[^\p{L}]/gu, "");
const isEmphIn = (l, w) => (l.emph || []).some((e) => bare(e) === bare(w));
const emphTimes = (scene) =>
  lines
    .filter((l) => LINE_SCENE[l.id] === scene && VO[l.id])
    .flatMap((l) =>
      VO[l.id].words.filter((w) => isEmphIn(l, w.text)).map((w) => +(l.start + w.start).toFixed(3)),
    );

const L = Object.fromEntries(lines.map((l) => [l.id, [l.start, l.end]]));
const tagOf = (l) => ((l.text.match(/^\s*\[([^\]]+)\]/) || [])[1] || "").toLowerCase();
// Mimik aus den Emotions-Tags: Zuhörer schaut zum Sprecher, laut = Kneifaugen,
// frech = Schlafzimmerblick, jammern = Blick nach oben, seufzen = Lider runter.
const VICTIM = "bd";
const CAUSER = "darm";
// Blickrichtung des Zuhörers zum Sprecher (Zeh-Gesicht unten, Nagel-Gesicht oben).
const LOOK_AT = { [VICTIM]: "16, -16", [CAUSER]: "-16, 16" };
// Schuss/Gegenschuss: Kamera auf das Gesicht, das spricht (laut = schneller Snap,
// Opfer schreit = halbnah mit Schmerzstelle).
const FACE = { [VICTIM]: [392, 1430, 1.3], [CAUSER]: [680, 960, 1.3] };
function actLines(scene, { frames = true, from = 0 } = {}) {
  return lines
    .filter(
      (l) =>
        LINE_SCENE[l.id] === scene && VO[l.id] && (l.speaker === VICTIM || l.speaker === CAUSER),
    )
    .map((l) => {
      const tag = tagOf(l);
      const me = "@" + l.speaker;
      const other = l.speaker === VICTIM ? "@" + CAUSER : "@" + VICTIM;
      const loud = /shout|angry|scream|panick/.test(tag);
      const rest =
        l.speaker === VICTIM
          ? loud
            ? "frown"
            : "wavy"
          : /whin|panick|scream|slur|nervous/.test(tag)
            ? "wavy"
            : "smirk";
      let js = `look("${other}", ${LOOK_AT[l.speaker === VICTIM ? CAUSER : VICTIM]}, ${+(l.start - 0.1).toFixed(2)});`;
      if (frames && l.start >= from) {
        const [fx, fy, fk] = loud && l.speaker === VICTIM ? [480, 1280, 1.12] : FACE[l.speaker];
        js += `frameTo(${fx}, ${fy}, ${fk}, ${+(l.start - 0.12).toFixed(2)}, ${loud ? 0.2 : 0.4});`;
      }
      if (loud && l.speaker === VICTIM)
        js += `squeeze("@${VICTIM}", true, ${l.start}); squeeze("@${VICTIM}", false, ${+(l.start + 0.55).toFixed(2)});
      tl.to("#@pain", { scale: 1.35, duration: 0.08 }, ${l.start}); tl.to("#@pain", { scale: 1, duration: 0.3, ease: "back.out(3)" }, ${+(l.start + 0.1).toFixed(2)});`;
      if (/mischiev|laugh|annoy|smug/.test(tag)) js += `lids("${me}", 0.5, ${l.start});`;
      if (/whin/.test(tag)) js += `lids("${me}", 0.05, ${l.start});`;
      if (/sigh/.test(tag)) js += `lids("${me}", 0.55, ${l.start}, 0.3);`;
      if (/angry/.test(tag) && l.speaker === VICTIM) js += `lids("@${VICTIM}", 0.35, ${l.start});`;
      return js + `talk("${me}", ${l.start}, ${l.end}, "${rest}");`;
    })
    .join("\n    ");
}
const blinks = (scene, a, b) => {
  let js = "";
  for (let t = a + 1.3, i = 0; t < b - 0.3; t += 1.9, i++)
    js += `blink("${i % 2 ? "@" + VICTIM : "@" + CAUSER}", ${+t.toFixed(2)});`;
  return js;
};

// Character acting helpers, injected into each scene script. Positions are
// GLOBAL seconds; `tl` shifts them by the scene's start (O).
const HELPERS = `
  const st = {};
  const lidSel = (ch) => ["#" + ch + "-eyeL-lid", "#" + ch + "-eyeR-lid"];
  function initChar(ch, r, lid) {
    st[ch] = { lid };
    gsap.set(lidSel(ch), { scaleY: lid, svgOrigin: "0 " + -(r + 8) });
  }
  function lids(ch, v, t, d = 0.14) {
    st[ch].lid = v;
    tl.to(lidSel(ch), { scaleY: v, duration: d, ease: "power2.out" }, t);
  }
  function blink(ch, t, v = st[ch].lid) {
    tl.to(lidSel(ch), { scaleY: 1, duration: 0.06, ease: "power1.in" }, t);
    tl.to(lidSel(ch), { scaleY: v, duration: 0.08, ease: "power1.out" }, t + 0.07);
  }
  function look(ch, x, y, t, d = 0.18) {
    tl.to(["#" + ch + "-eyeL-pupil", "#" + ch + "-eyeR-pupil"], { x, y, duration: d, ease: "power3.out" }, t);
  }
  const MOUTHS = ["flat", "smile", "frown", "wavy", "smirk", "open"];
  function face(ch, m, t) {
    MOUTHS.forEach((n) => tl.set("#" + ch + "-m-" + n, { opacity: n === m ? 1 : 0 }, t));
  }
  function squeeze(ch, on, t) {
    tl.set(["#" + ch + "-eyeL-sq", "#" + ch + "-eyeR-sq"], { opacity: on ? 1 : 0 }, t);
  }
  function talk(ch, t0, t1, rest = "flat", step = 0.13) {
    face(ch, "open", t0);
    const o = "#" + ch + "-m-open";
    tl.set(o, { scaleY: 0.4, svgOrigin: "0 -6" }, t0);
    let i = 0;
    for (let t = t0; t < t1 - 0.05; t += step, i++) {
      tl.to(o, { scaleY: i % 2 ? 0.35 : 1, duration: step * 0.9, ease: "sine.inOut" }, t);
    }
    face(ch, rest, t1);
  }
  function punch(sel, t, k = 1.07) {
    tl.to(sel, { scale: k, duration: 0.07, ease: "power2.out" }, t);
    tl.to(sel, { scale: 1, duration: 0.35, ease: "power2.inOut" }, t + 0.08);
  }
  function shake(sel, t, d, amp, prop = "x") {
    const n = Math.max(2, Math.round(d / 0.05));
    for (let i = 0; i < n; i++) {
      tl.to(sel, { [prop]: i === n - 1 ? 0 : (i % 2 ? -1 : 1) * amp * (1 - i / n), duration: d / n, ease: "sine.inOut" }, t + (i * d) / n);
    }
  }
`;

const page = (id, [start, end], body, css, js) => `<template>
  <style>
    #root { position: absolute; inset: 0; overflow: hidden; }
    #root svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    ${css}
  </style>
  <div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}" data-layout-allow-overflow>
${body}
  </div>
  <script>
    const TL = gsap.timeline({ paused: true });
    const O = ${start};
    const tl = {
      to: (a, b, t) => TL.to(a, b, t - O),
      set: (a, b, t) => TL.set(a, b, t - O),
      fromTo: (a, b, c, t) => TL.fromTo(a, b, c, t - O),
    };
${js}
    TL.set({}, {}, ${+(end - start).toFixed(2)});
    window.__timelines["${id}"] = TL;
  </script>
</template>
`;

/* ================= Bauchraum (geteilt von streit, nachher, op) ================= */
// Dickdarm (Blinddarm-Pouch) rechts mit Gesicht, darunter der Wurmfortsatz
// ("Blinddarm") mit Gesicht und sichtbarem Kotstein; Dünndarm-Schlingen links.
const TZ = {
  bg: "#7E2638",
  blob: "#8D3346",
  coil: "#E9A7A0",
  coilHi: "#F6CBC5",
  colon: "#E8968D",
  colonShade: "#C97169",
  appx: "#F0A9A0",
  appxRed: "#E2554F",
  fat: "#F1CF72",
  stone: "#7A4E2D",
  wall: "#D47F8B",
};
const COLON =
  "M 560 -300 L 920 -300 L 920 820 C 940 1010 870 1170 690 1190 C 500 1206 380 1110 380 960 C 380 860 470 800 560 780 Z";
const APPX =
  "M 410 1090 C 350 1200 262 1320 240 1460 C 224 1580 306 1644 384 1614 C 462 1584 484 1484 512 1384 C 540 1284 588 1186 600 1124 Z";
const coil = (d) =>
  `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="112" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${TZ.coil}" stroke-width="100" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${TZ.coilHi}" stroke-width="18" stroke-linecap="round" opacity="0.8" transform="translate(-14 -18)"/>`;
const PORTS = { L: 250, M: 540, R: 830 };
const belly = (p, env = "inside") => `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
 <g id="${p}frame"><g id="${p}cam">
  <rect x="-400" y="-400" width="${W + 800}" height="${H + 1000}" fill="${TZ.bg}"/>
  ${[
    [120, 1700, 160],
    [880, 1500, 120],
    [980, 300, 140],
    [160, 200, 110],
    [700, 2050, 180],
  ]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${TZ.blob}"/>`)
    .join("")}
  ${coil("M -100 380 C 120 300 300 420 220 560 C 140 700 330 780 440 690")}
  ${coil("M -100 860 C 80 790 250 880 190 1000 C 130 1110 -30 1070 -100 1160")}
  ${coil("M 1180 1300 C 1020 1260 930 1380 1010 1480 C 1090 1580 980 1680 860 1640")}
  ${[
    [250, 1170, 46],
    [190, 1230, 34],
    [640, 1330, 40],
    [700, 1290, 28],
  ]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${TZ.fat}" ${S(4)}/>`)
    .join("")}
  <ellipse id="${p}inflam" cx="410" cy="1380" rx="230" ry="320" fill="#FF4D5E" opacity="0"/>
  <g id="${p}appx">
    <path id="${p}appx-body" d="${APPX}" fill="${TZ.appx}" ${S()}/>
    <path d="M 300 1500 C 296 1440 320 1360 360 1290" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" opacity="0.5"/>
    <g id="${p}stone"><ellipse cx="522" cy="1290" rx="30" ry="24" fill="${TZ.stone}" ${S(4)}/><circle cx="512" cy="1282" r="6" fill="#A5744C"/></g>
    <g transform="translate(392 1430)">${toothFace(p + "bd", { r: 42, gap: 52, mouthY: 72, mouthS: 0.8, mouthInit: "frown", lidFill: "#EE958C" })}</g>
    ${[0, 1, 2]
      .map(
        (i) =>
          `<path id="${p}steam${i}" opacity="0" d="M ${300 + i * 70} 1660 q -18 -26 0 -52 t 0 -52" fill="none" stroke="#FFB3A8" stroke-width="10" stroke-linecap="round"/>`,
      )
      .join("")}
  </g>
  <path id="${p}stump" opacity="0" d="M 462 1150 L 596 1140 L 594 1250 C 560 1262 500 1268 462 1262 Z" fill="${TZ.appx}" ${S()}/>
  <path d="${COLON}" fill="${TZ.colon}" ${S()}/>
  ${[120, 330, 540].map((y) => `<path d="M 562 ${y} C 650 ${y + 34} 830 ${y + 34} 918 ${y}" fill="none" stroke="${TZ.colonShade}" stroke-width="9" stroke-linecap="round"/>`).join("")}
  <path d="M 604 -200 L 604 740" stroke="#F6BDB5" stroke-width="24" stroke-linecap="round" opacity="0.7"/>
  <g transform="translate(680 950)">${toothFace(p + "darm", { r: 54, gap: 72, mouthY: 100, mouthS: 1, mouthInit: "flat", lidFill: TZ.colon })}</g>
  <rect id="${p}clip1" opacity="0" x="474" y="1214" width="112" height="18" rx="6" fill="#D9DDE1" ${S(4)} transform="rotate(-8 530 1222)"/>
  <rect id="${p}clip2" opacity="0" x="470" y="1252" width="104" height="18" rx="6" fill="#D9DDE1" ${S(4)} transform="rotate(-8 522 1260)"/>
  <path id="${p}cut" opacity="0" d="M 460 1246 L 590 1228" stroke="${C.ink}" stroke-width="6" stroke-linecap="round"/>
  <g transform="translate(575 1300)">${painStar(p + "pain", { r: 56 })}</g>
  ${
    env === "op"
      ? `<g id="${p}grasp-pos">${lapTool(p + "grasp", "grasp")}</g>
  <g id="${p}clipper-pos">${lapTool(p + "clipper", "clip")}</g>
  <g id="${p}sci-pos">${lapTool(p + "sci", "sci")}</g>
  <g id="${p}scope-pos">${lapTool(p + "scope", "scope")}</g>
  <rect id="${p}dark" x="-400" y="-400" width="${W + 800}" height="${H + 1000}" fill="#000" opacity="0"/>
  <ellipse id="${p}glow" cx="420" cy="1380" rx="360" ry="440" fill="#FFF6CF" opacity="0"/>
  <path d="M -400 -400 L ${W + 400} -400 L ${W + 400} 140 C 1000 200 80 200 -400 140 Z" fill="${TZ.wall}" ${S()}/>
  ${[60, 100].map((y) => `<path d="M -40 ${y} C 300 ${y + 30} 780 ${y + 30} 1120 ${y}" fill="none" stroke="#B8606C" stroke-width="7"/>`).join("")}
  ${Object.entries(PORTS)
    .map(
      ([k, x]) =>
        `<g id="${p}port${k}"><rect x="${x - 34}" y="90" width="68" height="130" rx="12" fill="#9AA1A8" ${S()}/><rect x="${x - 46}" y="80" width="92" height="30" rx="10" fill="#C3C8CD" ${S(4)}/></g>`,
    )
    .join("")}`
      : ""
  }
 </g></g>
 <rect id="${p}flash" x="0" y="0" width="${W}" height="${H}" fill="#fff" opacity="0"/>
</svg>`;

const BODY_INIT = `
    initChar("@darm", 54, 0.35);
    initChar("@bd", 42, 0.15);
    gsap.set("#@cam", { svgOrigin: "540 960" });
    gsap.set("#@frame", { svgOrigin: "0 0" });
    const frameTo = (px, py, k, t, d = 0.3, ease = "power3.inOut") => {
      const x = Math.min(0, Math.max(${W} - k * ${W}, 540 - k * px));
      const y = Math.min(0, Math.max(${H} - k * 2400, 960 - k * py));
      tl.to("#@frame", { x, y, scale: k, duration: d, ease }, t);
    };
    gsap.set("#@pain", { scale: 0, svgOrigin: "0 0" });
    gsap.set("#@appx", { svgOrigin: "505 1180" });
    gsap.set("#@inflam", { svgOrigin: "410 1380" });
    const throb = (a, b, step = 0.9, k = 1.04) => {
      for (let t = a; t < b - 0.3; t += step) {
        tl.to("#@appx", { scale: k, duration: 0.12, ease: "power2.out" }, t);
        tl.to("#@appx", { scale: 1, duration: 0.5, ease: "elastic.out(1,0.45)" }, t + 0.12);
        tl.to("#@pain", { scale: 1.2, duration: 0.1 }, t); tl.to("#@pain", { scale: 1, duration: 0.4, ease: "back.out(3)" }, t + 0.1);
      }
    };
    // Entzündet: Blinddarm rot, Glühen dahinter, Dampf steigt auf.
    const inflamed = (t, on = true) => {
      tl.set("#@appx-body", { fill: on ? "${TZ.appxRed}" : "${TZ.appx}" }, t);
      tl.set("#@inflam", { opacity: on ? 0.4 : 0 }, t);
    };
    const steam = (a, b) => {
      for (let t = a, i = 0; t < b - 0.8; t += 0.5, i++) {
        const el = "#@steam" + (i % 3);
        tl.fromTo(el, { y: 0, opacity: 0 }, { y: -50, opacity: 0.9, duration: 0.5, ease: "sine.out", immediateRender: false }, t);
        tl.to(el, { y: -120, opacity: 0, duration: 0.6, ease: "sine.in" }, t + 0.5);
      }
    };
`;

/* ---------- Szene 1: Streit im Bauch ---------- */
const streitJs = `${HELPERS}${BODY_INIT}
    gsap.set("#@cam", { scale: 1.16 });
    tl.to("#@cam", { scale: 1, duration: 0.55, ease: "power3.out" }, 0);
    shake("#@cam", 0.02, 0.5, 16);
    squeeze("@bd", true, 0); squeeze("@bd", false, 0.9);
    ${JSON.stringify(emphTimes("streit").filter((t) => t > 0.7))}.forEach((t) => { punch("#@cam", t); shake("#@cam", t, 0.25, 7); });
    face("@bd", "wavy", 0); face("@darm", "flat", 0); lids("@darm", 0.45, 0, 0.01);
    look("@bd", 16, -16, 0, 0.01); look("@darm", -16, 16, 0, 0.01);
    tl.set("#@pain", { scale: 0.9 }, 0); tl.set("#@inflam", { opacity: 0.15 }, 0);
    throb(0.1, ${SC.streit[1]}, 1.2);
    ${actLines("streit", { from: HOOK_END - 0.3 })}
    // "Kotstein": Kamera fährt auf den Stein.
    frameTo(520, 1290, 1.6, ${L.s4[0] + 0.5}, 0.35);
    tl.fromTo("#@stone", { scale: 1.4, svgOrigin: "522 1290" }, { scale: 1, duration: 0.35, ease: "back.out(3)" }, ${L.s4[0] + 0.6});
    // "Ich werd ganz rot": färbt sich.
    tl.to("#@appx-body", { fill: "${TZ.appxRed}", duration: 0.6 }, ${L.s5[0] + 0.8});
    tl.to("#@inflam", { opacity: 0.35, duration: 0.6 }, ${L.s5[0] + 0.8});
    ${blinks("streit", 0, SC.streit[1])}
`;

/* ---------- Szene 2b: nach dem Zeitsprung (kurz vorm Platzen) ---------- */
const nachherJs = `${HELPERS}${BODY_INIT}
    const N0 = ${SC.nachher[0]};
    inflamed(N0);
    tl.set("#@appx", { scale: 1.1 }, N0);
    face("@bd", "wavy", N0); face("@darm", "frown", N0);
    look("@bd", 16, -16, N0, 0.01); look("@darm", -16, 16, N0, 0.01);
    tl.set("#@pain", { scale: 1 }, N0);
    gsap.set("#@cam", { scale: 1.08 });
    tl.to("#@cam", { scale: 1, duration: 0.5, ease: "power3.out" }, N0);
    ${JSON.stringify(emphTimes("nachher"))}.forEach((t) => { punch("#@cam", t); shake("#@cam", t, 0.25, 7); });
    for (let t = N0 + 0.2; t < ${SC.nachher[1]} - 0.3; t += 0.7) {
      tl.to("#@appx", { scale: 1.16, duration: 0.12, ease: "power2.out" }, t);
      tl.to("#@appx", { scale: 1.1, duration: 0.45, ease: "elastic.out(1,0.45)" }, t + 0.12);
    }
    steam(N0 + 0.3, ${SC.nachher[1]});
    ${actLines("nachher")}
    look("@darm", 0, -2, ${L.n3[0]}); lids("@darm", 0, ${L.n3[0]});
    ${blinks("nachher", SC.nachher[0], SC.nachher[1])}
`;

/* ---------- Szene 3: Bauchspiegelung ---------- */
const opJs = `${HELPERS}${BODY_INIT}
    const O0 = ${SC.op[0]};
    inflamed(O0); tl.set("#@appx", { scale: 1.1 }, O0);
    face("@bd", "wavy", O0); face("@darm", "flat", O0);
    lids("@darm", 0, O0, 0.01); lids("@bd", 0.1, O0, 0.01);
    tl.set("#@pain", { scale: 0.9 }, O0);
    const PORTS = ${JSON.stringify(PORTS)};
    const TOOLS = { grasp: "L", scope: "M", clipper: "R", sci: "R" };
    Object.entries(TOOLS).forEach(([k, s]) => gsap.set("#@" + k + "-pos", { x: PORTS[s], y: 40, rotation: 0, svgOrigin: "0 0" }));
    ["#@grasp-jawL", "#@grasp-jawR", "#@clipper-jawL", "#@clipper-jawR", "#@sci-jawL", "#@sci-jawR"].forEach((j) => gsap.set(j, { svgOrigin: "0 -34" }));
    const aim = (k, tx, ty, t, d = 0.45) => {
      const px = PORTS[TOOLS[k]];
      const rot = (Math.atan2(px - tx, -(150 - ty)) * 180) / Math.PI;
      tl.to("#@" + k + "-pos", { x: tx, y: ty, rotation: rot, duration: d, ease: "power3.out" }, t);
    };
    const back = (k, t, d = 0.35) => tl.to("#@" + k + "-pos", { x: PORTS[TOOLS[k]], y: 40, duration: d, ease: "power3.in" }, t);
    const jaws = (k, open, t, d = 0.1) => {
      tl.to("#@" + k + "-jawL", { rotation: open ? -22 : 0, duration: d }, t);
      tl.to("#@" + k + "-jawR", { rotation: open ? 22 : 0, duration: d }, t);
    };
    ${JSON.stringify(emphTimes("op").filter((t) => !(t > 39.4 && t < 40.6)))}.forEach((t) => { punch("#@cam", t, 1.06); shake("#@cam", t, 0.25, 6); });

    // 1) Zugänge + Luft rein (Kapnoperitoneum): alles bläht sich auf.
    ["L", "M", "R"].forEach((k, i) => tl.fromTo("#@port" + k, { scale: 0, svgOrigin: PORTS[k] + " 150" }, { scale: 1, duration: 0.25, ease: "back.out(3)", immediateRender: true }, 30.0 + i * 0.15));
    tl.fromTo("#@cam", { scale: 0.9 }, { scale: 1, duration: 0.9, ease: "elastic.out(1,0.4)", immediateRender: false }, 30.35);
    gsap.set("#@dark", { opacity: 0.5 });
    frameTo(680, 960, 1.25, ${L.o1[0]} - 0.12, 0.35);
    look("@darm", -10, -14, ${L.o1[0]}); talk("@darm", ${L.o1}, "frown");

    // 2) Kamera mit Licht
    frameTo(520, 1080, 1.05, 32.3, 0.4);
    aim("scope", 470, 760, 32.35, 0.6);
    tl.to("#@dark", { opacity: 0.08, duration: 0.3 }, 32.9);
    tl.to("#@glow", { opacity: 0.1, duration: 0.3 }, 32.9);
    frameTo(392, 1430, 1.3, ${L.o2[0]} - 0.12, 0.25);
    squeeze("@bd", true, ${L.o2[0]}); talk("@bd", ${L.o2}, "wavy"); squeeze("@bd", false, ${L.o2[1]});

    // 3) Greifer fasst die Spitze
    frameTo(430, 1380, 1.2, 34.1, 0.4);
    jaws("grasp", true, 34.2);
    aim("grasp", 290, 1590, 34.2, 0.5);
    jaws("grasp", false, 34.7);
    tl.to("#@appx", { rotation: 8, duration: 0.35, ease: "power2.out" }, 34.8);
    lids("@bd", 0, ${L.o3[0]}, 0.08); look("@bd", -16, 14, ${L.o3[0]}); talk("@bd", ${L.o3}, "wavy");

    // 4) Clips an die Basis
    frameTo(500, 1330, 1.35, 36.0, 0.4);
    aim("clipper", 530, 1222, 36.0, 0.45);
    jaws("clipper", true, 36.35);
    tl.set("#@clipper-clip", { opacity: 0 }, 36.6);
    tl.set("#@clip1", { opacity: 1 }, 36.6);
    jaws("clipper", false, 36.6);
    tl.to("#@clipper-pos", { x: 522, y: 1262, duration: 0.2 }, 36.75);
    tl.set("#@clip2", { opacity: 1 }, 37.0);
    back("clipper", 37.2);
    look("@bd", 14, -18, ${L.o4[0]}); talk("@bd", ${L.o4}, "wavy");

    // 5) Schere trennt zwischen den Clips
    gsap.set("#@cut", { strokeDasharray: 140, strokeDashoffset: 140 });
    aim("sci", 525, 1240, 37.5, 0.4);
    [38.0, 38.25].forEach((t) => { jaws("sci", true, t - 0.12, 0.08); jaws("sci", false, t, 0.06); });
    tl.set("#@cut", { opacity: 1 }, 38.0);
    tl.to("#@cut", { strokeDashoffset: 0, duration: 0.3 }, 38.0);
    back("sci", 38.5);
    squeeze("@bd", true, ${L.o5[0]}); talk("@bd", ${L.o5}, "wavy"); squeeze("@bd", false, ${L.o5[1]});

    // 6) Raus durch den Zugang
    frameTo(540, 960, 1, 39.55, 0.35);
    tl.to("#@cut", { opacity: 0, duration: 0.1 }, 39.6);
    tl.to(["#@grasp-pos", "#@appx"], { y: "-=1500", duration: 0.9, ease: "power3.in" }, 39.7);
    tl.to("#@appx", { x: "-=60", scaleX: 0.6, duration: 0.9, ease: "power3.in" }, 39.7);
    tl.set("#@stump", { opacity: 1 }, 39.65);
    tl.to(["#@inflam", "#@pain", "#@glow"], { opacity: 0, duration: 0.3 }, 39.8);
    tl.fromTo("#@flash", { opacity: 0.6 }, { opacity: 0, duration: 0.3, ease: "power2.out", immediateRender: false }, 40.45);
    talk("@bd", ${L.o6}, "open");

    // 7) Darm hat das letzte Wort
    frameTo(680, 960, 1.3, ${L.o7[0]} - 0.12, 0.35);
    lids("@darm", 0.5, ${L.o7[0]}); look("@darm", -6, 0, ${L.o7[0]}); talk("@darm", ${L.o7}, "smirk");
    back("scope", ${L.o7[1]} + 0.1);
    blink("@darm", 35.6, 0); blink("@darm", 38.8, 0);
`;

/* ================= Scene: SPÄTER card ================= */
// Zeitsprung-Karte: dunkler Verlauf, feines Korn, Uhr, deren Zeiger vorspulen,
// Schrift steigt Buchstabe für Buchstabe aus einer Maske, Akzentlinie wächst.
const CARD = { bg0: "#18203A", bg1: "#06070D", accent: "#5EE6D0", text: "#F5F3EE" };
const CLOCK_R = 118;
const ticks = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI) / 6;
  const r0 = i % 3 === 0 ? CLOCK_R - 30 : CLOCK_R - 20;
  const r1 = CLOCK_R - 10;
  const p = (r) => `${(Math.sin(a) * r).toFixed(1)} ${(-Math.cos(a) * r).toFixed(1)}`;
  return `<path d="M ${p(r0)} L ${p(r1)}" stroke="${CARD.text}" stroke-width="${i % 3 === 0 ? 7 : 4}" stroke-linecap="round" opacity="${i % 3 === 0 ? 0.95 : 0.55}"/>`;
}).join("");
const SP_WORD = "SPÄTER";
const spaeterSvg = `
<svg viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="sp-bg" cx="50%" cy="46%" r="75%">
      <stop offset="0" stop-color="${CARD.bg0}"/><stop offset="1" stop-color="${CARD.bg1}"/>
    </radialGradient>
    <radialGradient id="sp-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${CARD.accent}" stop-opacity="0.22"/><stop offset="1" stop-color="${CARD.accent}" stop-opacity="0"/>
    </radialGradient>
    <filter id="sp-grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/>
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sp-bg)"/>
  <circle id="sp-glow-c" cx="540" cy="780" r="420" fill="url(#sp-glow)"/>
  <rect width="${W}" height="${H}" filter="url(#sp-grain)"/>
  <g transform="translate(540 780)"><g id="sp-clock">
    <circle r="${CLOCK_R}" fill="rgba(255,255,255,0.03)"/>
    <circle id="sp-ring" r="${CLOCK_R}" fill="none" stroke="${CARD.accent}" stroke-width="9" transform="rotate(-90)"/>
    <g id="sp-ticks">${ticks}</g>
    <g id="sp-hour"><path d="M 0 12 L 0 -58" stroke="${CARD.text}" stroke-width="11" stroke-linecap="round"/></g>
    <g id="sp-min"><path d="M 0 16 L 0 -88" stroke="${CARD.accent}" stroke-width="7" stroke-linecap="round"/></g>
    <circle r="11" fill="${CARD.text}"/>
  </g></g>
</svg>
<div id="sp-title">${[...SP_WORD].map((c, i) => `<span class="sp-mask"><span id="sp-l${i}" class="sp-l">${c}</span></span>`).join("")}</div>
<div id="sp-line"></div>`;
const spaeterCss = `
  #sp-title { position: absolute; left: 0; right: 0; top: 960px; display: flex; justify-content: center;
    font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 132px; line-height: 1.1;
    letter-spacing: 0.16em; padding-left: 0.16em; color: ${CARD.text}; }
  .sp-mask { display: inline-block; overflow: hidden; padding-top: 0.12em; }
  .sp-l { display: inline-block; }
  #sp-line { position: absolute; left: 50%; top: 1140px; width: 300px; height: 8px; margin-left: -150px;
    border-radius: 4px; background: ${CARD.accent}; }`;
const spaeterJs = `
    const T0 = O;
    const RING = ${(2 * Math.PI * CLOCK_R).toFixed(1)};
    gsap.set("#sp-ring", { strokeDasharray: RING, strokeDashoffset: RING });
    gsap.set("#sp-clock", { scale: 0.7, opacity: 0, svgOrigin: "0 0" });
    gsap.set(["#sp-min", "#sp-hour"], { svgOrigin: "0 0" });
    gsap.set("#sp-hour", { rotation: 300 });
    gsap.set(".sp-l", { yPercent: 115 });
    gsap.set("#sp-line", { scaleX: 0 });
    gsap.set("#sp-glow-c", { opacity: 0 });
    tl.to("#sp-clock", { scale: 1, opacity: 1, duration: 0.3, ease: "power3.out" }, T0);
    tl.to("#sp-glow-c", { opacity: 1, duration: 0.4, ease: "power2.out" }, T0);
    tl.to("#sp-ring", { strokeDashoffset: 0, duration: 0.55, ease: "power2.inOut" }, T0 + 0.05);
    tl.to("#sp-min", { rotation: 720, duration: 1.05, ease: "power2.inOut" }, T0 + 0.1);
    tl.to("#sp-hour", { rotation: 360, duration: 1.05, ease: "power2.inOut" }, T0 + 0.1);
    ${JSON.stringify([...SP_WORD].map((_, i) => i))}.forEach((i) =>
      tl.to("#sp-l" + i, { yPercent: 0, duration: 0.32, ease: "power3.out" }, T0 + 0.16 + i * 0.035));
    tl.to("#sp-line", { scaleX: 1, duration: 0.45, ease: "power3.out" }, T0 + 0.35);
    tl.to(["#sp-clock", "#sp-title", "#sp-line"], { opacity: 0, y: -24, duration: 0.16, ease: "power2.in" }, T0 + 1.22);
`;

/* ================= Scene: Praxis ================= */
// Halbnahe wie das Referenzbild: alter Arzt mit weißem Zopf, runder Goldbrille,
// Maske unterm Kinn, Krawatte, Stethoskop; schreibt auf ein Klemmbrett, dahinter
// Fenster mit Kräutertöpfen, vorne der Tisch mit Akten.
const P = {
  wall: "#B9C79A",
  wallSide: "#A9B889",
  ceiling: "#C9D3AE",
  wallLow: "#A3B282",
  trim: "#8D9A6C",
  frame: "#CBD1C2",
  sky: "#DCEEF1",
  tree: "#A7C69B",
  tree2: "#8FB585",
  pot: "#B8693F",
  potDark: "#97522F",
  leaf: "#6F9A57",
  skin: "#F3D2B8",
  skinShade: "#E4B99A",
  hair: "#EFEFEB",
  hairShade: "#D3D3CE",
  coat: "#F8F9F6",
  coatShade: "#E3E6E1",
  shirt: "#F3EDD6",
  tie: "#6F8DB4",
  tieStripe: "#D2DEEB",
  mask: "#CFE7EC",
  maskDot: "#8FB7C7",
  gold: "#D2A548",
  tube: "#2F3036",
  board: "#9C7853",
  boardDark: "#7E5F40",
  desk: "#EEEDD5",
  deskSide: "#A5AF86",
  paper: "#E7D9B5",
};
const stroke2 = (d, w, col) =>
  `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="${w + 8}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const plant = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
    ${[
      "M 0 -60 C -6 -110 -30 -150 -40 -190",
      "M 0 -60 C 4 -120 12 -170 6 -215",
      "M 0 -60 C 10 -100 36 -135 52 -165",
    ]
      .map(
        (d) =>
          `<path d="${d}" fill="none" stroke="${P.leaf}" stroke-width="6" stroke-linecap="round"/>`,
      )
      .join("")}
    ${[
      [-14, -95, -40],
      [-28, -135, -30],
      [-38, -175, -20],
      [2, -110, 10],
      [8, -160, -6],
      [4, -205, 0],
      [18, -100, 40],
      [34, -128, 35],
      [48, -158, 30],
    ]
      .map(
        ([lx, ly, r]) =>
          `<ellipse cx="${lx}" cy="${ly}" rx="10" ry="22" transform="rotate(${r} ${lx} ${ly})" fill="${P.leaf}" ${S(3)}/>`,
      )
      .join("")}
    <path d="M -48 -62 L 48 -62 L 38 20 L -38 20 Z" fill="${P.pot}" ${S(4)}/>
    <rect x="-54" y="-74" width="108" height="20" rx="4" fill="${P.potDark}" ${S(4)}/>
  </g>`;
const docEye = (id, x, y) =>
  `<g transform="translate(${x} ${y})"><clipPath id="${id}-c"><ellipse rx="25" ry="21"/></clipPath>
    <ellipse rx="25" ry="21" fill="#fff"/>
    <g id="${id}-p"><circle r="10" fill="${C.ink}"/><circle cx="-3" cy="-3" r="2.6" fill="#fff"/></g>
    <g clip-path="url(#${id}-c)"><rect id="${id}-lid" x="-32" y="-28" width="64" height="56" fill="${P.skin}" ${S(4)} vector-effect="non-scaling-stroke"/></g>
    <ellipse rx="25" ry="21" fill="none" ${S(4)}/></g>`;
const tieClip = "M 616 1246 L 646 1246 L 668 1560 L 632 1600 L 596 1560 Z";

const praxisSvg = `
<svg viewBox="0 0 ${W} ${H}">
  <!-- Raum -->
  <rect width="${W}" height="${H}" fill="${P.wall}"/>
  <path d="M 0 0 L ${W} 0 L ${W} 150 L 96 150 L 0 108 Z" fill="${P.ceiling}"/>
  <path d="M 0 108 L 96 150 L ${W} 150" fill="none" ${S(4)}/>
  <path d="M 0 108 L 96 150 L 96 1430 L 0 1460 Z" fill="${P.wallSide}"/>
  <path d="M 96 150 L 96 1430" fill="none" ${S(4)}/>
  <path d="M 96 1340 L ${W} 1340 L ${W} ${H} L 96 ${H} Z" fill="${P.wallLow}"/>
  <path d="M 0 1370 L 96 1340 L 96 ${H} L 0 ${H} Z" fill="#97A676"/>
  <path d="M 0 1370 L 96 1340 L ${W} 1340" fill="none" ${S(4)}/>

  <!-- Fenster -->
  <rect x="620" y="560" width="500" height="560" fill="${P.sky}"/>
  <clipPath id="win-c"><rect x="640" y="580" width="480" height="520"/></clipPath>
  <g clip-path="url(#win-c)">
    <path d="M 640 760 L 1120 600 L 1120 660 L 640 820 Z" fill="#fff" opacity="0.35"/>
    <path d="M 800 1100 C 760 1000 800 930 860 940 C 870 880 940 860 980 900 C 1010 840 1090 840 1120 880 L 1120 1100 Z" fill="${P.tree}" ${S(4)}/>
    <path d="M 640 1100 C 630 1030 670 990 720 1000 C 740 960 800 960 820 1000 C 850 1010 860 1060 850 1100 Z" fill="${P.tree2}" ${S(4)}/>
    <path d="M 1010 1100 C 1000 960 1040 760 1120 700 L 1120 1100 Z" fill="${P.tree2}" ${S(4)}/>
  </g>
  <path d="M 610 470 L 1120 470 L 1120 1150 L 610 1150 Z M 640 580 L 640 1110 L 1120 1110 L 1120 580 Z" fill="${P.frame}" fill-rule="evenodd" ${S(4)}/>
  <rect x="600" y="470" width="520" height="96" fill="#E4E7DC" ${S(4)}/>
  <path d="M 600 502 L 1120 502 M 600 534 L 1120 534" ${S(3)} opacity="0.6"/>
  ${plant(770, 1100, 0.95)}${plant(935, 1104, 0.85)}
  <rect x="590" y="1104" width="530" height="34" fill="#DDE1D2" ${S(4)}/>

  <!-- Arzt -->
  <g id="doc">
    <g id="doc-tail">
      <path d="M 458 945 C 390 960 312 1002 280 1080 C 256 1140 246 1220 282 1305 C 292 1250 306 1214 326 1186 C 316 1240 326 1282 356 1316 C 356 1236 372 1162 412 1090 C 436 1046 456 1008 470 974 Z" fill="${P.hair}" ${S()}/>
      <path d="M 300 1130 C 300 1180 296 1220 300 1260 M 340 1100 C 336 1150 340 1200 348 1250" fill="none" stroke="${P.hairShade}" stroke-width="5" stroke-linecap="round"/>
      <path d="M 262 1210 C 240 1240 232 1270 240 1300 M 372 1120 C 390 1160 392 1200 384 1240" fill="none" ${S(3)}/>
    </g>
    <path d="M 296 ${H} C 296 1520 308 1300 378 1226 C 428 1184 500 1170 560 1162 L 700 1162 C 772 1172 842 1194 884 1244 C 934 1314 944 1520 944 ${H} Z" fill="${P.coat}" ${S()}/>
    <path d="M 548 1156 L 712 1156 L 664 1570 L 598 1570 Z" fill="${P.shirt}" ${S(4)}/>
    <path d="M 588 1050 L 590 1172 L 674 1172 L 680 1050 Z" fill="${P.skin}" ${S()}/>
    <path d="M 592 1140 C 615 1150 650 1150 676 1138" fill="none" stroke="${P.skinShade}" stroke-width="8"/>
    <path d="M 562 1138 L 540 1206 L 616 1228 L 628 1168 Z" fill="${P.shirt}" ${S(4)}/>
    <path d="M 700 1138 L 722 1206 L 646 1228 L 634 1168 Z" fill="${P.shirt}" ${S(4)}/>
    <path d="M 610 1204 L 652 1204 L 646 1248 L 616 1248 Z" fill="${P.tie}" ${S(4)}/>
    <clipPath id="tie-c"><path d="${tieClip}"/></clipPath>
    <path d="${tieClip}" fill="${P.tie}"/>
    <g clip-path="url(#tie-c)">${[1250, 1320, 1390, 1460, 1530].map((y) => `<path d="M 580 ${y + 40} L 690 ${y - 30}" stroke="${P.tieStripe}" stroke-width="13"/>`).join("")}</g>
    <path d="${tieClip}" fill="none" ${S(4)}/>
    <path d="M 552 1150 L 476 1268 L 528 1318 L 502 1360 L 600 1590 L 614 1500 Z" fill="${P.coat}" ${S(4)}/>
    <path d="M 708 1150 L 784 1268 L 732 1318 L 758 1360 L 660 1590 L 646 1500 Z" fill="${P.coat}" ${S(4)}/>
    <path d="M 420 1300 C 420 1420 430 1520 440 1640 M 840 1300 C 846 1420 846 1520 838 1640" fill="none" stroke="${P.coatShade}" stroke-width="12" stroke-linecap="round"/>
    <!-- Stethoskop -->
    ${stroke2("M 566 1166 C 478 1210 452 1320 468 1420 C 476 1470 506 1494 532 1478", 11, P.tube)}
    ${stroke2("M 696 1166 C 752 1208 768 1262 762 1296", 11, P.tube)}
    <circle cx="536" cy="1474" r="10" fill="${P.tube}" ${S(3)}/>
    <circle cx="760" cy="1316" r="28" fill="#C9CED3" ${S()}/><circle cx="760" cy="1316" r="15" fill="#E9ECEE" ${S(3)}/>
    <!-- Maske unterm Kinn -->
    <path d="M 456 892 C 470 960 500 1030 528 1066" fill="none" stroke="#9FC6CF" stroke-width="6" stroke-linecap="round"/>
    <path d="M 516 1056 C 560 1108 704 1118 768 1046 C 780 1080 770 1124 736 1146 C 684 1176 588 1176 542 1138 C 516 1116 508 1084 516 1056 Z" fill="${P.mask}" ${S()}/>
    <path d="M 530 1090 C 590 1124 690 1126 752 1084 M 540 1116 C 600 1146 690 1148 744 1112" fill="none" stroke="${P.maskDot}" stroke-width="4" stroke-linecap="round"/>
    ${[
      [560, 1104],
      [620, 1122],
      [690, 1118],
      [730, 1096],
      [585, 1138],
      [655, 1146],
      [710, 1132],
    ]
      .map(([x, y]) => `<path d="M ${x - 6} ${y} l 6 -6 l 6 6 l -6 6 Z" fill="${P.maskDot}"/>`)
      .join("")}

    <g id="doc-head">
      <path d="M 486 700 C 428 724 404 804 414 884 C 420 934 436 964 458 984 C 452 934 460 902 472 882 C 456 840 460 780 492 742 Z" fill="${P.hair}" ${S()}/>
      <path d="M 470 822 C 460 700 520 600 622 594 C 732 590 800 680 795 800 C 793 880 780 942 760 992 C 734 1052 690 1086 630 1088 C 570 1088 530 1056 508 1002 C 490 956 476 892 470 822 Z" fill="${P.skin}" ${S()}/>
      <path d="M 790 690 C 830 720 846 780 832 836 C 826 870 812 900 796 920 C 802 880 804 840 800 800 C 818 780 816 730 790 690 Z" fill="${P.hair}" ${S()}/>
      <ellipse cx="472" cy="872" rx="27" ry="45" fill="${P.skin}" ${S()}/>
      <path d="M 478 850 C 462 858 462 888 478 896" fill="none" ${S(4)}/>
      <!-- Haarbüschel oben -->
      <path d="M 548 640 C 520 600 530 556 578 548 C 560 566 562 590 580 610 C 586 570 620 548 660 556 C 640 568 636 588 648 606 C 668 580 708 576 736 596 C 712 600 698 620 700 640 C 670 620 640 612 610 616 C 590 620 566 628 548 640 Z" fill="${P.hair}" ${S(4)}/>
      <path d="M 520 660 C 500 640 494 610 506 588 M 760 640 C 784 630 800 606 798 580 M 742 616 C 760 600 776 598 790 604" fill="none" ${S(3)}/>
      <!-- Falten -->
      <path d="M 566 688 Q 630 670 708 690 M 552 716 Q 630 698 724 718 M 574 742 Q 630 730 700 744" fill="none" stroke="${P.skinShade}" stroke-width="5" stroke-linecap="round"/>
      <path d="M 566 688 Q 630 670 708 690 M 552 716 Q 630 698 724 718" fill="none" ${S(3)} opacity="0.55"/>
      <path d="M 758 870 l 22 -8 M 760 890 l 22 2 M 506 880 l -18 -6" fill="none" ${S(3)} opacity="0.7"/>
      <path d="M 538 922 Q 565 934 592 922 M 672 922 Q 700 934 728 922" fill="none" ${S(3)} opacity="0.7"/>
      <path d="M 600 990 C 584 1004 584 1024 592 1040 M 690 990 C 706 1004 708 1024 700 1040" fill="none" ${S(3)}/>
      <!-- Augen, Brauen, Brille -->
      ${docEye("de1", 566, 864)}${docEye("de2", 700, 864)}
      <g id="doc-brows">
        <path d="M 514 822 C 532 790 580 780 614 798 C 600 800 590 806 584 812 C 566 806 540 812 520 830 Z" fill="${P.hairShade}" ${S(4)}/>
        <path d="M 652 798 C 686 780 734 790 752 822 C 740 816 722 808 698 812 C 690 806 676 800 652 798 Z" fill="${P.hairShade}" ${S(4)}/>
      </g>
      ${stroke2("M 616 860 Q 633 846 650 860", 5, P.gold)}
      ${stroke2("M 516 856 L 486 846", 5, P.gold)}
      <circle cx="566" cy="864" r="50" fill="#fff" opacity="0.12"/>
      <circle cx="700" cy="864" r="50" fill="#fff" opacity="0.12"/>
      <circle cx="566" cy="864" r="50" fill="none" stroke="${C.ink}" stroke-width="13"/><circle cx="566" cy="864" r="50" fill="none" stroke="${P.gold}" stroke-width="6"/>
      <circle cx="700" cy="864" r="50" fill="none" stroke="${C.ink}" stroke-width="13"/><circle cx="700" cy="864" r="50" fill="none" stroke="${P.gold}" stroke-width="6"/>
      <path d="M 536 838 Q 548 826 562 824 M 670 838 Q 682 826 696 824" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.8"/>
      <!-- Nase, Mund -->
      <path d="M 640 868 C 640 912 650 944 670 968 C 684 988 664 1004 638 998 C 622 994 612 986 608 976" fill="${P.skin}" ${S()}/>
      <path d="M 636 986 q 8 4 14 -2" fill="none" ${S(3)}/>
      <g transform="translate(646 1036)">${mouth("doc-m", { s: 0.78, initial: "smile" })}</g>
    </g>

    <!-- Linker Arm (Bildseite rechts) mit Klemmbrett -->
    ${stroke2("M 884 1270 C 934 1330 960 1400 968 1470", 104, P.coat)}
    <g transform="rotate(-24 810 1530)">
      <rect x="640" y="1330" width="340" height="400" rx="14" fill="${P.board}" ${S()}/>
      <path d="M 660 1366 L 660 1710" stroke="${P.boardDark}" stroke-width="8" opacity="0.5"/>
      <rect x="752" y="1304" width="116" height="52" rx="12" fill="#C3C8CD" ${S(4)}/>
      <circle cx="810" cy="1318" r="10" fill="#F0F2F3" ${S(3)}/>
    </g>
    <g transform="translate(10 -110)"><path d="M 966 1560 C 1010 1556 1028 1600 1012 1640 C 996 1676 952 1680 936 1650 C 924 1620 930 1572 966 1560 Z" fill="${P.skin}" ${S()}/>
    <path d="M 950 1590 C 970 1588 986 1596 992 1610 M 946 1620 C 966 1618 982 1626 988 1640" fill="none" ${S(3)}/></g>
    <!-- Rechter Arm mit Stift -->
    ${stroke2("M 386 1266 C 346 1400 346 1520 396 1590 L 630 1570", 104, P.coat)}
    <path d="M 450 1520 C 470 1560 520 1572 580 1560" fill="none" stroke="${P.coatShade}" stroke-width="10" stroke-linecap="round"/>
    <g transform="translate(46 12)"><g id="doc-hand">
      <g id="doc-pen">
        <path d="M 610 1540 L 676 1430" stroke="${C.ink}" stroke-width="22" stroke-linecap="round"/>
        <path d="M 610 1540 L 676 1430" stroke="#2C2B33" stroke-width="13" stroke-linecap="round"/>
        <path d="M 652 1470 L 664 1450" stroke="${P.gold}" stroke-width="13"/>
        <path d="M 606 1548 L 598 1562" stroke="${P.gold}" stroke-width="6" stroke-linecap="round"/>
      </g>
      <path d="M 576 1508 C 610 1496 646 1512 650 1546 C 654 1580 622 1600 592 1596 C 562 1592 548 1566 552 1540 C 554 1524 562 1514 576 1508 Z" fill="${P.skin}" ${S()}/>
      <path d="M 600 1520 C 616 1520 630 1530 634 1544" fill="none" ${S(3)}/>
    </g></g>
  </g>

  <!-- Tisch mit Akten -->
  <path d="M -20 1660 C 300 1642 800 1630 1110 1612 L 1110 1712 C 800 1726 300 1740 -20 1756 Z" fill="${P.desk}" ${S()}/>
  <path d="M -20 1756 C 300 1740 800 1726 1110 1712 L 1110 1960 L -20 1960 Z" fill="${P.deskSide}" ${S()}/>
  <path d="M 0 1780 C 300 1766 800 1752 1100 1738" fill="none" stroke="#B9C29A" stroke-width="10"/>
  ${[0, 1, 2, 3]
    .map(
      (i) => `<g transform="translate(${872 - i * 4} ${1640 - i * 22}) rotate(${-4 + (i % 2) * 3})">
      <path d="M 0 0 L 230 -14 L 236 18 L 6 32 Z" fill="${i % 2 ? P.paper : "#D9C79A"}" ${S(4)}/>
      <rect x="30" y="-6" width="34" height="14" rx="3" fill="#B9BEC3" ${S(3)}/></g>`,
    )
    .join("")}
</svg>`;

const praxisJs = `
    const docLines = ${JSON.stringify(lines.filter((l) => l.speaker === "arzt" && LINE_SCENE[l.id] === "praxis").map((l) => [l.start, l.end]))};
    const LIDS = ["#de1-lid", "#de2-lid"], PUP = ["#de1-p", "#de2-p"];
    gsap.set(LIDS, { scaleY: 0.42, svgOrigin: "0 -28" });
    gsap.set(PUP, { x: 6, y: 9 });
    gsap.set("#doc-head", { svgOrigin: "630 1080" });
    gsap.set("#doc-hand", { svgOrigin: "560 1560" });
    const blinkD = (t, v) => { tl.to(LIDS, { scaleY: 1, duration: 0.06 }, t); tl.to(LIDS, { scaleY: v, duration: 0.09 }, t + 0.07); };
    // Schreiben: kleine Kringel mit dem Stift.
    const write = (t0, t1) => {
      for (let t = t0, i = 0; t < t1 - 0.12; t += 0.16, i++)
        tl.to("#doc-hand", { x: [0, 6, -2, 8][i % 4], y: [0, -4, 3, -2][i % 4], duration: 0.15, ease: "sine.inOut" }, t);
      tl.to("#doc-hand", { x: 0, y: 0, duration: 0.15 }, t1 - 0.12);
    };
    const S0 = ${SC.praxis[0]}, S1 = ${SC.praxis[1]};
    gsap.set("#px-cam", { transformOrigin: "58% 45%" });
    tl.fromTo("#px-cam", { scale: 1 }, { scale: 1.07, duration: S1 - S0, ease: "none" }, S0);
    let prev = S0;
    docLines.forEach(([a, b], i) => {
      if (a - prev > 0.35) write(prev + 0.05, a - 0.1);
      // aufschauen, Kopf leicht heben, Brauen hoch, erklären
      tl.to(PUP, { x: 0, y: -2, duration: 0.2, ease: "power3.out" }, a - 0.15);
      tl.to(LIDS, { scaleY: 0.3, duration: 0.2 }, a - 0.15);
      tl.to("#doc-head", { rotation: i % 2 ? 1.5 : -1.5, y: -6, duration: 0.5, ease: "sine.inOut" }, a - 0.15);
      tl.to("#doc-brows", { y: -8, duration: 0.18, ease: "power2.out" }, a);
      tl.to("#doc-brows", { y: 0, duration: 0.3, ease: "power2.inOut" }, a + 0.5);
      talk("doc", a, b, "smile", 0.12);
      blinkD(a + (b - a) * 0.55, 0.3);
      tl.to(PUP, { x: 6, y: 9, duration: 0.25, ease: "power2.inOut" }, b + 0.05);
      tl.to(LIDS, { scaleY: 0.42, duration: 0.25 }, b + 0.05);
      tl.to("#doc-head", { rotation: 0, y: 0, duration: 0.5, ease: "sine.inOut" }, b + 0.05);
      prev = b;
    });
    if (S1 - prev > 0.4) write(prev + 0.2, S1 - 0.05);
`;

/* ================= Patient mit dickem Zeh-Verband ================= */
// Patient sitzt, Fuß zur Kamera hochgelegt (Sohle sichtbar), der große Zeh ist
// ein riesiger weißer Verband, der pocht.
const PT = { hair: "#5A3A26", sweater: "#3D79C9", pants: "#33343A", chair: "#3F7FD0" };
const ptEye = (id, x, y) =>
  `<g transform="translate(${x} ${y})"><clipPath id="${id}-c"><circle r="20"/></clipPath>
    <circle r="20" fill="#fff"/>
    <g id="${id}-p"><circle r="9" fill="${C.ink}"/><circle cx="-3" cy="-3" r="2.4" fill="#fff"/></g>
    <g clip-path="url(#${id}-c)"><rect id="${id}-lid" x="-26" y="-26" width="52" height="52" fill="${P.skin}" ${S(4)} vector-effect="non-scaling-stroke"/></g>
    <circle r="20" fill="none" ${S(4)}/></g>`;
// Seitenansicht: Patient sitzt links, Bein liegt auf einem Hocker, vorne der
// große Zeh als riesiger Verband. Kopf frontal zur Kamera.
const HX = 390,
  HY = 740;
const patientSvg = `
<svg id="pt-cam" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${P.wall}"/>
  <rect y="0" width="${W}" height="110" fill="${P.ceiling}"/>
  <path d="M 0 110 L ${W} 110" ${S(4)}/>
  <rect y="1180" width="${W}" height="400" fill="${P.wallLow}"/>
  <path d="M 0 1180 L ${W} 1180" ${S(4)}/>
  <rect y="1560" width="${W}" height="${H - 1560}" fill="#A0978A"/>
  <path d="M 0 1560 L ${W} 1560" ${S(4)}/>
  ${[1640, 1760, 1900].map((y) => `<path d="M 0 ${y} L ${W} ${y}" stroke="#7E766B" stroke-width="5"/>`).join("")}
  <rect x="700" y="600" width="230" height="300" rx="6" fill="#F3F1E6" ${S(4)}/>
  <path d="M 740 670 h 150 M 740 720 h 120 M 740 770 h 140 M 740 820 h 90" stroke="#B9C29A" stroke-width="10" stroke-linecap="round"/>
  <!-- Stuhl -->
  <rect x="150" y="760" width="90" height="480" rx="30" fill="${PT.chair}" ${S()}/>
  <rect x="150" y="1150" width="400" height="80" rx="30" fill="${PT.chair}" ${S()}/>
  <path d="M 200 1230 L 190 1560 M 500 1230 L 510 1560" ${S(14)}/>
  <!-- Oberkörper -->
  <path d="M 230 1170 C 220 1010 240 890 320 860 L 460 860 C 530 890 550 1010 530 1170 Z" fill="${PT.sweater}" ${S()}/>
  <path d="M 355 860 L 390 920 L 425 860 Z" fill="#fff" ${S(4)}/>
  <rect x="362" y="800" width="56" height="70" fill="${P.skin}" ${S()}/>
  <!-- vorderes Bein (sitzt) -->
  <path d="M 300 1110 L 640 1110 C 690 1110 700 1150 700 1200 L 720 1540 L 600 1540 L 590 1230 L 300 1220 Z" fill="${PT.pants}" ${S()}/>
  <path d="M 590 1530 L 760 1530 C 790 1530 800 1570 770 1572 L 590 1572 Z" fill="#1A1A1C" ${S()}/>
  <!-- Pulli hochgezogen: Bauch mit drei Pflastern -->
  <g id="pt-belly">
    <ellipse cx="420" cy="1060" rx="130" ry="96" fill="${P.skin}" ${S()}/>
    <path d="M 296 1010 C 360 980 480 980 548 1010" fill="none" stroke="${PT.sweater}" stroke-width="34" stroke-linecap="round"/>
    ${[
      [420, 1070, 0],
      [350, 1100, -12],
      [494, 1104, 12],
    ]
      .map(
        ([x, y, r]) =>
          `<g transform="rotate(${r} ${x} ${y})"><rect x="${x - 34}" y="${y - 14}" width="68" height="28" rx="12" fill="#F0D9B5" ${S(3)}/><rect x="${x - 12}" y="${y - 10}" width="24" height="20" rx="4" fill="#FBF3E4"/></g>`,
      )
      .join("")}
  </g>
  <path d="M 520 950 C 560 1000 560 1050 530 1080" fill="none" stroke="${C.ink}" stroke-width="72" stroke-linecap="round"/><path d="M 520 950 C 560 1000 560 1050 530 1080" fill="none" stroke="${PT.sweater}" stroke-width="62" stroke-linecap="round"/>
  <circle cx="522" cy="1088" r="30" fill="${P.skin}" ${S()}/>
  <g id="pt-puffs">
    <path d="M 270 1020 q -26 40 0 80 M 246 1036 q -18 26 0 52" fill="none" ${S(5)}/>
    <path d="M 590 1030 q 26 40 0 80 M 614 1046 q 18 26 0 52" fill="none" ${S(5)}/>
  </g>
  <g id="pt-head">
    <ellipse cx="${HX - 88}" cy="${HY}" rx="18" ry="30" fill="${P.skin}" ${S()}/>
    <ellipse cx="${HX + 88}" cy="${HY}" rx="18" ry="30" fill="${P.skin}" ${S()}/>
    <g id="pt-face"><ellipse cx="${HX}" cy="${HY}" rx="90" ry="104" fill="${P.skin}" ${S()}/></g>
    <path d="M ${HX - 90} ${HY - 10} C ${HX - 100} ${HY - 90} ${HX - 52} ${HY - 130} ${HX} ${HY - 132} C ${HX + 60} ${HY - 130} ${HX + 104} ${HY - 90} ${HX + 92} ${HY - 10} C ${HX + 80} ${HY - 50} ${HX + 50} ${HY - 70} ${HX + 20} ${HY - 66} C ${HX} ${HY - 82} ${HX - 30} ${HY - 80} ${HX - 46} ${HY - 64} C ${HX - 70} ${HY - 62} ${HX - 84} ${HY - 40} ${HX - 90} ${HY - 10} Z" fill="${PT.hair}" ${S()}/>
    ${ptEye("pe1", HX - 32, HY)}${ptEye("pe2", HX + 34, HY)}
    <path id="pt-browL" d="M ${HX - 56} ${HY - 36} L ${HX - 12} ${HY - 48}" fill="none" ${S(6)}/>
    <path id="pt-browR" d="M ${HX + 12} ${HY - 48} L ${HX + 56} ${HY - 36}" fill="none" ${S(6)}/>
    <path d="M ${HX} ${HY + 18} q -10 22 4 26" fill="none" ${S(4)}/>
    <g transform="translate(${HX} ${HY + 62})">${mouth("pm-m", { s: 0.6, initial: "frown" })}</g>
  </g>
</svg>`;
const ctaBody = `
<div id="cta">
  <div class="ct" id="ct1">WER HAT SEINEN</div>
  <div class="ct ct-y" id="ct2">BLINDDARM NOCH?</div>
  <div id="ct3">Schreib's in die Kommentare ↓</div>
</div>`;
const ctaCss = `
  #cta { position: absolute; left: 0; right: 0; top: 140px; text-align: center; opacity: 0; }
  .ct { font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 84px; line-height: 1.05; color: #fff;
    -webkit-text-stroke: 16px #1d1414; paint-order: stroke fill; text-shadow: 0 8px 0 rgba(0,0,0,0.35); }
  .ct-y { color: #FFE14D; font-size: 104px; }
  #ct3 { display: inline-block; margin-top: 18px; padding: 14px 30px; border-radius: 40px; background: #1d1414;
    color: #fff; font-family: "Montserrat", sans-serif; font-weight: 800; font-size: 42px; }`;
// Gemeinsames Acting für beide Patienten-Auftritte.
const patientBase = (a, b) => `
    const LIDS = ["#pe1-lid", "#pe2-lid"], PUP = ["#pe1-p", "#pe2-p"];
    gsap.set(LIDS, { scaleY: 0.15, svgOrigin: "0 -26" });
    gsap.set("#pt-cam", { transformOrigin: "60% 50%", scale: 1.2 });
    gsap.set("#pt-head", { svgOrigin: "${HX} ${HY + 100}" });
    gsap.set("#pt-belly", { svgOrigin: "420 1060" });
    gsap.set("#pt-browL", { rotation: -12, svgOrigin: "${HX - 12} ${HY - 48}" });
    gsap.set("#pt-browR", { rotation: 12, svgOrigin: "${HX + 12} ${HY - 48}" });
    tl.to("#pt-cam", { scale: 1, duration: 0.5, ease: "back.out(1.6)" }, ${a});
    tl.fromTo("#pt-belly", { scale: 1.2 }, { scale: 1, duration: 0.7, ease: "elastic.out(1.2,0.35)" }, ${a} + 0.05);
    for (let t = ${a} + 0.9; t < ${b} - 0.2; t += 0.95) {
      tl.to("#pt-belly", { scale: 1.03, duration: 0.1, ease: "power2.out" }, t);
      tl.to("#pt-belly", { scale: 1, duration: 0.45, ease: "elastic.out(1,0.4)" }, t + 0.1);
      tl.fromTo("#pt-puffs", { opacity: 1 }, { opacity: 0.25, duration: 0.5, ease: "power1.out" }, t);
    }
    tl.to(LIDS, { scaleY: 1, duration: 0.06 }, ${a} + 1.5); tl.to(LIDS, { scaleY: 0.15, duration: 0.09 }, ${a} + 1.57);
`;
const patientJs = `
    const P0 = ${SC.patient[0]}, P1 = ${SC.patient[1]};
    ${patientBase("P0", "P1")}
    talk("pm", ${L.e1}, "frown", 0.13);
    tl.to("#pt-head", { rotation: -3, duration: 0.3, ease: "sine.inOut" }, ${L.e1[0]});
    tl.to(PUP, { x: -8, y: 0, duration: 0.2, ease: "power3.out" }, ${L.e2[0]} - 0.1);
    tl.to("#pt-head", { rotation: 0, duration: 0.3, ease: "sine.inOut" }, ${L.e2[0]});
    // Er muss über den Witz lachen – und hält sich den Bauch.
    tl.to(LIDS, { scaleY: 0.85, duration: 0.15 }, ${L.e3[0]});
    talk("pm", ${L.e3}, "frown", 0.1);
    shake("#pt-head", ${L.e3[0]}, ${L.e3[1] - L.e3[0]}, 6, "y");
    tl.to("#pt-belly", { scale: 1.06, duration: 0.1 }, ${L.e3[0]} + 0.2); tl.to("#pt-belly", { scale: 1, duration: 0.4, ease: "elastic.out(1,0.4)" }, ${L.e3[0]} + 0.3);
    tl.fromTo("#pt-puffs", { opacity: 1, scale: 1.2, svgOrigin: "420 1060" }, { opacity: 0.3, scale: 1, duration: 0.5, immediateRender: false }, ${L.e3[0]} + 0.2);
    tl.to(LIDS, { scaleY: 0.5, duration: 0.3 }, ${L.e3[1]});
    tl.fromTo("#cta", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.2)" }, ${L.e3[0]} - 0.2);
    tl.to("#ct2", { scale: 1.08, duration: 0.12, ease: "power2.out" }, ${L.e3[0]} + 0.5);
    tl.to("#ct2", { scale: 1, duration: 0.25, ease: "power2.inOut" }, ${L.e3[0]} + 0.62);
    tl.to("#ct3", { y: 8, duration: 0.4, ease: "sine.inOut", repeat: 4, yoyo: true }, ${L.e3[0]} + 0.6);
`;
// Dieselbe Patienten-Zeichnung zweimal im Video: Ids mit Präfix eindeutig machen.
const pfxPatient = (str, p) => str.replace(/\b(pt-|pe1|pe2|pm-m)/g, p + "$1");
const frageJs = `
    const Q0 = ${SC.frage[0]}, Q1 = ${SC.frage[1]};
    ${patientBase("Q0", "Q1")}
    tl.to(PUP, { x: -8, y: -2, duration: 0.2 }, Q0 + 0.2);
    talk("fq-pm", ${L.q1}, "frown", 0.13);
    tl.to("#pt-head", { rotation: -3, duration: 0.3, ease: "sine.inOut" }, ${L.q1[0]});
`;

/* ================= Captions ================= */
// Karte zeigt "SPÄTER" schon groß, daher keine Untertitel dafür.
const spoken = lines.filter((l) => l.speaker !== "card");
const words = spoken.flatMap((l) =>
  VO[l.id]
    ? VO[l.id].words.map((w) => ({
        text: w.text,
        emph: isEmphIn(l, w.text),
        start: +(RL(l) + w.start).toFixed(3),
        end: +(RL(l) + w.end).toFixed(3),
      }))
    : wordTimes([l]).map((w) => ({
        ...w,
        emph: isEmphIn(l, w.text),
        start: +(w.start - l.start + RL(l)).toFixed(3),
        end: +(w.end - l.start + RL(l)).toFixed(3),
      })),
);
const capBody = words
  .map(
    (w, i) =>
      `    <div id="cap-${i}" class="cap${w.emph ? " emph" : ""}">${w.text.replace(/[!?,.…]+$/u, "")}</div>`,
  )
  .join("\n");
const capJs = `
    const W = ${JSON.stringify(words.map((w) => [w.start, w.end]))};
    W.forEach(([s, e], i) => {
      const el = "#cap-" + i;
      const next = W[i + 1];
      const end = next && next[0] - e < 0.35 ? next[0] : e + 0.12;
      tl.set(el, { opacity: 1 }, s);
      tl.fromTo(el, { scale: 0.82 }, { scale: 1, duration: 0.09, ease: "back.out(3)", immediateRender: false }, s);
      tl.set(el, { opacity: 0 }, end);
    });
`;

const CAP_EMPH_CSS = `
  .cap.emph { color: #FFE14D; font-size: 104px; -webkit-text-stroke: 16px #1d1414; }`;

/* ================= Hook-Titel (erste Sekunden) ================= */
const hookBody = `
    <div id="hook">
${script.hook.map(([t, size, col], i) => `      <div class="hk" id="hk${i + 1}" style="font-size:${size}px;color:${col}">${t}</div>`).join("\n")}
    </div>`;
const hookCss = `
  #hook { position: absolute; left: 0; right: 0; top: 130px; text-align: center; transform: rotate(-3deg); }
  .hk { font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 86px; line-height: 1.04;
    color: #fff; -webkit-text-stroke: 16px #1d1414; paint-order: stroke fill; text-shadow: 0 8px 0 rgba(0,0,0,0.35); }
  .hk-y { color: #FFE14D; font-size: 102px; }`;
const hookJs = `
    // Frame 0 = erster Eindruck im Feed: Titel sofort voll lesbar, dann Puls auf dem Schlüsselwort.
    [0.25, 1.6].forEach((t) => {
      tl.to("#hk2", { scale: 1.1, duration: 0.08, ease: "power2.out" }, t);
      tl.to("#hk2", { scale: 1, duration: 0.3, ease: "elastic.out(1,0.5)" }, t + 0.08);
    });
    tl.to("#hook", { scale: 0.6, opacity: 0, duration: 0.18, ease: "power2.in" }, ${HOOK_END} - 0.18);
`;

/* ================= index.html ================= */
const sfx = script.sfx
  .map(
    (s, i) =>
      `      <audio id="${s.id}" class="clip" src="assets/sfx/${s.src}" data-start="${sfxStart(s)}" data-track-index="${10 + i}" data-volume="${s.volume}"></audio>`,
  )
  .join("\n");
function sfxStart(s) {
  if (s.anchor) return +(R(ORIG[s.anchor][0], s.anchor) + s.offset).toFixed(3);
  if (s.line) return +(RL(lines.find((l) => l.id === s.line)) + s.offset).toFixed(3);
  return R(s.start);
}
const bed = existsSync(new URL("./assets/sfx/bed-long.mp3", import.meta.url))
  ? `      <audio id="bed" class="clip" src="assets/sfx/bed-long.mp3" data-start="0" data-duration="${DUR}" data-track-index="9" data-volume="0.17"></audio>`
  : "";
const vo = lines
  .filter((l) => VO[l.id])
  .map(
    (l, i) =>
      `      <audio id="vo-${l.id}" class="clip" src="assets/vo/${l.id}.mp3" data-start="${RL(l)}" data-duration="${VO[l.id].fileDuration}" data-track-index="${40 + i}" data-volume="1"></audio>`,
  )
  .join("\n");
const host = (id, track, kind = "graphics", z = 1) => {
  const [a, b] = SC[id] || (id === "hook" ? [0, HOOK_END] : [0, DUR]);
  return `      <div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${R(a, ORDER.includes(id) ? id : undefined)}" data-duration="${+(b - a).toFixed(2)}" data-track-index="${track}" data-track-kind="${kind}" data-width="${W}" data-height="${H}" style="z-index:${z}"></div>`;
};

const index = `<!doctype html>
<html lang="de" data-composition-variables='[{"id":"handle","type":"string","label":"Wasserzeichen / Handle","default":"${script.handle}"}]'>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>${script.title}</title>
    <script src="assets/gsap.min.js"></script>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${TZ.bg}; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}">
${host("streit", 1)}
${host("spaeter", 2, "graphics", 2)}
${host("op", 3)}
${host("praxis", 4)}
${host("captions", 5, "captions", 5)}
${host("nachher", 11)}
${host("frage", 12)}
${host("patient", 7)}
${host("hook", 8, "graphics", 6)}
${host("marke", 6, "graphics", 4)}
${sfx}
${vo}
${bed}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;

const marke = `<template>
  <style>
    #root { position: absolute; inset: 0; pointer-events: none; }
    #wm { position: absolute; left: 60px; top: 1430px; font-family: "Montserrat", sans-serif; font-weight: 700;
      font-size: 46px; color: rgba(255,255,255,0.32); transform: rotate(32deg); transform-origin: left center; white-space: nowrap; }
  </style>
  <div id="root" data-composition-id="marke" data-width="${W}" data-height="${H}">
    <div id="wm" data-layout-ignore data-var-text="handle">${script.handle}</div>
  </div>
  <script>
    window.__timelines["marke"] = gsap.timeline({ paused: true });
  </script>
</template>
`;

mkdirSync(new URL("./compositions/", import.meta.url), { recursive: true });
const out = (f, s) => writeFileSync(new URL(f, import.meta.url), s);
const pre = (p, js) => js.replaceAll("@", p);
out("./index.html", index);
out("./compositions/streit.html", page("streit", SC.streit, belly("s-"), "", pre("s-", streitJs)));
out("./compositions/op.html", page("op", SC.op, belly("o-", "op"), "", pre("o-", opJs)));
out("./compositions/spaeter.html", page("spaeter", SC.spaeter, spaeterSvg, spaeterCss, spaeterJs));
out(
  "./compositions/praxis.html",
  page(
    "praxis",
    SC.praxis,
    praxisSvg.replace("<svg ", '<svg id="px-cam" '),
    "",
    HELPERS + praxisJs,
  ),
);
out(
  "./compositions/patient.html",
  page("patient", SC.patient, patientSvg + ctaBody, ctaCss, HELPERS + patientJs),
);
out(
  "./compositions/nachher.html",
  page("nachher", SC.nachher, belly("n-"), "", pre("n-", nachherJs)),
);
out(
  "./compositions/frage.html",
  page("frage", SC.frage, pfxPatient(patientSvg, "fq-"), "", HELPERS + pfxPatient(frageJs, "fq-")),
);
out("./compositions/hook.html", page("hook", [0, HOOK_END], hookBody, hookCss, hookJs));
out(
  "./compositions/captions.html",
  page("captions", [0, DUR], capBody, CAPTION_CSS + CAP_EMPH_CSS, capJs),
);
out("./compositions/marke.html", marke);
console.log(
  "Szenen (Echtzeit):",
  ORDER.map(
    (id) =>
      `${id} ${R(ORIG[id][0], id)}–${+(R(ORIG[id][0], id) + SC[id][1] - SC[id][0]).toFixed(2)}`,
  ).join(", "),
);
console.log(
  `built: ${Object.keys(VO).length} voice clips, ${words.length} caption words, ${script.sfx.length} sfx, ${DUR}s`,
);
