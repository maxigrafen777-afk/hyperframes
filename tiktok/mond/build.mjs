// "Was wäre, wenn der Mond verschwindet?" – baut index.html und compositions/*
// aus script.json + assets/vo/timings.json (node voices.mjs).
// Eine durchgehende Welt (Weltall → Nachthimmel → Meer → Unterwasser), durch die
// die Kamera in einer Fahrt fliegt. Der gestrichelte "Geister-Mond" ist das
// Trägerelement, das in jeder Station wieder auftaucht.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const W = 1080;
const H = 1920;
const here = (p) => new URL(p, import.meta.url);
const script = JSON.parse(readFileSync(here("./script.json"), "utf8"));
const VO = JSON.parse(readFileSync(here("./assets/vo/timings.json"), "utf8"));
const f = (n) => +n.toFixed(3);

/* ================= Zeitplan aus den echten Takes ================= */
// Pause VOR jeder Zeile (Platz für Kamerafahrten und Aktionen).
const WAIT = { n1: 0.15, n2: 0.55, n3: 0.3, n4: 0.65, n5: 1.7, n6: 1.35, n7: 1.15, n8: 0.25, n9: 0.6 };
const L = {};
let t = 0;
for (const line of script.lines) {
  const v = VO[line.id];
  const s = f(t + WAIT[line.id]);
  L[line.id] = { s, e: f(s + v.duration), words: v.words.map((w) => ({ ...w, start: f(s + w.start), end: f(s + w.end) })) };
  t = L[line.id].e;
}
const END_HOLD = 3.2;
const DUR = f(t + END_HOLD);
// Startzeit eines Worts (erstes Vorkommen, das mit `w` beginnt).
const at = (id, w) => {
  const hit = L[id].words.find((x) => x.text.toLowerCase().startsWith(w.toLowerCase()));
  if (!hit) throw new Error(`Wort ${w} fehlt in ${id}`);
  return hit.start;
};

/* ================= Welt-Geometrie ================= */
const Y_H = 4450; // Horizont
const Y_WL = 5150; // Wasserlinie (Schnitt nach unten)
const WORLD_H = 7400;
const MOON = { x: 540, y: 3990, r: 165 };
const SUN = { x: 540, y: 700, r: 150 };
const EARTH = { x: 540, y: 1900, r: 300 };
const CY = { hook: 3150, tide: 3800, under: 5450, sun: 0, earth: 1000 };
const TIDE = { mid: 4900, big: 140, small: 47 };
const C = {
  space: "#0A1020",
  ink: "#0A1020",
  moon: "#F3EBCF",
  moonShade: "#E2D5AC",
  crater: "#D6C79C",
  accent: "#FFD23F",
  sea: "#1F5A80",
  seaFar: "#1A4A6C",
  foam: "#8CC2E0",
  sand: "#D9B97A",
  sandDark: "#B8975C",
  sun: "#FFC83D",
  ray: "#FFA41B",
  ocean: "#2F72B8",
  land: "#5DAA5F",
};

// Deterministischer Zufall (nur beim Bauen; das Ergebnis ist statisches SVG).
let seed = 20261103;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
const stars = (n, y0, y1, cls = "", minR = 1.4, maxR = 3.6) =>
  Array.from({ length: n }, () => {
    const x = rnd() * W;
    const y = y0 + rnd() * (y1 - y0);
    const r = minR + rnd() * (maxR - minR);
    const o = 0.45 + rnd() * 0.55;
    return `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#fff" opacity="${o.toFixed(2)}"/>`;
  }).join("");

const ghost = (id, x, y, r, extra = "") =>
  `<circle id="${id}" cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${C.moon}" stroke-width="6" stroke-dasharray="20 14" stroke-linecap="round" ${extra}/>`;

const moonArt = (id, x, y, r) => `
  <g id="${id}">
    <circle cx="${x}" cy="${y}" r="${r}" fill="${C.moon}"/>
    <path d="M ${x + r * 0.2} ${y - r * 0.98} A ${r} ${r} 0 0 1 ${x + r * 0.2} ${y + r * 0.98} A ${r * 0.82} ${r} 0 0 0 ${x + r * 0.2} ${y - r * 0.98} Z" fill="${C.moonShade}"/>
    <circle cx="${x - r * 0.35}" cy="${y - r * 0.3}" r="${r * 0.2}" fill="${C.crater}"/>
    <circle cx="${x + r * 0.3}" cy="${y + r * 0.35}" r="${r * 0.14}" fill="${C.crater}"/>
    <circle cx="${x - r * 0.15}" cy="${y + r * 0.45}" r="${r * 0.1}" fill="${C.crater}"/>
    <circle cx="${x + r * 0.45}" cy="${y - r * 0.4}" r="${r * 0.08}" fill="${C.crater}"/>
  </g>`;

/* ---- Weltall + Himmel ---- */
const rays = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  const p = (rr, da) => `${(SUN.x + Math.cos(a + da) * rr).toFixed(1)} ${(SUN.y + Math.sin(a + da) * rr).toFixed(1)}`;
  return `<path d="M ${p(SUN.r + 22, -0.12)} L ${p(SUN.r + 82, 0)} L ${p(SUN.r + 22, 0.12)} Z" fill="${C.ray}"/>`;
}).join("");

const sky = `
  <rect x="0" y="0" width="${W}" height="2600" fill="${C.space}"/>
  <rect x="0" y="2600" width="${W}" height="200" fill="#0D1528"/>
  <rect x="0" y="2800" width="${W}" height="200" fill="#111C35"/>
  <rect x="0" y="3000" width="${W}" height="200" fill="#152346"/>
  <rect x="0" y="3200" width="${W}" height="900" fill="#1A2B55"/>
  <rect x="0" y="4100" width="${W}" height="${Y_H - 4100}" fill="#21386A"/>
  <g id="stars">${stars(150, 0, 2600)}${stars(70, 2600, 4380, "", 1.2, 3)}</g>
  <g id="sun">${rays}<circle cx="${SUN.x}" cy="${SUN.y}" r="${SUN.r}" fill="${C.sun}"/>
    <circle cx="${SUN.x - 40}" cy="${SUN.y - 45}" r="${SUN.r * 0.42}" fill="#FFD966"/></g>
  <g id="ghost-sun-pos">${ghost("ghost-sun", SUN.x, SUN.y, 140)}</g>
`;

/* ---- Erde ---- */
const E = EARTH;
const land = `
  <path d="M ${E.x - 210} ${E.y - 150} C ${E.x - 150} ${E.y - 230} ${E.x - 40} ${E.y - 210} ${E.x - 20} ${E.y - 140} C ${E.x} ${E.y - 70} ${E.x - 90} ${E.y - 40} ${E.x - 70} ${E.y + 30} C ${E.x - 50} ${E.y + 110} ${E.x - 130} ${E.y + 160} ${E.x - 170} ${E.y + 90} C ${E.x - 200} ${E.y + 30} ${E.x - 260} ${E.y - 60} ${E.x - 210} ${E.y - 150} Z" fill="${C.land}"/>
  <path d="M ${E.x + 60} ${E.y - 200} C ${E.x + 140} ${E.y - 240} ${E.x + 250} ${E.y - 170} ${E.x + 240} ${E.y - 80} C ${E.x + 230} ${E.y - 20} ${E.x + 150} ${E.y - 40} ${E.x + 120} ${E.y + 20} C ${E.x + 100} ${E.y + 80} ${E.x + 170} ${E.y + 150} ${E.x + 110} ${E.y + 200} C ${E.x + 60} ${E.y + 240} ${E.x + 20} ${E.y + 150} ${E.x + 30} ${E.y + 80} C ${E.x + 40} ${E.y} ${E.x - 10} ${E.y - 150} ${E.x + 60} ${E.y - 200} Z" fill="${C.land}"/>
  <path d="M ${E.x - 60} ${E.y + 190} C ${E.x - 20} ${E.y + 170} ${E.x + 30} ${E.y + 200} ${E.x + 10} ${E.y + 240} C ${E.x - 10} ${E.y + 270} ${E.x - 80} ${E.y + 250} ${E.x - 60} ${E.y + 190} Z" fill="${C.land}"/>`;
const earth = `
  <defs><clipPath id="earth-clip"><circle cx="${E.x}" cy="${E.y}" r="${E.r}"/></clipPath></defs>
  <g id="orbit" opacity="0">
    <ellipse cx="${E.x}" cy="${E.y}" rx="470" ry="120" fill="none" stroke="${C.moon}" stroke-width="5" stroke-dasharray="16 14" opacity="0.6"/>
  </g>
  <line id="axis-ref" x1="${E.x}" y1="${E.y - E.r - 110}" x2="${E.x}" y2="${E.y + E.r + 110}" stroke="#fff" stroke-width="4" stroke-dasharray="14 12" opacity="0"/>
  <g id="earth">
    <g clip-path="url(#earth-clip)">
      <circle cx="${E.x}" cy="${E.y}" r="${E.r}" fill="${C.ocean}"/>
      ${land}
      <ellipse cx="${E.x}" cy="${E.y - E.r + 10}" rx="170" ry="55" fill="#F4FAFF"/>
      <ellipse cx="${E.x}" cy="${E.y + E.r - 10}" rx="190" ry="60" fill="#F4FAFF"/>
      <rect id="season-n" x="${E.x - E.r}" y="${E.y - E.r}" width="${2 * E.r}" height="${E.r}" fill="#EAF6FF" opacity="0"/>
      <rect id="season-s" x="${E.x - E.r}" y="${E.y}" width="${2 * E.r}" height="${E.r}" fill="#FF6B2C" opacity="0"/>
      <path d="M ${E.x + E.r * 0.15} ${E.y - E.r} A ${E.r} ${E.r} 0 0 1 ${E.x + E.r * 0.15} ${E.y + E.r} L ${E.x + E.r} ${E.y + E.r} L ${E.x + E.r} ${E.y - E.r} Z" fill="#000" opacity="0.18"/>
    </g>
    <line id="axis" x1="${E.x}" y1="${E.y - E.r - 110}" x2="${E.x}" y2="${E.y + E.r + 110}" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity="0"/>
  </g>
  <path id="axis-arc" d="" fill="none" stroke="${C.accent}" stroke-width="7" stroke-linecap="round" opacity="0"/>
  <g id="ghost-orbit-pos" opacity="0">${ghost("ghost-orbit", E.x - 470, E.y, 44)}</g>
`;

/* ---- Meer an der Küste ---- */
const reflection = Array.from({ length: 9 }, (_, i) => {
  const y = Y_H + 24 + i * 34;
  const w = 150 - i * 11 + (i % 2 ? 26 : 0);
  return `<rect class="refl" x="${MOON.x - w / 2}" y="${y}" width="${w}" height="12" rx="6" fill="${C.moon}" opacity="${(0.85 - i * 0.06).toFixed(2)}"/>`;
}).join("");
const waveStripes = [0, 1, 2, 3]
  .map((i) => {
    const y = Y_H + 40 + i * 70;
    return `<path class="wave" d="M -60 ${y} q 45 -14 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0" fill="none" stroke="${C.foam}" stroke-width="4" opacity="${0.35 - i * 0.05}"/>`;
  })
  .join("");
const ticks = Array.from({ length: 12 }, (_, i) => {
  const y = 4660 + i * 40;
  return `<rect x="${i % 2 ? 612 : 600}" y="${y - 2}" width="${i % 2 ? 16 : 28}" height="5" fill="#F4E6C8"/>`;
}).join("");
const coast = `
  <rect x="0" y="${Y_H}" width="${W}" height="${Y_WL - Y_H}" fill="${C.seaFar}"/>
  <path d="M 760 ${Y_H} C 800 ${Y_H - 50} 860 ${Y_H - 90} 920 ${Y_H - 70} C 980 ${Y_H - 110} 1040 ${Y_H - 80} 1080 ${Y_H - 60} L 1080 ${Y_H} Z" fill="#101B36"/>
  <g id="waves">${waveStripes}</g>
  <g id="refl">${reflection}</g>
  <path d="M 0 4720 C 160 4730 330 4800 470 4930 C 540 5000 600 5090 640 ${Y_WL} L 0 ${Y_WL} Z" fill="${C.sand}"/>
  <path d="M 0 4860 C 150 4880 300 4960 400 ${Y_WL} L 0 ${Y_WL} Z" fill="${C.sandDark}" opacity="0.5"/>
  <g id="tide"><rect id="tide-water" x="0" y="${TIDE.mid}" width="${W}" height="${Y_WL - TIDE.mid + 4}" fill="${C.sea}"/>
    <rect id="tide-edge" x="0" y="${TIDE.mid - 3}" width="${W}" height="7" fill="${C.foam}"/></g>
  <g id="post"><rect x="626" y="4600" width="28" height="${Y_WL - 4600}" fill="#6B4F35"/><rect x="620" y="4588" width="40" height="18" rx="4" fill="#4E3824"/>${ticks}</g>
  <g id="br-old" opacity="0">
    <path d="M 585 ${TIDE.mid - TIDE.big} h -22 v ${2 * TIDE.big} h 22" fill="none" stroke="#fff" stroke-width="7" stroke-dasharray="14 10"/>
    <text x="545" y="${TIDE.mid - TIDE.big + 10}" text-anchor="end" class="lab">FRÜHER</text>
  </g>
  <g id="br-new" opacity="0">
    <path d="M 695 ${TIDE.mid - TIDE.small} h 22 v ${2 * TIDE.small} h -22" fill="none" stroke="${C.accent}" stroke-width="8"/>
    <text x="740" y="${TIDE.mid - 8}" class="lab lab-y">OHNE</text>
    <text x="740" y="${TIDE.mid + 44}" class="lab lab-y">MOND</text>
  </g>
`;

/* ---- Unterwasser ---- */
const coral = (x, y, s, col) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M 0 0 C -6 -60 -50 -90 -70 -150 M 0 0 C 4 -80 0 -130 10 -200 M 0 0 C 10 -50 60 -80 70 -160 M -38 -96 C -70 -110 -90 -130 -96 -170 M 6 -130 C 30 -150 40 -170 44 -205 M 50 -110 C 80 -120 96 -140 104 -175"
      fill="none" stroke="${col}" stroke-width="22" stroke-linecap="round"/>
  </g>`;
const fanCoral = (x, y, s, col) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M -110 0 C -120 -120 -60 -190 0 -190 C 60 -190 120 -120 110 0 Z" fill="${col}"/>
    <path d="M 0 0 L 0 -170 M 0 -60 L -70 -130 M 0 -60 L 70 -130 M 0 -110 L -40 -165 M 0 -110 L 40 -165" stroke="#00000033" stroke-width="10" stroke-linecap="round"/>
  </g>`;
const eggs = Array.from({ length: 34 }, (_, i) => {
  const x = 150 + rnd() * 780;
  const y = 6480 + rnd() * 260;
  return `<circle class="egg" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(7 + rnd() * 6).toFixed(1)}" fill="#FFC2D6" opacity="0"/>`;
}).join("");
const fish = (id, x, y, s, col) => `
  <g id="${id}"><g transform="translate(${x} ${y}) scale(${s})">
    <path d="M 0 0 C 30 -34 90 -34 120 0 C 90 34 30 34 0 0 Z" fill="${col}"/>
    <path d="M 0 0 L -40 -30 L -34 0 L -40 30 Z" fill="${col}"/>
    <circle cx="92" cy="-6" r="7" fill="${C.ink}"/>
  </g></g>`;
const underwater = `
  <rect x="0" y="${Y_WL}" width="${W}" height="450" fill="#1C6A8C"/>
  <rect x="0" y="${Y_WL + 450}" width="${W}" height="600" fill="#165C7C"/>
  <rect x="0" y="${Y_WL + 1050}" width="${W}" height="600" fill="#114B68"/>
  <rect x="0" y="${Y_WL + 1650}" width="${W}" height="${WORLD_H - Y_WL - 1650}" fill="#0D3D57"/>
  <path d="M 0 ${Y_WL} q 45 -18 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 L 1080 ${Y_WL + 14} L 0 ${Y_WL + 14} Z" fill="${C.foam}"/>
  <path d="M 0 6930 C 200 6880 420 6920 600 6900 C 800 6880 960 6910 1080 6890 L 1080 ${WORLD_H} L 0 ${WORLD_H} Z" fill="#8E7A55"/>
  ${fish("fish1", -200, 5800, 0.9, "#FFB347")}${fish("fish2", 1150, 6080, 0.7, "#7FD1C7")}
  ${coral(250, 6940, 1.5, "#FF7A7A")}${fanCoral(560, 6950, 1.35, "#FF9F43")}${coral(840, 6950, 1.35, "#E86A9A")}
  ${coral(420, 6960, 0.9, "#FFB0A0")}${fanCoral(130, 6970, 0.8, "#E86A9A")}${coral(700, 6975, 0.85, "#FF7A7A")}
  <g id="eggs">${eggs}</g>
  <g id="cal" opacity="0">
    <g id="cal-in">
      <rect x="380" y="5830" width="320" height="300" rx="22" fill="#F7F3EA"/>
      <rect x="380" y="5830" width="320" height="78" rx="22" fill="#E8505B"/>
      <rect x="380" y="5880" width="320" height="28" fill="#E8505B"/>
      <text x="540" y="5884" text-anchor="middle" class="cal-t">VOLLMOND</text>
      <g id="cal-moon">${moonArt("cal-moon-art", 540, 6020, 74)}</g>
      ${ghost("cal-ghost", 540, 6020, 74, 'opacity="0" stroke="#9B8F70"')}
    </g>
  </g>
`;

/* ================= Welt-Komposition ================= */
const world = `
<div id="shake"><div id="zoom"><div id="cam">
<svg id="world" viewBox="0 0 ${W} ${WORLD_H}" width="${W}" height="${WORLD_H}" xmlns="http://www.w3.org/2000/svg">
  ${sky}
  ${earth}
  ${coast}
  ${underwater}
  <rect id="dark" x="0" y="2600" width="${W}" height="${Y_WL - 2600}" fill="#02040B" opacity="0"/>
  <g id="stars2">${stars(110, 3150, 4400, "s2", 1.2, 3.4)}</g>
  <g id="moon-pos">${moonArt("moon", MOON.x, MOON.y, MOON.r)}</g>
  ${ghost("moon-ghost", MOON.x, MOON.y, MOON.r, 'opacity="0"')}
</svg>
</div></div></div>
<div id="flash"></div>
<div id="hook" class="ov">
  <div class="hk hk-s">WAS WÄRE, WENN</div>
  <div class="hk hk-y">DER MOND</div>
  <div class="hk">VERSCHWINDET?</div>
</div>
<div id="sticker" class="ov"><div class="stk">KEIN WELTUNTERGANG <span class="ok">✓</span></div></div>
<div id="third" class="ov"><div class="big-y">≈ ⅓</div><div class="sub">so hoch wie heute</div></div>
<div id="qmark" class="ov"><div class="q">?</div></div>
<div id="stamp" class="ov"><div class="stp">NIE WIEDER</div></div>
<div id="deg" class="ov"><div class="deg-n" id="deg-n">23,4°</div><div class="sub">Neigung der Erdachse</div></div>
<div id="years" class="ov"><div class="yr" id="yr">+1 MIO. JAHRE</div></div>
<div id="cta" class="ov">
  <div class="ct">WAS WÜRDEST DU AM MEISTEN</div>
  <div class="ct ct-y">VERMISSEN?</div>
  <div id="ct3">Schreib's in die Kommentare ↓</div>
</div>`;

const worldCss = `
  #root { background: ${C.space}; }
  #shake, #zoom { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
  #cam { position: absolute; left: 0; top: 0; width: ${W}px; height: ${WORLD_H}px; }
  #world { position: absolute; left: 0; top: 0; width: ${W}px; height: ${WORLD_H}px; }
  #flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
  .ov { position: absolute; left: 0; right: 0; text-align: center; opacity: 0; }
  .lab { font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 40px; fill: #fff;
    stroke: ${C.ink}; stroke-width: 10px; paint-order: stroke fill; }
  .lab-y { fill: ${C.accent}; }
  .cal-t { font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 40px; fill: #fff; letter-spacing: 2px; }
  .hk, .ct, .big-y, .deg-n, .yr, .stp, .q, .sub { font-family: "Montserrat", sans-serif; font-weight: 900; color: #fff;
    -webkit-text-stroke: 16px ${C.ink}; paint-order: stroke fill; line-height: 1.04; }
  #hook { top: 372px; opacity: 1; }
  .hk { font-size: 92px; }
  .hk-s { font-size: 66px; }
  .hk-y { color: ${C.accent}; font-size: 124px; }
  #sticker { top: 400px; }
  .stk { display: inline-block; padding: 22px 36px; border-radius: 26px; background: #fff; color: ${C.ink};
    font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 54px; border: 7px solid ${C.ink}; }
  .ok { color: #1FA35C; }
  #third { top: 380px; }
  .big-y { color: ${C.accent}; font-size: 150px; }
  .sub { font-size: 46px; -webkit-text-stroke: 12px ${C.ink}; margin-top: 8px; font-weight: 800; }
  #qmark { top: 420px; }
  .q { color: ${C.accent}; font-size: 260px; }
  #stamp { top: 990px; }
  .stp { display: inline-block; color: ${C.accent}; font-size: 112px; padding: 6px 30px 12px; border: 10px solid ${C.accent};
    border-radius: 18px; -webkit-text-stroke: 0; background: ${C.ink}; }
  #deg { top: 380px; }
  .deg-n { color: ${C.accent}; font-size: 120px; }
  #years { top: 1390px; }
  .yr { font-size: 64px; }
  #cta { top: 372px; }
  .ct { font-size: 64px; }
  .ct-y { color: ${C.accent}; font-size: 112px; }
  #ct3 { display: inline-block; margin-top: 22px; padding: 16px 34px; border-radius: 40px; background: ${C.ink};
    color: #fff; font-family: "Montserrat", sans-serif; font-weight: 800; font-size: 44px; border: 4px solid #fff; }
`;

/* ---- Timeline der Welt ---- */
const vanishT = at("n1", "verschwindet") + 0.2;
const T = {
  vanish: f(vanishT),
  hookOut: f(L.n1.e + 0.15),
  sticker: at("n2", "kein"),
  stickerOut: f(L.n2.e + 0.1),
  dark: at("n3", "dunkel") - 0.4,
  starsIn: at("n3", "Mondlicht"),
  toTide: f(L.n4.s - 0.6),
  bigTide: at("n4", "Ebbe") - 0.3,
  smallTide: at("n4", "schrumpfen"),
  third: at("n4", "Drittel"),
  dive: f(L.n5.s - 1.2),
  eggs: at("n5", "laichen"),
  cal: at("n5", "Korallen") - 0.1,
  calGone: at("n5", "Kalender") + 0.15,
  rise: f(L.n6.s - 1.3),
  ghostSun: f(L.n6.s - 0.1),
  stamp: at("n6", "nie") - 0.05,
  toEarth: f(L.n7.s - 0.4),
  axis: at("n7", "Erdachse") - 0.1,
  orbit: at("n7", "Mond") - 0.1,
  deg: at("n7", "stabil"),
  orbitOut: L.n8.s,
  years: at("n8", "Millionen") - 0.1,
  wobble: at("n8", "Taumeln") - 0.3,
  seasons: at("n8", "extremen"),
  cta: f(L.n9.s - 0.1),
  ctaSub: f(L.n9.e + 0.1),
};

// Erdachsen-Taumeln: Winkel-Keyframes (Grad), gemessen ab der Senkrechten.
const WOB = [
  [T.years, 23.4],
  [T.years + 0.9, 31],
  [T.wobble + 0.1, 58],
  [T.wobble + 0.95, 12],
  [T.wobble + 1.7, 71],
  [T.seasons + 0.8, 18],
  [T.seasons + 1.6, 66],
  [T.cta + 0.2, 23.4],
];

const worldJs = `
    const E = ${JSON.stringify(EARTH)};
    gsap.set("#zoom", { transformOrigin: "540px 960px", scale: 1.12 });
    gsap.set("#cam", { y: ${-CY.hook} });
    gsap.set("#moon", { svgOrigin: "${MOON.x} ${MOON.y}" });
    gsap.set("#earth", { svgOrigin: "${E.x} ${E.y}", rotation: 23.4 });
    gsap.set(".ov", { transformOrigin: "50% 50%" });

    // HOOK: Titel steht ab Frame 0, Kamera-Punch, der Mond verschwindet.
    tl.to("#zoom", { scale: 1, duration: 0.7, ease: "back.out(1.4)" }, 0);
    tl.to("#moon", { scale: 1.12, duration: 0.25, ease: "power2.out" }, ${T.vanish} - 0.25);
    tl.to("#moon", { scale: 0, rotation: 40, duration: 0.32, ease: "back.in(2)" }, ${T.vanish});
    tl.fromTo("#flash", { opacity: 0 }, { opacity: 0.35, duration: 0.05 }, ${T.vanish} + 0.3);
    tl.to("#flash", { opacity: 0, duration: 0.3 }, ${T.vanish} + 0.35);
    tl.to("#moon-ghost", { opacity: 0.8, duration: 0.4, ease: "power1.out" }, ${T.vanish} + 0.32);
    tl.to(".refl", { scaleX: 0, opacity: 0, transformOrigin: "50% 50%", duration: 0.25, stagger: 0.04, ease: "power2.in" }, ${T.vanish} + 0.2);
    tl.to("#hook", { opacity: 0, y: -30, duration: 0.25, ease: "power2.in" }, ${T.hookOut});

    // Wellen laufen (Wasser bewegt sich, solange wir an der Küste sind).
    tl.fromTo(".wave", { x: 0 }, { x: -90, duration: 2.4, ease: "none", repeat: ${Math.ceil(T.dive / 2.4)}, stagger: 0.3 }, 0);

    // "Kein Weltuntergang"-Sticker
    tl.fromTo("#sticker", { opacity: 0, scale: 0.5, rotation: -10 }, { opacity: 1, scale: 1, rotation: -4, duration: 0.35, ease: "back.out(2.2)" }, ${T.sticker});
    tl.to("#sticker", { opacity: 0, scale: 0.8, duration: 0.2, ease: "power2.in" }, ${T.stickerOut});

    // Nacht wird dunkel, mehr Sterne sichtbar, Kamera schiebt langsam rein.
    gsap.set(".s2", { opacity: 0 });
    tl.to("#dark", { opacity: 0.62, duration: 1.4, ease: "power2.inOut" }, ${T.dark});
    tl.to(".s2", { opacity: 0.9, duration: 0.25, stagger: 0.012, ease: "power1.out" }, ${T.starsIn});
    tl.to("#zoom", { scale: 1.06, duration: ${f(L.n3.e - T.dark)}, ease: "power1.inOut" }, ${T.dark});

    // Gezeiten: Kamera runter zum Pegel, große Tide, dann kleine.
    tl.to("#zoom", { scale: 1, duration: 0.9, ease: "power3.inOut" }, ${T.toTide});
    tl.to("#cam", { y: ${-CY.tide}, duration: 0.9, ease: "power3.inOut" }, ${T.toTide});
    tl.to("#dark", { opacity: 0.35, duration: 0.9 }, ${T.toTide});
    const tideTo = (y, d, t0, ease) => {
      tl.to("#tide-water", { attr: { y, height: ${Y_WL + 4} - y }, duration: d, ease }, t0);
      tl.to("#tide-edge", { attr: { y: y - 3 }, duration: d, ease }, t0);
    };
    tl.to("#br-old", { opacity: 1, duration: 0.2 }, ${T.bigTide});
    tideTo(${TIDE.mid - TIDE.big}, 0.6, ${T.bigTide}, "sine.inOut");
    tideTo(${TIDE.mid + TIDE.big}, ${f(T.smallTide - T.bigTide - 0.62)}, ${T.bigTide} + 0.6, "sine.inOut");
    tl.to("#br-old", { opacity: 0.45, duration: 0.3 }, ${T.smallTide});
    tl.to("#br-new", { opacity: 1, duration: 0.2 }, ${T.smallTide});
    tideTo(${TIDE.mid - TIDE.small}, 0.55, ${T.smallTide}, "sine.inOut");
    tideTo(${TIDE.mid + TIDE.small}, 0.55, ${T.smallTide} + 0.55, "sine.inOut");
    tideTo(${TIDE.mid - TIDE.small}, 0.55, ${T.smallTide} + 1.1, "sine.inOut");
    tideTo(${TIDE.mid}, 0.4, ${T.smallTide} + 1.65, "sine.inOut");
    tl.fromTo("#third", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2.4)" }, ${T.third});
    tl.to("#third", { opacity: 0, duration: 0.2 }, ${T.dive});

    // Abtauchen ins Meer.
    tl.to("#cam", { y: ${-CY.under}, duration: 1.05, ease: "power3.inOut" }, ${T.dive});
    tl.to("#fish1", { x: 1400, duration: 7, ease: "none" }, ${T.dive} + 0.4);
    tl.to("#fish2", { x: -1500, duration: 8, ease: "none" }, ${T.dive} + 0.9);
    tl.fromTo("#cal", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.35, ease: "back.out(1.8)" }, ${T.cal});
    tl.fromTo(".egg", { opacity: 0, y: 0 }, { opacity: 1, y: -60, duration: 0.5, stagger: 0.015, ease: "power2.out" }, ${T.eggs});
    tl.to(".egg", { y: -260, duration: ${f(T.calGone + 0.18 - T.eggs - 0.5 - 33 * 0.015)}, stagger: 0.015, ease: "sine.inOut" }, ${T.eggs} + 0.5);
    // Der Vollmond verschwindet aus dem Kalender: Eier stoppen und sinken.
    gsap.set("#cal-moon-art", { svgOrigin: "540 6020" });
    tl.to("#cal-moon-art", { scale: 0, duration: 0.3, ease: "back.in(2)" }, ${T.calGone});
    tl.to("#cal-ghost", { opacity: 1, duration: 0.3 }, ${T.calGone} + 0.25);
    tl.to(".egg", { opacity: 0, y: -140, duration: 0.7, stagger: 0.01, ease: "power2.in" }, ${T.calGone} + 0.2);
    tl.fromTo("#qmark", { opacity: 0, scale: 0.4, rotation: -20 }, { opacity: 1, scale: 1, rotation: 8, duration: 0.4, ease: "back.out(2.5)" }, ${T.calGone} + 0.3);
    tl.to(["#qmark", "#cal"], { opacity: 0, duration: 0.2 }, ${T.rise});

    // Hoch ins All, an der Sonne vorbei.
    tl.to("#cam", { y: ${-CY.sun}, duration: 1.3, ease: "power3.inOut" }, ${T.rise});
    tl.to("#dark", { opacity: 0, duration: 0.6 }, ${T.rise});
    gsap.set("#ghost-sun-pos", { x: -760 });
    tl.to("#ghost-sun-pos", { x: 0, duration: 1.1, ease: "power2.out" }, ${T.ghostSun});
    tl.to("#ghost-sun-pos", { x: 800, duration: 1.0, ease: "power2.in" }, ${T.ghostSun} + 1.5);
    tl.fromTo("#stamp", { opacity: 0, scale: 1.8, rotation: -14 }, { opacity: 1, scale: 1, rotation: -7, duration: 0.18, ease: "power4.in" }, ${T.stamp});
    tl.to("#shake", { x: 10, y: -8, duration: 0.05 }, ${T.stamp} + 0.18);
    tl.to("#shake", { x: -7, y: 6, duration: 0.05 }, ${T.stamp} + 0.23);
    tl.to("#shake", { x: 0, y: 0, duration: 0.08 }, ${T.stamp} + 0.28);
    tl.to("#stamp", { opacity: 0, duration: 0.2 }, ${T.toEarth});

    // Zur Erde: Achse, Mondbahn, 23,4°.
    tl.to("#cam", { y: ${-CY.earth}, duration: 0.9, ease: "power2.inOut" }, ${T.toEarth});
    tl.to("#orbit", { opacity: 1, duration: 0.4 }, ${T.orbit});
    tl.to("#ghost-orbit-pos", { opacity: 1, duration: 0.4 }, ${T.orbit});
    tl.to("#ghost-orbit-pos", { x: 470, y: 118, duration: 1.4, ease: "sine.inOut" }, ${T.orbit});
    tl.to(["#axis", "#axis-ref"], { opacity: 1, duration: 0.3 }, ${T.axis});
    const A = { a: 23.4 };
    const arcR = E.r + 70;
    const drawArc = () => {
      const r = (A.a * Math.PI) / 180;
      const x = E.x + Math.sin(r) * arcR, y = E.y - Math.cos(r) * arcR;
      document.querySelector("#axis-arc").setAttribute("d", "M " + E.x + " " + (E.y - arcR) + " A " + arcR + " " + arcR + " 0 0 1 " + x.toFixed(1) + " " + y.toFixed(1));
      document.querySelector("#deg-n").textContent = A.a.toFixed(1).replace(".", ",") + "°";
    };
    drawArc();
    tl.to("#axis-arc", { opacity: 1, duration: 0.3 }, ${T.deg});
    tl.fromTo("#deg", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2.2)" }, ${T.deg});

    // Ohne Mond: Bahn weg, Achse taumelt, Jahre zählen hoch.
    tl.to(["#orbit", "#ghost-orbit-pos"], { opacity: 0, duration: 0.35 }, ${T.orbitOut});
    const WOB = ${JSON.stringify(WOB)};
    for (let i = 1; i < WOB.length; i++) {
      const [t0, a0] = WOB[i - 1], [t1, a1] = WOB[i];
      tl.to(A, { a: a1, duration: t1 - t0, ease: "sine.inOut", onUpdate: drawArc }, t0);
      tl.to("#earth", { rotation: a1, duration: t1 - t0, ease: "sine.inOut" }, t0);
    }
    const Y = { v: 1 };
    tl.fromTo("#years", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.25 }, ${T.years});
    tl.to(Y, { v: 50, duration: ${f(T.cta - 0.3 - T.years)}, ease: "power2.in", onUpdate: () => {
      document.querySelector("#yr").textContent = "+" + Math.round(Y.v) + " MIO. JAHRE";
    } }, ${T.years});
    tl.to("#years", { opacity: 0, duration: 0.2 }, ${T.cta} - 0.3);
    // Rumpeln beim Taumeln.
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `tl.to("#shake", { x: ${i % 2 ? -6 : 6}, y: ${i % 3 ? 4 : -5}, duration: 0.08 }, ${f(T.wobble + i * 0.12)});`).join("\n    ")}
    tl.to("#shake", { x: 0, y: 0, duration: 0.12 }, ${f(T.wobble + 0.96)});
    // Extreme Jahreszeiten: Norden vereist, Süden glüht, dann umgekehrt.
    tl.to("#season-n", { opacity: 0.88, duration: 0.3 }, ${T.seasons});
    tl.to("#season-s", { opacity: 0.8, duration: 0.3 }, ${T.seasons});
    tl.to("#season-n", { attr: { fill: "#FF6B2C" }, opacity: 0.8, duration: 0.3 }, ${T.seasons} + 0.9);
    tl.to("#season-s", { attr: { fill: "#EAF6FF" }, opacity: 0.88, duration: 0.3 }, ${T.seasons} + 0.9);
    tl.to(["#season-n", "#season-s"], { opacity: 0, duration: 0.4 }, ${T.cta});
    tl.to("#deg", { opacity: 0, duration: 0.2 }, ${T.cta} - 0.3);

    // Kommentar-Frage, der Geister-Mond kehrt an die Erde zurück.
    tl.to("#cam", { y: -760, duration: 0.6, ease: "power2.inOut" }, ${T.cta} - 0.2);
    tl.fromTo("#cta", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.2)" }, ${T.cta});
    tl.fromTo("#ct3", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 }, ${T.ctaSub});
    tl.to("#orbit", { opacity: 1, duration: 0.6 }, ${T.ctaSub});
    tl.set("#ghost-orbit-pos", { x: 0, y: 0 }, ${T.ctaSub});
    tl.to("#ghost-orbit-pos", { opacity: 1, duration: 0.6 }, ${T.ctaSub});
    tl.to("#ghost-orbit-pos", { x: 470, y: 118, duration: ${f(DUR - T.ctaSub)}, ease: "sine.inOut" }, ${T.ctaSub});
`;

/* ================= Untertitel ================= */
const emphOf = (l, w) => (l.emph || []).some((e) => w.toLowerCase().replace(/[^\p{L}]/gu, "") === e.toLowerCase());
const chunks = [];
for (const line of script.lines) {
  let cur = [];
  const words = L[line.id].words;
  words.forEach((w, i) => {
    cur.push({ ...w, emph: emphOf(line, w.text) });
    const punct = /[.,:?!]$/.test(w.text);
    if (cur.length === 3 || punct || i === words.length - 1) {
      chunks.push(cur);
      cur = [];
    }
  });
}
const capBody = chunks
  .map(
    (c, i) =>
      `    <div id="cap-${i}" class="cap">${c
        .map((w) => `<span${w.emph ? ' class="emph"' : ""}>${w.text.replace(/[.,:!]+$/u, "")}</span>`)
        .join(" ")}</div>`,
  )
  .join("\n");
const capCss = `
  .cap { position: absolute; left: 70px; right: 70px; top: 1210px; text-align: center; opacity: 0;
    font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 74px; line-height: 1.05; color: #fff;
    text-transform: uppercase; -webkit-text-stroke: 14px ${C.ink}; paint-order: stroke fill; }
  .cap .emph { color: ${C.accent}; }`;
const capJs = `
    const CH = ${JSON.stringify(chunks.map((c) => [c[0].start, c.at(-1).end]))};
    CH.forEach(([s, e], i) => {
      const el = "#cap-" + i;
      const next = CH[i + 1];
      const end = next && next[0] - e < 0.5 ? next[0] : e + 0.2;
      tl.set(el, { opacity: 1 }, s);
      tl.fromTo(el, { scale: 0.86 }, { scale: 1, duration: 0.1, ease: "back.out(3)", immediateRender: false }, s);
      tl.set(el, { opacity: 0 }, end);
    });
`;

/* ================= Seiten ================= */
const page = (id, body, css, js) => `<template>
  <style>
    #root { position: absolute; inset: 0; overflow: hidden; }
    ${css}
  </style>
  <div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}" data-layout-allow-overflow data-layout-allow-overlap>
${body}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
${js}
    tl.set({}, {}, ${DUR});
    window.__timelines["${id}"] = tl;
  </script>
</template>
`;

/* ================= Ton ================= */
const SFX = [
  ["boom", "gen-boom", 0, 0.5],
  ["vanish", "gen-vanish", T.vanish - 0.15, 0.6],
  ["wave1", "gen-wave", 3.2, 0.25],
  ["pop1", "gen-pop", T.sticker - 0.05, 0.45],
  ["dark", "gen-dark", T.dark, 0.45],
  ["wave2", "gen-wave", T.toTide + 0.4, 0.35],
  ["pop2", "gen-pop", T.third, 0.45],
  ["splash", "gen-splash", T.dive + 0.45, 0.55],
  ["bubbles", "gen-bubbles", T.dive + 1.2, 0.3],
  ["pop3", "gen-pop", T.calGone + 0.3, 0.45],
  ["rise", "gen-rise", T.rise, 0.5],
  ["stamp", "gen-stamp", T.stamp + 0.15, 0.7],
  ["tick", "gen-tick", T.years, 0.25],
  ["rumble", "gen-rumble", T.wobble - 0.2, 0.55],
  ["pop4", "gen-pop", T.cta, 0.45],
];
let track = 10;
const sfx = SFX.map(
  ([id, file, s, v]) =>
    `      <audio id="sfx-${id}" class="clip" src="assets/sfx/${file}.mp3" data-start="${f(Math.max(0, s))}" data-track-index="${track++}" data-volume="${v}"></audio>`,
).join("\n");
const vo = script.lines
  .map(
    (l) =>
      `      <audio id="vo-${l.id}" class="clip" src="assets/vo/${l.id}.mp3" data-start="${L[l.id].s}" data-duration="${VO[l.id].fileDuration}" data-track-index="${track++}" data-volume="1"></audio>`,
  )
  .join("\n");

const index = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>${script.title}</title>
    <script src="assets/gsap.min.js"></script>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${C.space}; }
      #root { background: ${C.space}; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}">
      <div id="welt" data-composition-id="welt" data-composition-src="compositions/welt.html" data-start="0" data-duration="${DUR}" data-track-index="1" data-track-kind="graphics" data-width="${W}" data-height="${H}" style="z-index:1"></div>
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${DUR}" data-track-index="2" data-track-kind="captions" data-width="${W}" data-height="${H}" style="z-index:5"></div>
${sfx}
${vo}
      <audio id="bed" class="clip" src="assets/sfx/bed-long.mp3" data-start="0" data-duration="${DUR}" data-track-index="9" data-volume="0.08"></audio>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;

mkdirSync(here("./compositions/"), { recursive: true });
writeFileSync(here("./index.html"), index);
writeFileSync(here("./compositions/welt.html"), page("welt", world, worldCss, worldJs));
writeFileSync(here("./compositions/captions.html"), page("captions", capBody, capCss, capJs));
console.log("Zeilen:", Object.entries(L).map(([k, v]) => `${k} ${v.s}–${v.e}`).join(", "));
console.log("Beats:", JSON.stringify(T));
console.log(`built: ${chunks.length} Untertitel, ${SFX.length} SFX, ${DUR}s`);
