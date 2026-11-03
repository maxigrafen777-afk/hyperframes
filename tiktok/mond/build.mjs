// "Was wäre, wenn der Mond verschwindet?" (v3) – baut index.html und compositions/*
// aus script.json + assets/vo/timings.json (node voices.mjs).
// Eine durchgehende Welt (Weltall → Nachthimmel → Küste → Unterwasser), durch die
// die Kamera in einer Fahrt fliegt. Der gestrichelte "Geister-Mond" ist das
// Trägerelement, das in jeder Station wieder auftaucht. Der Zuschauer ("du")
// kommt an jeder Station vor: dein Haus, dein Strandurlaub, dein Deutschland.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const W = 1080;
const H = 1920;
const here = (p) => new URL(p, import.meta.url);
const script = JSON.parse(readFileSync(here("./script.json"), "utf8"));
const VO = JSON.parse(readFileSync(here("./assets/vo/timings.json"), "utf8"));
const f = (n) => +n.toFixed(3);

/* ================= Zeitplan aus den echten Takes ================= */
// Pause VOR jeder Zeile (Platz für Kamerafahrten und Aktionen).
const WAIT = { n1: 0.1, n2: 0.2, n3: 0.2, n4: 0.3, n5: 0.9, n6: 0.35, n7: 0.15, n8: 0.85, n9: 0.3, n10: 1.25 };
const L = {};
let t = 0;
for (const line of script.lines) {
  const v = VO[line.id];
  const s = f(t + WAIT[line.id]);
  L[line.id] = {
    s,
    e: f(s + v.duration),
    words: v.words.map((w) => ({ ...w, start: f(s + w.start), end: f(s + w.end) })),
  };
  t = L[line.id].e;
}
const END_HOLD = 2.4;
const DUR = f(t + END_HOLD);
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
const CY = { hook: 3150, tide: 3800, under: 5450, sun: 0, earth: 1000, end: 760 };
const TIDE = { mid: 4900, big: 140, small: 47 };
const C = {
  space: "#0A1020",
  ink: "#0A1020",
  moon: "#F3EBCF",
  moonShade: "#DCCDA0",
  crater: "#CDBD8E",
  craterLight: "#FBF6E4",
  accent: "#FFD23F",
  sea: "#1F5A80",
  seaFar: "#1A4A6C",
  foam: "#8CC2E0",
  sand: "#D9B97A",
  sandDark: "#B8975C",
  sun: "#FFC83D",
  ray: "#FFA41B",
  ocean: "#2F72B8",
  oceanDeep: "#285FA0",
  land: "#6DB060",
  desert: "#D9B15F",
  hot: "#FF6B2C",
  ice: "#EAF6FF",
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
// Ein paar größere Funkel-Sterne (vierzackig, flach).
const sparkles = (n, y0, y1, cls = "") =>
  Array.from({ length: n }, () => {
    const x = rnd() * W;
    const y = y0 + rnd() * (y1 - y0);
    const s = 7 + rnd() * 8;
    return `<path class="${cls}" d="M ${x} ${y - s} Q ${x} ${y} ${x + s} ${y} Q ${x} ${y} ${x} ${y + s} Q ${x} ${y} ${x - s} ${y} Q ${x} ${y} ${x} ${y - s} Z" fill="#fff" opacity="0.9"/>`;
  }).join("");

// Glatte geschlossene Kurve durch Punkte (Catmull-Rom → Bezier).
const blob = (pts, cx, cy, r) => {
  const P = pts.map(([x, y]) => [cx + x * r, cy + y * r]);
  const n = P.length;
  let d = `M ${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + " Z";
};

const ghost = (id, x, y, r, extra = "") =>
  `<circle id="${id}" cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${C.moon}" stroke-width="6" stroke-dasharray="20 14" stroke-linecap="round" ${extra}/>`;

// Mond mit Mare-Flecken, Kratern mit Lichtkante und Schattenseite.
const moonArt = (id, x, y, r) => {
  const crater = (dx, dy, cr) =>
    `<circle cx="${x + dx * r}" cy="${y + dy * r}" r="${cr * r}" fill="${C.crater}"/>` +
    `<path d="M ${x + (dx - cr) * r} ${y + dy * r} A ${cr * r} ${cr * r} 0 0 0 ${x + (dx + cr) * r} ${y + dy * r}" fill="none" stroke="${C.craterLight}" stroke-width="${Math.max(2, r * 0.025)}" opacity="0.8"/>`;
  return `
  <g id="${id}">
    <defs><clipPath id="${id}-clip"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath></defs>
    <g clip-path="url(#${id}-clip)">
      <circle cx="${x}" cy="${y}" r="${r}" fill="${C.moon}"/>
      <path d="${blob([[-0.6, -0.3], [-0.2, -0.55], [0.15, -0.35], [0.05, -0.05], [-0.35, 0.05], [-0.62, -0.05]], x, y, r)}" fill="#E4D8B4"/>
      <path d="${blob([[0.1, 0.15], [0.45, 0.05], [0.6, 0.3], [0.35, 0.55], [0.05, 0.45]], x, y, r)}" fill="#E4D8B4"/>
      ${crater(-0.38, -0.3, 0.17)}${crater(0.32, 0.36, 0.13)}${crater(-0.12, 0.5, 0.09)}${crater(0.46, -0.36, 0.08)}${crater(0.05, -0.62, 0.06)}${crater(-0.62, 0.3, 0.07)}
      <path d="M ${x + r * 0.35} ${y - r * 1.05} A ${r * 1.05} ${r * 1.05} 0 0 1 ${x + r * 0.35} ${y + r * 1.05} A ${r * 0.78} ${r * 1.05} 0 0 0 ${x + r * 0.35} ${y - r * 1.05} Z" fill="${C.moonShade}" opacity="0.85"/>
    </g>
  </g>`;
};

/* ---- Weltall + Himmel ---- */
const rays = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  const p = (rr, da) =>
    `${(SUN.x + Math.cos(a + da) * rr).toFixed(1)} ${(SUN.y + Math.sin(a + da) * rr).toFixed(1)}`;
  return `<path d="M ${p(SUN.r + 22, -0.12)} L ${p(SUN.r + 82, 0)} L ${p(SUN.r + 22, 0.12)} Z" fill="${C.ray}"/>`;
}).join("");

const sky = `
  <rect x="0" y="0" width="${W}" height="2600" fill="${C.space}"/>
  <rect x="0" y="2600" width="${W}" height="200" fill="#0D1528"/>
  <rect x="0" y="2800" width="${W}" height="200" fill="#111C35"/>
  <rect x="0" y="3000" width="${W}" height="200" fill="#152346"/>
  <rect x="0" y="3200" width="${W}" height="900" fill="#1A2B55"/>
  <rect x="0" y="4100" width="${W}" height="${Y_H - 4100}" fill="#21386A"/>
  <g id="stars">${stars(160, 0, 2600)}${sparkles(10, 0, 2600)}${stars(70, 2600, 4380, "", 1.2, 3)}${sparkles(5, 3000, 4200)}</g>
  <g id="sun">${rays}<circle cx="${SUN.x}" cy="${SUN.y}" r="${SUN.r}" fill="${C.sun}"/>
    <circle cx="${SUN.x - 40}" cy="${SUN.y - 45}" r="${SUN.r * 0.42}" fill="#FFD966"/>
    <circle cx="${SUN.x + 55}" cy="${SUN.y + 50}" r="${SUN.r * 0.16}" fill="#FFB52E"/></g>
  <g id="ghost-sun-pos">${ghost("ghost-sun", SUN.x, SUN.y, SUN.r)}</g>
`;

/* ---- Erde (Blick auf Europa und Afrika) ---- */
const E = EARTH;
// Kontinente aus echten Küstenpunkten (Länge, Breite), orthografisch projiziert
// mit Blick auf 20° N / 15° O: Europa oben, Afrika in der Mitte.
const LAT0 = (20 * Math.PI) / 180, LON0 = 15;
const proj = ([lon, lat]) => {
  const la = (lat * Math.PI) / 180, lo = ((lon - LON0) * Math.PI) / 180;
  return [Math.cos(la) * Math.sin(lo), -(Math.cos(LAT0) * Math.sin(la) - Math.sin(LAT0) * Math.cos(la) * Math.cos(lo))];
};
const P = (pts) => pts.map(proj);
const AFRICA = P([[-6, 36], [10, 37], [11, 33], [20, 31], [32, 31], [34, 28], [39, 20], [43, 12], [51, 12], [49, 6], [42, -1], [40, -10], [35, -20], [33, -26], [27, -33], [20, -35], [18, -32], [14, -22], [12, -17], [13, -6], [9, 1], [9, 4], [3, 6], [-4, 5], [-8, 4], [-13, 8], [-17, 14], [-17, 21], [-13, 27], [-10, 30]]);
const EUROPE = P([[-9, 37], [-9, 43], [-2, 43.5], [-1, 46], [-4, 48], [2, 51], [5, 53], [8, 54], [9, 57], [11, 56], [12, 54], [19, 54.5], [21, 57], [24, 59], [21, 61], [22, 65], [18, 63], [17, 60], [19, 59], [16, 56], [12, 56], [11, 59], [6, 58], [5, 61], [10, 64], [15, 68], [20, 70], [26, 71], [31, 70], [33, 66], [30, 61], [40, 60], [44, 52], [40, 46], [30, 46], [28, 42], [26, 40], [23, 37], [21, 39], [19, 42], [16, 43], [13, 45.5], [12, 44], [16, 41], [18, 40], [16, 38], [12, 42], [8, 44], [3, 43], [-1, 38]]);
const BRITAIN = P([[-5, 50], [1, 51], [0, 53], [-2, 56], [-3, 58.5], [-6, 57], [-5, 54], [-3, 53.5]]);
const IRELAND = P([[-6, 52], [-6, 54.5], [-8, 55], [-10, 53], [-9, 51.5]]);
const ARABIA = P([[35, 28], [39, 20], [43, 13], [45, 13], [52, 16], [59, 22], [56, 26], [51, 24], [48, 29], [39, 32]]);
const SAMERICA = P([[-35, -6], [-39, -13], [-41, -22], [-48, -27], [-53, -34], [-58, -38], [-62, -20], [-60, 0], [-52, 5], [-45, -1]]);
const MADAGASCAR = P([[49, -12], [50, -16], [47, -25], [44, -22], [44, -16]]);
const SAHARA = P([[-14, 26], [-5, 30], [10, 31], [25, 30], [32, 27], [33, 20], [22, 17], [8, 16], [-5, 17], [-14, 19]]);
const WOLF = [[80, 300], [60, 215], [76, 150], [98, 110], [92, 42], [132, 84], [156, 34], [172, 92], [206, 92], [256, 30], [282, 44], [238, 112], [208, 150], [196, 214], [214, 300]];
const GER = (([x, y]) => ({ dx: x, dy: y }))(proj([10, 51])); // Deutschland, relativ zum Erdmittelpunkt in Einheiten von r
const clouds = [[-0.55, -0.5, 0.16], [0.6, 0.2, 0.13], [-0.4, 0.45, 0.12], [0.55, -0.55, 0.1], [0.2, 0.72, 0.12]]
  .map(([dx, dy, s]) => {
    const x = E.x + dx * E.r, y = E.y + dy * E.r, w = s * E.r;
    return `<g opacity="0.85"><ellipse cx="${x}" cy="${y}" rx="${w}" ry="${w * 0.32}" fill="#fff"/><ellipse cx="${x + w * 0.3}" cy="${y - w * 0.18}" rx="${w * 0.55}" ry="${w * 0.3}" fill="#fff"/></g>`;
  })
  .join("");
const earth = `
  <defs><clipPath id="earth-clip"><circle cx="${E.x}" cy="${E.y}" r="${E.r}"/></clipPath></defs>
  <g id="orbit" opacity="0">
    <ellipse cx="${E.x}" cy="${E.y}" rx="470" ry="120" fill="none" stroke="${C.moon}" stroke-width="5" stroke-dasharray="16 14" opacity="0.6"/>
  </g>
  <line id="axis-ref" x1="${E.x}" y1="${E.y - E.r - 110}" x2="${E.x}" y2="${E.y + E.r + 110}" stroke="#fff" stroke-width="4" stroke-dasharray="14 12" opacity="0"/>
  <g id="earth">
    <g clip-path="url(#earth-clip)">
      <circle cx="${E.x}" cy="${E.y}" r="${E.r}" fill="${C.ocean}"/>
      <circle cx="${E.x + E.r * 0.25}" cy="${E.y + E.r * 0.2}" r="${E.r * 0.9}" fill="${C.oceanDeep}" opacity="0.35"/>
      <path d="${blob(SAMERICA, E.x, E.y, E.r)}" fill="${C.land}"/>
      <path d="${blob(AFRICA, E.x, E.y, E.r)}" fill="${C.land}"/>
      <path d="${blob(SAHARA, E.x, E.y, E.r)}" fill="${C.desert}"/>
      <path d="${blob(EUROPE, E.x, E.y, E.r)}" fill="${C.land}"/>
      <path d="${blob(ARABIA, E.x, E.y, E.r)}" fill="${C.desert}"/>
      <path d="${blob(MADAGASCAR, E.x, E.y, E.r)}" fill="${C.land}"/>
      <path d="${blob(BRITAIN, E.x, E.y, E.r)}" fill="${C.land}"/>
      <path d="${blob(IRELAND, E.x, E.y, E.r)}" fill="${C.land}"/>
      <ellipse cx="${E.x}" cy="${E.y - E.r - 2}" rx="150" ry="30" fill="${C.ice}"/>
      <ellipse cx="${E.x}" cy="${E.y + E.r - 6}" rx="210" ry="52" fill="${C.ice}"/>
      ${clouds}
      <rect id="season-n" x="${E.x - E.r}" y="${E.y - E.r}" width="${2 * E.r}" height="${E.r}" fill="${C.hot}" opacity="0"/>
      <path d="M ${E.x + E.r * 0.15} ${E.y - E.r} A ${E.r} ${E.r} 0 0 1 ${E.x + E.r * 0.15} ${E.y + E.r} L ${E.x + E.r} ${E.y + E.r} L ${E.x + E.r} ${E.y - E.r} Z" fill="#000" opacity="0.2"/>
    </g>
    <g id="pin" opacity="0">
      <path d="M ${E.x + GER.dx * E.r} ${E.y + GER.dy * E.r} c -26 -34 -40 -52 -40 -72 a 40 40 0 0 1 80 0 c 0 20 -14 38 -40 72 Z" fill="${C.accent}" stroke="${C.ink}" stroke-width="6"/>
      <circle cx="${E.x + GER.dx * E.r}" cy="${E.y + GER.dy * E.r - 72}" r="14" fill="${C.ink}"/>
    </g>
    <line id="axis" x1="${E.x}" y1="${E.y - E.r - 110}" x2="${E.x}" y2="${E.y + E.r + 110}" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity="0"/>
  </g>
  <path id="axis-arc" d="" fill="none" stroke="${C.accent}" stroke-width="7" stroke-linecap="round" opacity="0"/>
  <g id="ghost-orbit-pos" opacity="0">${ghost("ghost-orbit", E.x - 470, E.y, 44)}</g>
  <g id="moon2a" opacity="0">${moonArt("m2a", E.x - 470, E.y, 52)}</g>
  <g id="moon2b" opacity="0">${moonArt("m2b", E.x + 470, E.y, 40)}</g>
`;

/* ---- Küste: dein Haus auf der Klippe, dein Strand ---- */
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
// Haus auf der Klippe rechts am Horizont (Fenster gehen an, wenn es dunkel wird).
const house = `
  <path d="M 700 ${Y_H} C 740 ${Y_H - 70} 800 ${Y_H - 120} 880 ${Y_H - 110} C 960 ${Y_H - 140} 1040 ${Y_H - 110} 1080 ${Y_H - 95} L 1080 ${Y_H + 30} L 700 ${Y_H + 30} Z" fill="#101B36"/>
  <g transform="translate(820 ${Y_H - 210})">
    <rect x="0" y="40" width="130" height="80" fill="#1B2540"/>
    <path d="M -14 44 L 65 -14 L 144 44 Z" fill="#141C33"/>
    <rect x="96" y="-6" width="16" height="30" fill="#141C33"/>
    <rect class="win" x="18" y="62" width="30" height="30" fill="#FFD772" opacity="0"/>
    <rect class="win" x="80" y="62" width="30" height="30" fill="#FFD772" opacity="0"/>
  </g>`;
// Dein Strandurlaub: Handtuch, Sonnenschirm, Sandburg.
const beach = `
  <path d="M 0 4720 C 160 4730 330 4800 470 4930 C 540 5000 600 5090 640 ${Y_WL} L 0 ${Y_WL} Z" fill="${C.sand}"/>
  <path d="M 0 4860 C 150 4880 300 4960 400 ${Y_WL} L 0 ${Y_WL} Z" fill="${C.sandDark}" opacity="0.5"/>
  <g transform="translate(150 4800) rotate(-6)">
    <rect x="0" y="0" width="190" height="80" rx="8" fill="#E8505B"/>
    <rect x="0" y="22" width="190" height="14" fill="#fff"/><rect x="0" y="50" width="190" height="14" fill="#fff"/>
  </g>
  <g transform="translate(110 4640)">
    <line x1="80" y1="40" x2="96" y2="200" stroke="#5A4632" stroke-width="9" stroke-linecap="round"/>
    <path d="M -20 60 Q 70 -40 180 30 Q 150 40 125 52 Q 100 35 75 52 Q 50 40 25 58 Q 0 48 -20 60 Z" fill="${C.accent}" stroke="${C.ink}" stroke-width="5"/>
  </g>
  <g id="castle" transform="translate(345 4862) scale(0.85)">
    <rect x="-55" y="-30" width="110" height="60" fill="#C9A564"/>
    <rect x="-70" y="-62" width="40" height="92" fill="#C9A564"/><rect x="30" y="-62" width="40" height="92" fill="#C9A564"/>
    <rect x="-22" y="-92" width="44" height="62" fill="#C9A564"/>
    <path d="M -70 -62 h 10 v -10 h 10 v 10 h 10 v -10 h 10 v 10" fill="none" stroke="#C9A564" stroke-width="10"/>
    <path d="M 0 -92 v -40" stroke="#5A4632" stroke-width="5"/><path d="M 0 -132 l 34 10 l -34 10 Z" fill="#E8505B"/>
    <rect x="-12" y="0" width="24" height="30" rx="12" fill="#8E7348"/>
  </g>`;
const coast = `
  <rect x="0" y="${Y_H}" width="${W}" height="${Y_WL - Y_H}" fill="${C.seaFar}"/>
  ${house}
  <path d="M 0 4170 C 120 4160 260 4230 360 4330 C 420 4390 470 4430 520 ${Y_H + 20} L 0 ${Y_H + 20} Z" fill="#0E1830"/>
  <g id="waves">${waveStripes}</g>
  <g id="refl">${reflection}</g>
  ${beach}
  <g id="tide"><rect id="tide-water" x="0" y="${TIDE.mid}" width="${W}" height="${Y_WL - TIDE.mid + 4}" fill="${C.sea}" opacity="0.94"/>
    <rect id="tide-edge" x="0" y="${TIDE.mid - 3}" width="${W}" height="7" fill="${C.foam}"/></g>
  <g id="post"><rect x="626" y="4600" width="28" height="${Y_WL - 4600}" fill="#6B4F35"/><rect x="620" y="4588" width="40" height="18" rx="4" fill="#4E3824"/>${ticks}</g>
  <g id="br-old" opacity="0">
    <path d="M 585 ${TIDE.mid - TIDE.big} h -22 v ${2 * TIDE.big} h 22" fill="none" stroke="#fff" stroke-width="7" stroke-dasharray="14 10"/>
    <text x="548" y="${TIDE.mid - TIDE.big + 12}" text-anchor="end" class="lab">MIT MOND</text>
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
    <path d="M 0 0 C -6 -60 -50 -90 -70 -150 M 0 0 C 10 -50 60 -80 70 -160" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.22" transform="translate(-5 -4)"/>
  </g>`;
const fanCoral = (x, y, s, col) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M -110 0 C -120 -120 -60 -190 0 -190 C 60 -190 120 -120 110 0 Z" fill="${col}"/>
    <path d="M 0 0 L 0 -170 M 0 -60 L -70 -130 M 0 -60 L 70 -130 M 0 -110 L -40 -165 M 0 -110 L 40 -165" stroke="#00000033" stroke-width="10" stroke-linecap="round"/>
  </g>`;
const brain = (x, y, s, col) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M -80 0 C -90 -70 -30 -100 0 -100 C 40 -100 90 -70 80 0 Z" fill="${col}"/>
    <path d="M -60 -20 q 15 -30 30 0 t 30 0 t 30 0 M -50 -55 q 15 -25 30 0 t 30 0 t 30 0" fill="none" stroke="#00000030" stroke-width="7" stroke-linecap="round"/>
  </g>`;
const weed = (x, y, h, col) =>
  `<path class="weed" d="M ${x} ${y} C ${x - 30} ${y - h * 0.3} ${x + 30} ${y - h * 0.6} ${x} ${y - h}" fill="none" stroke="${col}" stroke-width="14" stroke-linecap="round"/>`;
const eggs = Array.from({ length: 34 }, () => {
  const x = 150 + rnd() * 780;
  const y = 6480 + rnd() * 260;
  return `<circle class="egg" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(7 + rnd() * 6).toFixed(1)}" fill="#FFC2D6" opacity="0"/>`;
}).join("");
const fish = (id, x, y, s, col, stripe) => `
  <g id="${id}"><g transform="translate(${x} ${y}) scale(${s})">
    <path d="M 0 0 C 30 -34 90 -34 120 0 C 90 34 30 34 0 0 Z" fill="${col}"/>
    <path d="M 52 -24 C 44 -8 44 8 52 24 M 74 -26 C 66 -8 66 8 74 26" fill="none" stroke="${stripe}" stroke-width="8"/>
    <path d="M 0 0 L -40 -30 L -34 0 L -40 30 Z" fill="${col}"/>
    <circle cx="96" cy="-6" r="7" fill="${C.ink}"/>
  </g></g>`;
const shafts = [140, 420, 760]
  .map((x, i) => `<path d="M ${x} ${Y_WL} L ${x + 120} ${Y_WL} L ${x + 260 + i * 30} ${Y_WL + 1500} L ${x + 60} ${Y_WL + 1500} Z" fill="#9FD6EE" opacity="0.07"/>`)
  .join("");
const underwater = `
  <rect x="0" y="${Y_WL}" width="${W}" height="450" fill="#1C6A8C"/>
  <rect x="0" y="${Y_WL + 450}" width="${W}" height="600" fill="#165C7C"/>
  <rect x="0" y="${Y_WL + 1050}" width="${W}" height="600" fill="#114B68"/>
  <rect x="0" y="${Y_WL + 1650}" width="${W}" height="${WORLD_H - Y_WL - 1650}" fill="#0D3D57"/>
  ${shafts}
  <path d="M 0 ${Y_WL} q 45 -18 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 t 90 0 L 1080 ${Y_WL + 14} L 0 ${Y_WL + 14} Z" fill="${C.foam}"/>
  <path d="M 0 6930 C 200 6880 420 6920 600 6900 C 800 6880 960 6910 1080 6890 L 1080 ${WORLD_H} L 0 ${WORLD_H} Z" fill="#8E7A55"/>
  <ellipse cx="900" cy="6915" rx="120" ry="50" fill="#5E5A57"/><ellipse cx="60" cy="6925" rx="90" ry="40" fill="#55524F"/>
  ${fish("fish1", -200, 5800, 0.9, "#FFB347", "#fff")}${fish("fish2", 1150, 6080, 0.7, "#7FD1C7", "#2E8B84")}${fish("fish3", -300, 6300, 0.55, "#FFE066", "#E8505B")}
  <g id="weeds">${weed(40, 6930, 260, "#2E8B57")}${weed(980, 6915, 300, "#2E8B57")}${weed(1030, 6925, 200, "#3FA36A")}${weed(330, 6930, 180, "#3FA36A")}</g>
  ${coral(250, 6940, 1.5, "#FF7A7A")}${fanCoral(560, 6950, 1.35, "#FF9F43")}${coral(840, 6950, 1.35, "#E86A9A")}
  ${brain(400, 6965, 0.9, "#F2A65A")}${coral(700, 6975, 0.85, "#FF7A7A")}${fanCoral(130, 6970, 0.8, "#E86A9A")}${brain(960, 6960, 0.7, "#FFB0A0")}
  <g id="eggs">${eggs}</g>
  <g id="cal" opacity="0">
    <g id="cal-in">
      <rect x="388" y="5842" width="320" height="300" rx="22" fill="#00000040"/>
      <rect x="380" y="5830" width="320" height="300" rx="22" fill="#F7F3EA"/>
      <rect x="380" y="5830" width="320" height="78" rx="22" fill="#E8505B"/>
      <rect x="380" y="5880" width="320" height="28" fill="#E8505B"/>
      <circle cx="440" cy="5830" r="10" fill="#7A2730"/><circle cx="640" cy="5830" r="10" fill="#7A2730"/>
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
  <g id="stars2">${stars(120, 3150, 4400, "s2", 1.2, 3.4)}${sparkles(8, 3150, 4300, "s2")}</g>
  <g id="moon-pos">${moonArt("moon", MOON.x, MOON.y, MOON.r)}</g>
  <g id="cracks" opacity="0" stroke="${C.ink}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M ${MOON.x - 20} ${MOON.y - 160} l 30 70 l -40 40 l 50 50 l -20 60"/>
    <path d="M ${MOON.x + 140} ${MOON.y - 40} l -70 30 l -30 -40 l -60 40"/>
    <path d="M ${MOON.x - 150} ${MOON.y + 50} l 70 -10 l 30 50"/>
  </g>
  ${ghost("moon-ghost", MOON.x, MOON.y, MOON.r, 'opacity="0"')}
</svg>
</div></div></div>
<div id="savanna" class="ov" style="top:0;bottom:0">
  <svg width="1080" height="1920" viewBox="0 0 1080 1920"><g id="sv-pan">
    <rect x="-60" y="0" width="1200" height="1920" fill="#070B18"/>
    <rect x="-60" y="760" width="1200" height="420" fill="#0B1226"/>
    ${stars(70, 120, 1000)}
    ${ghost("sv-ghost", 560, 470, 120, 'opacity="0.7"')}
    <path d="M -60 1120 C 200 1090 420 1110 640 1095 C 860 1080 1000 1100 1140 1090 L 1140 1920 L -60 1920 Z" fill="#0F0D08"/>
    <path d="M 860 1100 C 862 1000 850 930 820 880 M 862 1000 C 900 950 940 930 990 920 M 850 960 C 810 940 770 935 730 930" stroke="#05070D" stroke-width="18" fill="none" stroke-linecap="round"/>
    <path d="M 640 905 C 700 850 820 830 920 845 C 1000 830 1080 860 1100 905 C 980 930 760 935 640 905 Z" fill="#05070D"/>
    <path d="M 620 925 C 680 880 760 875 800 885 C 760 905 700 920 620 925 Z" fill="#05070D"/>
    <path d="M 0 1180 q -6 -40 -10 -50" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 22 1180 q 0 -40 -5 -87" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 44 1180 q 6 -40 0 -79" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 66 1180 q -6 -40 5 -71" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 88 1180 q 0 -40 10 -63" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 110 1180 q 6 -40 -10 -55" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 132 1180 q -6 -40 -5 -92" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 154 1180 q 0 -40 0 -84" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 176 1180 q 6 -40 5 -76" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 198 1180 q -6 -40 10 -68" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 220 1180 q 0 -40 -10 -60" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 242 1180 q 6 -40 -5 -52" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 264 1180 q -6 -40 0 -89" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 286 1180 q 0 -40 5 -81" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 308 1180 q 6 -40 10 -73" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 330 1180 q -6 -40 -10 -65" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 352 1180 q 0 -40 -5 -57" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 374 1180 q 6 -40 0 -94" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 396 1180 q -6 -40 5 -86" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 418 1180 q 0 -40 10 -78" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 440 1180 q 6 -40 -10 -70" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 462 1180 q -6 -40 -5 -62" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 484 1180 q 0 -40 0 -54" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 506 1180 q 6 -40 5 -91" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 528 1180 q -6 -40 10 -83" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 550 1180 q 0 -40 -10 -75" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 572 1180 q 6 -40 -5 -67" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 594 1180 q -6 -40 0 -59" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 616 1180 q 0 -40 5 -51" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 638 1180 q 6 -40 10 -88" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 660 1180 q -6 -40 -10 -80" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 682 1180 q 0 -40 -5 -72" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 704 1180 q 6 -40 0 -64" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 726 1180 q -6 -40 5 -56" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 748 1180 q 0 -40 10 -93" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 770 1180 q 6 -40 -10 -85" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 792 1180 q -6 -40 -5 -77" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 814 1180 q 0 -40 0 -69" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 836 1180 q 6 -40 5 -61" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 858 1180 q -6 -40 10 -53" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 880 1180 q 0 -40 -10 -90" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 902 1180 q 6 -40 -5 -82" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 924 1180 q -6 -40 0 -74" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 946 1180 q 0 -40 5 -66" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 968 1180 q 6 -40 10 -58" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 990 1180 q -6 -40 -10 -50" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 1012 1180 q 0 -40 -5 -87" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 1034 1180 q 6 -40 0 -79" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 1056 1180 q -6 -40 5 -71" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 1078 1180 q 0 -40 10 -63" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 1100 1180 q 6 -40 -10 -55" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 1122 1180 q -6 -40 -5 -92" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 1144 1180 q 0 -40 0 -84" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M 1166 1180 q 6 -40 5 -76" stroke="#05070D" stroke-width="7" fill="none" stroke-linecap="round"/>
    <rect x="-60" y="1250" width="1200" height="700" fill="#16130A"/>
    <path d="M -60 1250 C 240 1230 600 1270 1140 1240 L 1140 1300 L -60 1300 Z" fill="#16130A"/>
    <path d="M 10 1330 q -8 -50 -14 -70" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 44 1390 q 0 -50 -7 -111" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 78 1450 q 8 -50 0 -92" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 112 1510 q -8 -50 7 -73" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 146 1330 q 0 -50 14 -114" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 180 1390 q 8 -50 -14 -95" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 214 1450 q -8 -50 -7 -76" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 248 1510 q 0 -50 0 -117" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 282 1330 q 8 -50 7 -98" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 316 1390 q -8 -50 14 -79" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 350 1450 q 0 -50 -14 -120" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 384 1510 q 8 -50 -7 -101" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 418 1330 q -8 -50 0 -82" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 452 1390 q 0 -50 7 -123" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 486 1450 q 8 -50 14 -104" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 520 1510 q -8 -50 -14 -85" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 554 1330 q 0 -50 -7 -126" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 588 1390 q 8 -50 0 -107" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 622 1450 q -8 -50 7 -88" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 656 1510 q 0 -50 14 -129" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 690 1330 q 8 -50 -14 -110" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 724 1390 q -8 -50 -7 -91" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 758 1450 q 0 -50 0 -72" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 792 1510 q 8 -50 7 -113" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 826 1330 q -8 -50 14 -94" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 860 1390 q 0 -50 -14 -75" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 894 1450 q 8 -50 -7 -116" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 928 1510 q -8 -50 0 -97" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 962 1330 q 0 -50 7 -78" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 996 1390 q 8 -50 14 -119" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 1030 1450 q -8 -50 -14 -100" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 1064 1510 q 0 -50 -7 -81" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 1098 1330 q 8 -50 0 -122" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 1132 1390 q -8 -50 7 -103" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/><path d="M 1166 1450 q 0 -50 14 -84" stroke="#2C2614" stroke-width="9" fill="none" stroke-linecap="round"/>
    <g class="eye"><ellipse cx="700" cy="1430" rx="44" ry="22" fill="#FFD23F"/><ellipse cx="800" cy="1430" rx="44" ry="22" fill="#FFD23F"/><rect x="694" y="1412" width="11" height="36" fill="#0A1020"/><rect x="794" y="1412" width="11" height="36" fill="#0A1020"/></g>
    <g class="eye"><ellipse cx="226" cy="1090" rx="24" ry="13" fill="#FFD23F"/><ellipse cx="272" cy="1090" rx="24" ry="13" fill="#FFD23F"/><rect x="223" y="1081" width="6" height="20" fill="#0A1020"/><rect x="269" y="1081" width="6" height="20" fill="#0A1020"/></g>
    <g class="eye"><ellipse cx="470" cy="1130" rx="20" ry="11" fill="#FFD23F"/><ellipse cx="508" cy="1130" rx="20" ry="11" fill="#FFD23F"/><rect x="467" y="1122" width="5" height="17" fill="#0A1020"/><rect x="505" y="1122" width="5" height="17" fill="#0A1020"/></g>
    <g class="eye"><ellipse cx="90" cy="1150" rx="17" ry="9" fill="#FFD23F"/><ellipse cx="122" cy="1150" rx="17" ry="9" fill="#FFD23F"/><rect x="88" y="1143" width="4" height="15" fill="#0A1020"/><rect x="120" y="1143" width="4" height="15" fill="#0A1020"/></g>
  </g></svg>
</div>
<div id="grain"></div>
<div id="flash"></div>
<div id="hook" class="ov">
  <div class="hk hk-s">HEUTE NACHT</div>
  <div class="hk">VERSCHWINDET</div>
  <div class="hk hk-y">DER MOND</div>
</div>
<div id="first" class="ov"><div class="stk">DAS PASSIERT ALS ERSTES ↓</div></div>
<div id="ostern" class="ov">
  <svg width="420" height="330" viewBox="0 0 420 330">
    <rect x="58" y="22" width="300" height="290" rx="22" fill="#00000055"/>
    <rect x="50" y="10" width="300" height="290" rx="22" fill="#F7F3EA"/>
    <rect x="50" y="10" width="300" height="80" rx="22" fill="#E8505B"/><rect x="50" y="60" width="300" height="30" fill="#E8505B"/>
    <text x="200" y="68" text-anchor="middle" class="cal-t">OSTERN</text>
    <g id="os-moon"><circle cx="200" cy="195" r="62" fill="#F3EBCF" stroke="#CDBD8E" stroke-width="6"/><circle cx="180" cy="180" r="12" fill="#CDBD8E"/><circle cx="222" cy="212" r="9" fill="#CDBD8E"/></g>
    <text id="os-q" x="200" y="235" text-anchor="middle" class="os-q">??</text>
    <g id="egg"><ellipse cx="360" cy="250" rx="52" ry="68" fill="#7FD1C7" stroke="#0A1020" stroke-width="6"/>
      <path d="M 312 236 l 16 -14 l 16 14 l 16 -14 l 16 14 l 16 -14 l 14 12" fill="none" stroke="#FFD23F" stroke-width="9" stroke-linejoin="round"/>
      <path d="M 314 270 h 92" stroke="#E8505B" stroke-width="9"/></g>
  </svg>
</div>
<div id="third" class="ov"><div class="big-y">≈ ⅓</div></div>
<div id="tagA" class="ov tag400"><span>Ø</span> ×400</div>
<div id="tagB" class="ov tag400 tagB"><span>⟷</span> ×400</div>
<div id="stamp" class="ov"><div class="stp">NIE WIEDER</div></div>
<div id="deg" class="ov"><div class="deg-n" id="deg-n">23,4°</div><div class="sub">Neigung der Erdachse</div></div>
<div id="years" class="ov"><div class="yr" id="yr">+1 MIO. JAHRE</div></div>
<div id="hot" class="ov"><div class="card card-hot">SOMMER <span>=</span> WÜSTE</div></div>
<div id="cold" class="ov"><div class="card card-cold">WINTER <span>=</span> ARKTIS</div></div>
<div id="wolf" class="ov">
  <svg width="440" height="420" viewBox="0 0 300 300">
    <g id="wolf-head">
      <path d="${blob(WOLF, 0, 0, 1)}" fill="#8F99AD" stroke="#0A1020" stroke-width="7" stroke-linejoin="round"/>
      <path d="${blob([[118, 300], [112, 230], [140, 170], [178, 150], [196, 210], [206, 300]], 0, 0, 1)}" fill="#C9D0DC"/>
      <path d="M 104 70 L 112 96 L 126 84 Z M 150 58 L 152 92 L 164 88 Z" fill="#E8A0A8"/>
      <path d="M 176 108 q 14 12 28 2" fill="none" stroke="#0A1020" stroke-width="7" stroke-linecap="round"/>
      <path d="M 172 96 l 30 -10" stroke="#0A1020" stroke-width="6" stroke-linecap="round"/>
      <ellipse cx="194" cy="132" rx="6" ry="11" fill="#7FC8F0"/>
      <ellipse cx="265" cy="50" rx="10" ry="14" fill="#0A1020" transform="rotate(40 265 50)"/>
      <circle cx="272" cy="36" r="9" fill="#0A1020"/>
    </g>
  </svg>
  <div id="jobless" class="stp stp-red">ARBEITSLOS</div>
</div>
<div id="cta" class="ov">
  <div class="ct">WAS WÜRDEST DU AM MEISTEN</div>
  <div class="ct ct-y">VERMISSEN?</div>
  <div id="ct3">Schreib's in die Kommentare ↓</div>
</div>
<div id="teaser" class="ov">
  <div class="tz-k">TEIL 2</div>
  <div class="ct ct-y">ZWEI MONDE?</div>
  <div id="tz3">Folgen, damit du es nicht verpasst</div>
</div>`;

const worldCss = `
  #root { background: ${C.space}; }
  #ostern { top: 360px; }
  #tagA, #tagB { top: 1000px; left: 110px; right: auto; width: max-content; text-align: center; font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 76px; color: ${C.ink}; background: ${C.accent}; padding: 6px 26px; border-radius: 18px; border: 6px solid ${C.ink}; }
  #tagA span, #tagB span { opacity: 0.7; }
  #tagB { left: auto; right: 110px; }
  .os-q { font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 120px; fill: #E8505B; }
  .ratio { top: 975px; } .ratio2 { top: 1075px; }
  .rt { font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 62px; color: #fff; -webkit-text-stroke: 14px ${C.ink}; paint-order: stroke fill; }
  .rt b { color: ${C.accent}; }
  #wolf { top: 340px; }
  #wolf svg { display: block; margin: 0 auto; }
  #jobless { position: absolute; left: 0; right: 0; margin: 0 auto; width: max-content; top: 370px; }
  #jobless.stp-red { color: #fff; background: #E8505B; border-color: #fff; font-size: 84px; }
  #shake, #zoom { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
  #cam { position: absolute; left: 0; top: 0; width: ${W}px; height: ${WORLD_H}px; }
  #world { position: absolute; left: 0; top: 0; width: ${W}px; height: ${WORLD_H}px; }
  #grain { position: absolute; inset: 0; background-image: url("assets/grain.png"); background-size: ${W}px ${H}px;
    mix-blend-mode: overlay; opacity: 0.22; pointer-events: none; }
  #flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
  .ov { position: absolute; left: 0; right: 0; text-align: center; opacity: 0; }
  .lab { font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 40px; fill: #fff;
    stroke: ${C.ink}; stroke-width: 10px; paint-order: stroke fill; }
  .lab-y { fill: ${C.accent}; }
  .cal-t { font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 40px; fill: #fff; letter-spacing: 2px; }
  .hk, .ct, .big-y, .deg-n, .yr, .stp, .q, .sub, .tz-k { font-family: "Montserrat", sans-serif; font-weight: 900; color: #fff;
    -webkit-text-stroke: 16px ${C.ink}; paint-order: stroke fill; line-height: 1.04; }
  #hook { top: 368px; opacity: 1; }
  .hk { font-size: 104px; }
  .hk-s { font-size: 64px; }
  .hk-y { color: ${C.accent}; font-size: 132px; }
  #first, #forever { top: 400px; }
  .stk { display: inline-block; padding: 22px 36px; border-radius: 26px; background: #fff; color: ${C.ink};
    font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 54px; border: 7px solid ${C.ink}; }
  .stk-d { background: ${C.ink}; color: #fff; border-color: #fff; }
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
  #hot, #cold { top: 390px; }
  .card { display: inline-block; padding: 20px 40px; border-radius: 24px; font-family: "Montserrat", sans-serif;
    font-weight: 900; font-size: 74px; border: 8px solid ${C.ink}; }
  .card span { opacity: 0.6; }
  .card-hot { background: ${C.hot}; color: #fff; }
  .card-cold { background: ${C.ice}; color: ${C.ink}; }
  #cta, #teaser { top: 372px; }
  .ct { font-size: 64px; }
  .ct-y { color: ${C.accent}; font-size: 112px; }
  .tz-k { display: inline-block; font-size: 56px; color: ${C.ink}; background: ${C.accent}; -webkit-text-stroke: 0;
    padding: 8px 26px; border-radius: 14px; margin-bottom: 14px; }
  #ct3, #tz3 { display: inline-block; margin-top: 22px; padding: 16px 34px; border-radius: 40px; background: ${C.ink};
    color: #fff; font-family: "Montserrat", sans-serif; font-weight: 800; font-size: 44px; border: 4px solid #fff; }
`;

/* ---- Beats ---- */
const T = {
  crack: at("n1", "verschwindet") - 0.05,
  vanish: f(at("n1", "verschwindet") + 0.3),
  first: at("n1", "Das") - 0.05,
  hookOut: at("n1", "Das") - 0.15,
  ostern: L.n2.s - 0.05,
  witz: at("n2", "Kein"),
  vollmond: at("n2", "Frühlings") + 0.3,
  osternOut: f(L.n3.s + 0.1),
  dark: L.n3.s,
  starsIn: at("n3", "pechschwarz") + 0.2,
  lions: at("n3", "Löwen") - 0.1,
  savanna: at("n3", "genau") - 0.25,
  rise: f(L.n5.s - 0.55),
  ghostSun: at("n5", "Riesenzufall") - 0.6,
  bigger: at("n5", "größer") - 0.1,
  farther: at("n5", "weiter") - 0.1,
  stamp: at("n5", "nie") - 0.05,
  toEarth: f(L.n6.s - 0.35),
  orbitOut: at("n6", "Ohne"),
  axis: at("n6", "Erdachse") - 0.1,
  years: at("n6", "Millionen") - 0.1,
  tip: at("n6", "kippen") - 0.2,
  pin: at("n7", "Deutschland") - 0.1,
  hot: at("n7", "Sommer") - 0.05,
  cold: at("n7", "Winter") - 0.05,
  wolf: f(L.n8.s - 0.75),
  jobless: at("n8", "arbeitslos") - 0.05,
  cta: f(L.n9.s - 0.15),
  ctaSub: f(L.n9.s - 0.05),
  teaser: f(L.n10.s + 0.1),
  twoMoons: at("n10", "zwei") - 0.05,
};
T.deg = T.axis + 0.3;
const TILT_MAX = 64;
const WOB = [
  [T.years, 23.4],
  [T.tip, 38],
  [T.tip + 0.4, 14],
  [T.tip + 0.95, TILT_MAX],
  [T.wolf - 0.3, TILT_MAX],
  [T.wolf + 0.6, 23.4],
];
const ang = (TILT_MAX * Math.PI) / 180;
const pinX = EARTH.x + GER.dx * EARTH.r * Math.cos(ang) - GER.dy * EARTH.r * Math.sin(ang);
const pinY = EARTH.y + GER.dx * EARTH.r * Math.sin(ang) + GER.dy * EARTH.r * Math.cos(ang);
const GER_CAM = { x: f((540 - pinX) * 0.5), y: f(-(pinY - 900)) };

const worldJs = `
    const E = ${JSON.stringify(EARTH)};
    gsap.set("#zoom", { transformOrigin: "540px 960px", scale: 1.12 });
    gsap.set("#cam", { y: ${-CY.hook} });
    gsap.set("#moon", { svgOrigin: "${MOON.x} ${MOON.y}" });
    gsap.set("#cracks", { svgOrigin: "${MOON.x} ${MOON.y}" });
    gsap.set("#earth", { svgOrigin: "${E.x} ${E.y}", rotation: 23.4 });
    gsap.set(".ov", { transformOrigin: "50% 50%" });

    // HOOK: Titel ab Frame 0, Kamera-Punch, der Mond bekommt Risse und implodiert.
    tl.to("#zoom", { scale: 1, duration: 0.7, ease: "back.out(1.4)" }, 0);
    tl.to("#cracks", { opacity: 1, duration: 0.08 }, ${T.crack});
    tl.to(["#moon", "#cracks"], { scale: 1.1, duration: 0.3, ease: "power2.out" }, ${T.crack});
    tl.to(["#moon", "#cracks"], { scale: 0, rotation: 50, duration: 0.3, ease: "back.in(2.2)" }, ${T.vanish});
    tl.fromTo("#flash", { opacity: 0 }, { opacity: 0.45, duration: 0.05 }, ${T.vanish} + 0.28);
    tl.to("#flash", { opacity: 0, duration: 0.3 }, ${T.vanish} + 0.33);
    tl.to("#shake", { x: 9, y: -7, duration: 0.05 }, ${T.vanish} + 0.3);
    tl.to("#shake", { x: -6, y: 5, duration: 0.05 }, ${T.vanish} + 0.35);
    tl.to("#shake", { x: 0, y: 0, duration: 0.08 }, ${T.vanish} + 0.4);
    tl.to("#moon-ghost", { opacity: 0.8, duration: 0.4, ease: "power1.out" }, ${T.vanish} + 0.3);
    tl.to(".refl", { scaleX: 0, opacity: 0, transformOrigin: "50% 50%", duration: 0.25, stagger: 0.04, ease: "power2.in" }, ${T.vanish} + 0.2);
    tl.to("#hook", { opacity: 0, y: -30, duration: 0.22, ease: "power2.in" }, ${T.hookOut});
    tl.fromTo("#first", { opacity: 0, scale: 0.5, rotation: -10 }, { opacity: 1, scale: 1, rotation: -3, duration: 0.3, ease: "back.out(2.2)" }, ${T.first});
    tl.to("#first", { opacity: 0, scale: 0.8, duration: 0.18, ease: "power2.in" }, ${T.ostern} - 0.2);

    tl.fromTo(".wave", { x: 0 }, { x: -90, duration: 2.4, ease: "none", repeat: ${Math.ceil(T.rise / 2.4)}, stagger: 0.3 }, 0);

    // OSTERN: Kalender fliegt rein, wackelt bei "Kein Witz", der Vollmond darin verschwindet.
    tl.fromTo("#ostern", { opacity: 0, scale: 0.4, rotation: -14 }, { opacity: 1, scale: 1, rotation: -4, duration: 0.35, ease: "back.out(2)" }, ${T.ostern});
    tl.fromTo("#egg", { rotation: -18 }, { rotation: 12, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 5, transformOrigin: "50% 90%" }, ${T.ostern});
    tl.to("#ostern", { rotation: 4, duration: 0.07 }, ${T.witz});
    tl.to("#ostern", { rotation: -6, duration: 0.07 }, ${T.witz} + 0.07);
    tl.to("#ostern", { rotation: -4, duration: 0.07 }, ${T.witz} + 0.14);
    tl.to("#os-moon", { scale: 0, duration: 0.25, ease: "back.in(2)", transformOrigin: "50% 50%" }, ${T.vollmond});
    tl.fromTo("#os-q", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2.6)", transformOrigin: "50% 50%" }, ${T.vollmond} + 0.2);
    tl.to("#ostern", { opacity: 0, scale: 0.85, duration: 0.2 }, ${T.osternOut});

    // PECHSCHWARZ: Nacht kippt ins Dunkle, Fenster gehen an, Sterne, dann Löwenaugen.
    gsap.set(".s2", { opacity: 0 });
    tl.to("#dark", { opacity: 0.7, duration: 1.1, ease: "power2.inOut" }, ${T.dark});
    tl.to(".win", { opacity: 1, duration: 0.08, stagger: 0.3 }, ${T.dark} + 0.6);
    tl.to(".s2", { opacity: 0.9, duration: 0.2, stagger: 0.008, ease: "power1.out" }, ${T.starsIn});
    tl.to("#zoom", { scale: 1.08, duration: ${f(T.rise - T.dark - 0.02)}, ease: "power1.inOut" }, ${T.dark});
    tl.to("#zoom", { scale: 1, duration: 1.2, ease: "power3.inOut" }, ${T.rise});
    // Savanne: in genau solchen Nächten jagen Löwen. Wischt von rechts rein.
    tl.fromTo("#savanna", { opacity: 1, xPercent: 100 }, { xPercent: 0, duration: 0.45, ease: "power3.out" }, ${T.savanna});
    gsap.set(".eye", { scaleY: 0, transformOrigin: "50% 50%" });
    tl.to(".eye", { scaleY: 1, duration: 0.14, stagger: 0.15, ease: "power2.out" }, ${T.lions});
    tl.to(".eye", { scaleY: 0.1, duration: 0.06 }, ${T.lions} + 1.2);
    tl.to(".eye", { scaleY: 1, duration: 0.08 }, ${T.lions} + 1.28);
    tl.to("#sv-pan", { x: -40, duration: ${f(L.n3.e - T.savanna)}, ease: "none" }, ${T.savanna});
    tl.to("#savanna", { opacity: 0, duration: 0.35 }, ${T.rise} + 0.2);

    // SONNE: hoch ins All, der Geister-Mond deckt die Sonne exakt ab, 400 × 400.
    tl.to("#cam", { y: ${-CY.sun}, duration: 1.2, ease: "power3.inOut" }, ${T.rise});
    tl.to("#dark", { opacity: 0, duration: 0.6 }, ${T.rise});
    gsap.set("#ghost-sun-pos", { x: -760 });
    tl.to("#ghost-sun-pos", { x: 0, duration: 0.8, ease: "power3.out" }, ${T.ghostSun});
    tl.to("#ghost-sun-pos", { x: 800, duration: 0.5, ease: "power3.in" }, ${T.stamp} - 0.45);
    tl.fromTo("#tagA", { opacity: 0, scale: 0.4, rotation: -10 }, { opacity: 1, scale: 1, rotation: -4, duration: 0.3, ease: "back.out(2.4)" }, ${T.bigger});
    tl.fromTo("#tagB", { opacity: 0, scale: 0.4, rotation: 10 }, { opacity: 1, scale: 1, rotation: 4, duration: 0.3, ease: "back.out(2.4)" }, ${T.farther});
    tl.to(["#tagA", "#tagB"], { opacity: 0, duration: 0.15 }, ${T.stamp} - 0.15);
    tl.fromTo("#stamp", { opacity: 0, scale: 1.8, rotation: -14 }, { opacity: 1, scale: 1, rotation: -7, duration: 0.18, ease: "power4.in" }, ${T.stamp});
    tl.to("#shake", { x: 10, y: -8, duration: 0.05 }, ${T.stamp} + 0.18);
    tl.to("#shake", { x: -7, y: 6, duration: 0.05 }, ${T.stamp} + 0.23);
    tl.to("#shake", { x: 0, y: 0, duration: 0.08 }, ${T.stamp} + 0.28);
    tl.to("#stamp", { opacity: 0, duration: 0.2 }, ${T.toEarth} + 0.1);

    // ERDE: Mondbahn verschwindet, Achse 23,4°, Millionen Jahre, kippen.
    tl.to("#cam", { y: ${-CY.earth}, duration: 0.85, ease: "power2.inOut" }, ${T.toEarth});
    tl.set(["#orbit", "#ghost-orbit-pos"], { opacity: 1 }, ${T.toEarth});
    tl.to("#ghost-orbit-pos", { x: 470, y: 118, duration: 1.2, ease: "sine.inOut" }, ${T.toEarth});
    tl.to(["#orbit", "#ghost-orbit-pos"], { opacity: 0, duration: 0.35 }, ${T.orbitOut});
    tl.to(["#axis", "#axis-ref"], { opacity: 1, duration: 0.25 }, ${T.axis});
    const A = { a: 23.4 };
    const arcR = E.r + 70;
    const drawArc = () => {
      const r = (A.a * Math.PI) / 180;
      const x = E.x + Math.sin(r) * arcR, y = E.y - Math.cos(r) * arcR;
      document.querySelector("#axis-arc").setAttribute("d", "M " + E.x + " " + (E.y - arcR) + " A " + arcR + " " + arcR + " 0 0 1 " + x.toFixed(1) + " " + y.toFixed(1));
      document.querySelector("#deg-n").textContent = A.a.toFixed(1).replace(".", ",") + "°";
    };
    drawArc();
    tl.to("#axis-arc", { opacity: 1, duration: 0.25 }, ${T.deg});
    tl.fromTo("#deg", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2.2)" }, ${T.deg});
    const WOB = ${JSON.stringify(WOB)};
    for (let i = 1; i < WOB.length; i++) {
      const [t0, a0] = WOB[i - 1], [t1, a1] = WOB[i];
      if (a0 === a1) continue;
      tl.to(A, { a: a1, duration: t1 - t0, ease: "sine.inOut", onUpdate: drawArc }, t0);
      tl.to("#earth", { rotation: a1, duration: t1 - t0, ease: "sine.inOut" }, t0);
    }
    const Y = { v: 1 };
    tl.fromTo("#years", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.25 }, ${T.years});
    tl.to(Y, { v: 50, duration: ${f(T.pin - 0.3 - T.years)}, ease: "power2.in", onUpdate: () => {
      document.querySelector("#yr").textContent = "+" + Math.round(Y.v) + " MIO. JAHRE";
    } }, ${T.years});
    tl.to(["#years", "#deg", "#axis-arc"], { opacity: 0, duration: 0.2 }, ${T.pin} - 0.3);
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => `tl.to("#shake", { x: ${i % 2 ? -7 : 7}, y: ${i % 3 ? 5 : -6}, duration: 0.08 }, ${f(T.tip + i * 0.12)});`).join("\n    ")}
    tl.to("#shake", { x: 0, y: 0, duration: 0.12 }, ${f(T.tip + 0.84)});

    // DEUTSCHLAND: Pin, Sommer = Wüste, Winter = Arktis.
    tl.fromTo("#pin", { opacity: 0, y: -60 }, { opacity: 1, y: 0, duration: 0.35, ease: "bounce.out" }, ${T.pin});
    tl.to("#cam", { x: ${GER_CAM.x}, y: ${GER_CAM.y}, duration: 0.7, ease: "power2.inOut" }, ${T.pin});
    tl.to("#zoom", { scale: 1.08, duration: 0.7, ease: "power2.inOut" }, ${T.pin});
    tl.to("#season-n", { opacity: 0.72, duration: 0.3 }, ${T.hot});
    tl.fromTo("#hot", { opacity: 0, scale: 0.5, rotation: -8 }, { opacity: 1, scale: 1, rotation: -3, duration: 0.3, ease: "back.out(2.2)" }, ${T.hot});
    tl.to("#hot", { opacity: 0, duration: 0.15 }, ${T.cold} - 0.1);
    tl.to("#season-n", { attr: { fill: "${C.ice}" }, opacity: 0.85, duration: 0.3 }, ${T.cold});
    tl.fromTo("#cold", { opacity: 0, scale: 0.5, rotation: 8 }, { opacity: 1, scale: 1, rotation: 3, duration: 0.3, ease: "back.out(2.2)" }, ${T.cold});
    tl.to("#cold", { opacity: 0, duration: 0.2 }, ${T.wolf} - 0.2);
    tl.to("#season-n", { opacity: 0, duration: 0.4 }, ${T.wolf});
    tl.to("#pin", { opacity: 0, duration: 0.3 }, ${T.wolf});

    // WERWOLF: Kamera zurück, der Werwolf heult den leeren Himmel an, "ARBEITSLOS".
    tl.to("#cam", { x: 0, y: ${-CY.end}, duration: 0.7, ease: "power2.inOut" }, ${T.wolf} - 0.2);
    tl.to("#zoom", { scale: 1, duration: 0.7, ease: "power2.inOut" }, ${T.wolf} - 0.2);
    tl.fromTo("#wolf", { opacity: 0, y: 120 }, { opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.6)" }, ${T.wolf});
    tl.fromTo("#wolf-head", { rotation: 0 }, { rotation: -8, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 1, svgOrigin: "120 260" }, ${T.wolf} + 0.2);
    tl.to("#wolf-head", { rotation: 14, y: 16, duration: 0.35, ease: "power2.inOut", svgOrigin: "120 260" }, ${T.jobless});
    tl.fromTo("#jobless", { opacity: 0, scale: 1.8, rotation: -16 }, { opacity: 1, scale: 1, rotation: -9, duration: 0.18, ease: "power4.in" }, ${T.jobless});
    tl.to(["#wolf", "#jobless"], { opacity: 0, duration: 0.2 }, ${T.cta} - 0.15);

    // KOMMENTAR-FRAGE + TEASER
    tl.fromTo("#cta", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.2)" }, ${T.cta});
    tl.fromTo("#ct3", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 }, ${T.ctaSub});
    tl.to("#orbit", { opacity: 1, duration: 0.5 }, ${T.cta});
    tl.set("#ghost-orbit-pos", { x: 0, y: 0 }, ${T.cta});
    tl.to("#ghost-orbit-pos", { opacity: 1, duration: 0.5 }, ${T.cta});
    tl.to("#cta", { opacity: 0, scale: 0.9, duration: 0.2 }, ${T.teaser} - 0.2);
    tl.fromTo("#teaser", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.2)" }, ${T.teaser});
    tl.fromTo("#tz3", { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${f(L.n10.e)});
    gsap.set("#m2a", { svgOrigin: "${EARTH.x - 470} ${EARTH.y}" });
    gsap.set("#m2b", { svgOrigin: "${EARTH.x + 470} ${EARTH.y}" });
    tl.to("#ghost-orbit-pos", { opacity: 0, duration: 0.15 }, ${T.twoMoons});
    tl.set(["#moon2a", "#moon2b"], { opacity: 1 }, ${T.twoMoons});
    tl.fromTo("#m2a", { scale: 0 }, { scale: 1, duration: 0.4, ease: "back.out(2.6)", immediateRender: false }, ${T.twoMoons});
    tl.fromTo("#m2b", { scale: 0 }, { scale: 1, duration: 0.4, ease: "back.out(2.6)", immediateRender: false }, ${T.twoMoons} + 0.25);
    tl.fromTo("#moon2a", { x: 0, y: 0 }, { x: 110, y: 62, duration: ${f(DUR - T.twoMoons)}, ease: "sine.inOut", immediateRender: false }, ${T.twoMoons});
    tl.fromTo("#moon2b", { x: 0, y: 0 }, { x: -110, y: -62, duration: ${f(DUR - T.twoMoons)}, ease: "sine.inOut", immediateRender: false }, ${T.twoMoons});
    gsap.set(["#m2a", "#m2b"], { scale: 0 });
`;

/* ================= Untertitel ================= */
const norm = (w) => w.toLowerCase().replace(/[^\p{L}]/gu, "");
const emphOf = (l, w) => (l.emph || []).some((e) => norm(w) === norm(e));
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
  .cap .emph { color: ${C.accent}; font-size: 86px; }`;
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
  ["crack", "gen-crack", T.crack - 0.05, 0.45],
  ["vanish", "gen-vanish", T.vanish - 0.1, 0.6],
  ["pop1", "gen-pop", T.first - 0.05, 0.4],
  ["pop2", "gen-pop", T.ostern, 0.45],
  ["pop3", "gen-pop", T.vollmond + 0.2, 0.4],
  ["dark", "gen-dark", T.dark, 0.45],
  ["swoosh0", "gen-swoosh2", T.savanna - 0.05, 0.35],
  ["growl", "gen-growl", T.lions + 0.6, 0.4],
  ["rise", "gen-rise", T.rise, 0.5],
  ["stamp", "gen-stamp", T.stamp + 0.15, 0.6],
  ["pop5", "gen-pop", T.bigger - 0.05, 0.35],
  ["pop6", "gen-pop", T.farther - 0.05, 0.35],
  ["swoosh", "gen-swoosh2", T.toEarth, 0.35],
  ["tick", "gen-tick", T.years, 0.2],
  ["rumble", "gen-rumble", T.tip - 0.2, 0.5],
  ["pin", "gen-pop", T.pin + 0.1, 0.45],
  ["wind", "gen-wind", T.hot, 0.28],
  ["blizzard", "gen-blizzard", T.cold, 0.28],
  ["howl", "gen-howl", T.wolf + 0.05, 0.5],
  ["stamp2", "gen-stamp", T.jobless + 0.15, 0.55],
  ["pop7", "gen-pop", T.cta, 0.45],
  ["pop8", "gen-pop", T.twoMoons, 0.5],
  ["pop9", "gen-pop", T.twoMoons + 0.25, 0.45],
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
    <script src="assets/three.min.js"></script>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${C.space}; }
      #root { background: ${C.space}; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}">
      <div id="pov" data-composition-id="pov" data-composition-src="compositions/pov.html" data-start="0" data-duration="${DUR}" data-track-index="1" data-track-kind="graphics" data-width="${W}" data-height="${H}" style="z-index:1"></div>
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${DUR}" data-track-index="2" data-track-kind="captions" data-width="${W}" data-height="${H}" style="z-index:5"></div>
${sfx}
${vo}
      <audio id="bed" class="clip" src="assets/sfx/bed-long.mp3" data-start="0" data-duration="${DUR}" data-track-index="9" data-volume="0.09"></audio>
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
writeFileSync(here("./assets/beats.json"), JSON.stringify({ T, L, DUR, WOB, TILT_MAX }, null, 1));
console.log("Zeilen:", Object.entries(L).map(([k, v]) => `${k} ${v.s}–${v.e}`).join(", "));
console.log("Beats:", JSON.stringify(T));
console.log(`built: ${chunks.length} Untertitel, ${SFX.length} SFX, ${DUR}s`);
