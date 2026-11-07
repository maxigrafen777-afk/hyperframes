// Schluckauf (Erzähl-Format, harte Schnitte). Generates index.html + compositions/*.html from script.json.
// Run: node build.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import {
  toothFace,
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
// "reuse": dieselbe Aufnahme noch einmal (Cold Open zeigt den Höhepunkt vorweg).
for (const l of script.lines) if (l.reuse && VO[l.reuse]) VO[l.id] = VO[l.reuse];
const ORDER = script.order;
const GAP = {
  film: 0.12,
  innen: 0.25,
  front: 0.3,
  profil: 0.3,
  nase: 0.3,
  haut: 0.3,
  station: 0.4,
  teaser: 0,
  streit: 0.25,
  nachher: 0.08,
  op: 0.3,
  frage: 0.2,
  praxis: 0.3,
  patient: 0.3,
};
const PAD = {
  film: 3.6,
  innen: 0.5,
  front: 0.5,
  profil: 0.8,
  nase: 0.6,
  haut: 0.6,
  station: 3.0,
  teaser: 0.5,
  streit: 0.35,
  nachher: 0.4,
  op: 0.4,
  frage: 0.35,
  praxis: 1.0,
  patient: 2.7,
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
    // Dicht hintereinander: jede Zeile startet direkt nach der vorigen (plus
    // GAP); nur "wait" in script.json lässt Platz für eine Aktion.
    if (prevEnd > 0) l.start = +(prevEnd + (l.wait ?? GAP[id])).toFixed(2);
    l.end = +(l.start + VO[l.id].duration).toFixed(2);
    prevEnd = l.end;
  }
  // Szene endet kurz nach ihrem letzten Satz (keine feste Mindestlänge mehr).
  const end = prevEnd > 0 ? prevEnd + PAD[id] : b;
  SC[id] = [a, +end.toFixed(2)];
  SHIFT[id] = +(realT - a).toFixed(3);
  realT += end - a;
}
const R = (t, scene = sceneOf0(t)) => +(t + SHIFT[scene]).toFixed(3);
const RL = (l) => R(l.start, LINE_SCENE[l.id]);
const DUR = +realT.toFixed(2);
// Betonte Wörter (im Skript GROSS geschrieben) -> gelbe Untertitel + Kamera-Punch.
// Betonte Wörter stehen pro Zeile in "emph" (der Sprechtext bleibt normal
// geschrieben, sonst liest v3 GROSSBUCHSTABEN als Abkürzung).
const bare = (w) => w.toLowerCase().replace(/[^\p{L}]/gu, "");
const isEmphIn = (l, w) => (l.emph || []).some((e) => bare(e) === bare(w));

const L = Object.fromEntries(lines.map((l) => [l.id, [l.start, l.end]]));
// Mimik aus den Emotions-Tags: Zuhörer schaut zum Sprecher, laut = Kneifaugen,
// frech = Schlafzimmerblick, jammern = Blick nach oben, seufzen = Lider runter.
// Character acting helpers, injected into each scene script. Positions are
// GLOBAL seconds; `tl` shifts them by the scene's start (O).
const LIPMAP = Object.fromEntries(
  lines.filter((l) => VO[l.id]?.env).map((l) => [l.start.toFixed(2), VO[l.id].env]),
);
const HELPERS = `
  const LIP = ${JSON.stringify(LIPMAP)};
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
  // Lippensynchron: der Mund folgt der Lautstärke der echten Aufnahme (LIP,
  // 30 Werte/s); in Pausen fast geschlossen. Ohne Hüllkurve: fester Takt.
  function talk(ch, t0, t1, rest = "flat", step = 0.13) {
    face(ch, "open", t0);
    const o = "#" + ch + "-m-open";
    tl.set(o, { scaleY: 0.1, svgOrigin: "0 -6" }, t0);
    const env = LIP[(+t0).toFixed(2)];
    if (env) {
      for (let i = 0; i < env.length; i += 2) {
        const t = t0 + i / 30;
        if (t > t1 - 0.03) break;
        const v = Math.max(env[i], env[i + 1] || 0);
        tl.to(o, { scaleY: v < 0.12 ? 0.08 : 0.28 + v * 0.82, duration: 2 / 30, ease: "sine.out" }, t);
      }
    } else {
      let i = 0;
      for (let t = t0; t < t1 - 0.05; t += step, i++)
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

/* ================= Schluckauf – Bildsprache: feine Linien, weiche Flächen ================= */
const TF = {
  line: "#2B2320",
  skin: "#F7E2C9",
  skinOld: "#EFD3B6",
  skinLine: "#C9A27E",
  wallOld: "#E8DCC0",
  stripe: "#DCCDAA",
  suit: "#6B4E3A",
  wall: "#EADFCB",
  sweater: "#3D79C9",
  hair: "#4A2E1F",
  omaHair: "#D9D9D6",
  cardigan: "#8E5B9E",
  air: "#DDF1FA",
  lung: "#F2A7AE",
  lungDark: "#E2848E",
  dia: "#C2464E",
  diaHi: "#D9666D",
  trachea: "#F3C7B8",
  heart: "#D9475A",
  red: "#F2545B",
  water: "#BFE6F5",
};
const LN = (w = 3) =>
  `stroke="${TF.line}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const browPair = (id, gap, r, y) =>
  `<path id="${id}-browL" d="M ${-gap - r * 0.6} ${y + 3} Q ${-gap} ${y - 5} ${-gap + r * 0.6} ${y + 3}" fill="none" ${LN(3)}/>` +
  `<path id="${id}-browR" d="M ${gap - r * 0.6} ${y + 3} Q ${gap} ${y - 5} ${gap + r * 0.6} ${y + 3}" fill="none" ${LN(3)}/>`;
const v2Face = (id, r, lid, mouthInit = "flat") =>
  `${toothFace(id, { r, gap: r * 1.02, mouthY: r * 1.5, mouthS: r / 80, mouthInit, lidFill: lid, pupil: 0.24, sw: 3 })}${browPair(id, r * 1.02, r, -r * 1.35)}`;
const burst = (id, x, y, s = 1) =>
  `<g id="${id}" opacity="0" transform="translate(${x} ${y}) scale(${s})">${[
    0, 45, 90, 135, 180, 225, 270, 315,
  ]
    .map((a) => {
      const r = (a * Math.PI) / 180;
      return `<path d="M ${(Math.cos(r) * 26).toFixed(1)} ${(Math.sin(r) * 26).toFixed(1)} L ${(Math.cos(r) * 52).toFixed(1)} ${(Math.sin(r) * 52).toFixed(1)}" stroke="#FFF3B0" stroke-width="9" stroke-linecap="round"/><path d="M ${(Math.cos(r) * 26).toFixed(1)} ${(Math.sin(r) * 26).toFixed(1)} L ${(Math.cos(r) * 52).toFixed(1)} ${(Math.sin(r) * 52).toFixed(1)}" stroke="${TF.line}" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>`;
    })
    .join("")}</g>`;

/* ---------- Set 1: der Mann mit 68 Jahren Schluckauf ---------- */
const mannSvg = `
<svg id="set-mann" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${TF.wallOld}"/>
  ${Array.from({ length: 9 }, (_, i) => `<rect x="${i * 130}" y="0" width="56" height="${H}" fill="${TF.stripe}" opacity="0.7"/>`).join("")}
  <rect x="160" y="1080" width="760" height="700" rx="60" fill="#8C3B3B" ${LN(3.5)}/>
  <g id="mann">
    <path d="M 250 1700 L 270 1180 C 280 1080 400 1030 540 1030 C 680 1030 800 1080 810 1180 L 830 1700 Z" fill="${TF.suit}" ${LN(3.5)}/>
    <path d="M 470 1034 L 540 1120 L 610 1034" fill="#FFFFFF" ${LN(3)}/>
    <path d="M 526 1080 L 554 1080 L 562 1260 L 540 1290 L 518 1260 Z" fill="#7A2E2E" ${LN(3)}/>
    <rect x="500" y="960" width="80" height="84" fill="${TF.skinOld}" ${LN(3)}/>
    <g id="mann-head">
      <ellipse cx="400" cy="790" rx="24" ry="40" fill="${TF.skinOld}" ${LN(3)}/>
      <ellipse cx="680" cy="790" rx="24" ry="40" fill="${TF.skinOld}" ${LN(3)}/>
      <ellipse cx="540" cy="770" rx="142" ry="178" fill="${TF.skinOld}" ${LN(3.5)}/>
      <path d="M 404 780 C 396 700 410 660 430 640 C 420 690 424 740 432 790 Z M 676 780 C 684 700 670 660 650 640 C 660 690 656 740 648 790 Z" fill="#EDEDEA" ${LN(2.5)}/>
      <path d="M 470 640 C 500 626 580 626 610 640 M 480 668 C 520 658 560 658 600 668" fill="none" stroke="${TF.skinLine}" stroke-width="4" stroke-linecap="round"/>
      <g transform="translate(540 770)">${v2Face("mann", 22, TF.skinOld, "flat")}</g>
      <circle cx="517" cy="770" r="32" fill="none" ${LN(4)}/><circle cx="563" cy="770" r="32" fill="none" ${LN(4)}/>
      <path d="M 549 770 L 531 770" ${LN(4)}/>
      <path d="M 486 858 C 510 842 570 842 594 858 C 570 868 510 868 486 858 Z" fill="#EDEDEA" ${LN(2.5)}/>
    </g>
    ${burst("mann-b1", 650, 880, 1.0)}${burst("mann-b2", 430, 880, 0.8)}
  </g>
</svg>`;

/* ---------- Set 2: Kevin hat Schluckauf, Oma erschreckt ihn ---------- */
const kevinSvg = `
<svg id="set-kevin" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" opacity="0">
  <rect width="${W}" height="${H}" fill="${TF.wall}"/>
  <rect x="640" y="380" width="300" height="360" fill="#DCEFF8" ${LN(3)}/>
  <path d="M 790 380 L 790 740 M 640 560 L 940 560" ${LN(3)}/>
  <rect x="-20" y="1500" width="${W + 40}" height="440" fill="#B79C7A"/>
  <path d="M -20 1500 L ${W + 20} 1500" ${LN(3)}/>
  <g id="kev">
    <path d="M 300 1560 L 320 1080 C 330 990 420 950 540 950 C 660 950 750 990 760 1080 L 780 1560 Z" fill="${TF.sweater}" ${LN(3.5)}/>
    <path d="M 480 954 L 540 1020 L 600 954" fill="#fff" ${LN(3)}/>
    <rect x="500" y="880" width="80" height="80" fill="${TF.skin}" ${LN(3)}/>
    <g id="kev-head">
      <ellipse cx="400" cy="720" rx="22" ry="36" fill="${TF.skin}" ${LN(3)}/>
      <ellipse cx="680" cy="720" rx="22" ry="36" fill="${TF.skin}" ${LN(3)}/>
      <ellipse cx="540" cy="710" rx="140" ry="168" fill="${TF.skin}" ${LN(3.5)}/>
      <path d="M 400 690 C 380 560 450 520 540 520 C 640 520 704 566 680 690 C 660 620 630 600 600 596 C 560 614 490 612 450 596 C 430 620 410 650 400 690 Z" fill="${TF.hair}" ${LN(3)}/>
      <g id="kev-cheeks" opacity="0"><circle cx="470" cy="790" r="44" fill="#F2B9A6" ${LN(3)}/><circle cx="610" cy="790" r="44" fill="#F2B9A6" ${LN(3)}/></g>
      <g transform="translate(540 712)">${v2Face("kev", 26, TF.skin, "flat")}</g>
      <path d="M 540 740 q -10 24 6 28" fill="none" ${LN(3)}/>
    </g>
    <g id="kev-glass" opacity="0">
      <path d="M 560 1080 L 680 1080 L 664 1300 L 576 1300 Z" fill="${TF.water}" fill-opacity="0.6" ${LN(3)}/>
      <path d="M 566 1140 L 674 1140" stroke="#7FC8F0" stroke-width="6"/>
      <path d="M 520 1240 C 540 1200 570 1190 590 1200 L 600 1260 C 590 1290 540 1300 520 1280 Z" fill="${TF.skin}" ${LN(3)}/>
    </g>
    ${burst("kev-b1", 690, 820, 0.9)}${burst("kev-b2", 400, 830, 0.7)}
  </g>
  <g id="oma-pos">
    <path d="M -60 1560 L -40 1120 C -30 1040 40 1000 140 1000 C 240 1000 290 1040 300 1120 L 320 1560 Z" fill="${TF.cardigan}" ${LN(3.5)}/>
    <rect x="100" y="930" width="70" height="80" fill="${TF.skin}" ${LN(3)}/>
    <circle cx="130" cy="560" r="60" fill="${TF.omaHair}" ${LN(3)}/>
    <ellipse cx="135" cy="770" rx="120" ry="148" fill="${TF.skin}" ${LN(3.5)}/>
    <path d="M 16 760 C 0 640 60 600 135 600 C 216 600 268 640 254 760 C 240 690 210 670 180 664 C 140 680 90 676 60 664 C 40 690 26 720 16 760 Z" fill="${TF.omaHair}" ${LN(3)}/>
    <g transform="translate(140 772)">${v2Face("oma", 22, TF.skin, "smirk")}</g>
    <circle cx="117" cy="772" r="30" fill="none" ${LN(4)}/><circle cx="163" cy="772" r="30" fill="none" ${LN(4)}/>
    <g id="oma-arms">
      <path d="M 40 1060 C 0 960 0 860 30 760" fill="none" stroke="${TF.line}" stroke-width="58" stroke-linecap="round"/>
      <path d="M 40 1060 C 0 960 0 860 30 760" fill="none" stroke="${TF.cardigan}" stroke-width="50" stroke-linecap="round"/>
      <path d="M 240 1060 C 300 960 320 860 300 760" fill="none" stroke="${TF.line}" stroke-width="58" stroke-linecap="round"/>
      <path d="M 240 1060 C 300 960 320 860 300 760" fill="none" stroke="${TF.cardigan}" stroke-width="50" stroke-linecap="round"/>
      <circle cx="30" cy="740" r="40" fill="${TF.skin}" ${LN(3)}/><circle cx="300" cy="740" r="40" fill="${TF.skin}" ${LN(3)}/>
    </g>
  </g>
</svg>`;

/* ---------- Set 3: Körper im Schnitt – Zwerchfell und Stimmritze ---------- */
const DIA_UP =
  "M 210 1290 C 300 1120 460 1080 540 1080 C 620 1080 780 1120 870 1290 L 870 1330 C 780 1180 620 1140 540 1140 C 460 1140 300 1180 210 1330 Z";
const DIA_DN =
  "M 210 1330 C 300 1220 460 1190 540 1190 C 620 1190 780 1220 870 1330 L 870 1370 C 780 1270 620 1250 540 1250 C 460 1250 300 1270 210 1370 Z";
const koerperSvg = `
<svg id="set-koerper" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" opacity="0">
  <rect width="${W}" height="${H}" fill="${TF.air}"/>
  <path d="M 440 120 L 440 420 C 300 440 160 500 130 640 L 110 1900 L 970 1900 L 950 640 C 920 500 780 440 640 420 L 640 120 Z" fill="${TF.skin}" ${LN(3.5)}/>
  <rect x="510" y="300" width="60" height="420" rx="26" fill="${TF.trachea}" ${LN(3)}/>
  ${[360, 420, 480, 540, 600, 660].map((y) => `<path d="M 514 ${y} L 566 ${y}" stroke="#E0A898" stroke-width="6"/>`).join("")}
  <rect x="500" y="320" width="80" height="60" rx="18" fill="#E8B5A4" ${LN(3)}/>
  <g id="k-lungL"><path d="M 500 720 C 420 700 300 760 250 900 C 210 1020 220 1200 260 1260 C 360 1200 460 1170 510 1160 C 520 1040 520 860 500 720 Z" fill="${TF.lung}" ${LN(3)}/></g>
  <g id="k-lungR"><path d="M 580 720 C 660 700 780 760 830 900 C 870 1020 860 1200 820 1260 C 720 1200 620 1170 570 1160 C 560 1040 560 860 580 720 Z" fill="${TF.lung}" ${LN(3)}/></g>
  <path d="M 540 900 C 600 880 640 930 620 990 C 600 1050 560 1070 540 1080 C 520 1070 480 1050 470 990 C 460 930 500 880 540 900 Z" fill="${TF.heart}" ${LN(3)}/>
  <path id="k-dia" d="${DIA_UP}" fill="${TF.dia}" ${LN(3.5)}/>
  <g id="k-diaFace" transform="translate(540 1170)">${v2Face("zwerch", 22, TF.dia, "flat")}</g>
  <g id="k-air" opacity="0">${[0, 1, 2].map((i) => `<path d="M ${520 + i * 20} 640 L ${520 + i * 20} 460 M ${508 + i * 20} 480 L ${520 + i * 20} 456 L ${532 + i * 20} 480" fill="none" stroke="#3D9BE0" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`).join("")}</g>
  <g id="k-lupe">
    <circle cx="820" cy="380" r="170" fill="#F0B4AA" ${LN(5)}/>
    <path d="M 650 380 L 990 380" stroke="#E2848E" stroke-width="4"/>
    <path id="k-foldL" d="M 690 300 L 812 380 L 690 460 Z" fill="#FFF3EE" ${LN(3)}/>
    <path id="k-foldR" d="M 950 300 L 828 380 L 950 460 Z" fill="#FFF3EE" ${LN(3)}/>
    <path d="M 660 380 L 580 350" stroke="${TF.line}" stroke-width="4" stroke-dasharray="10 8"/>
  </g>
  <g id="k-red" opacity="0"><rect x="0" y="0" width="${W}" height="${H}" fill="${TF.red}" opacity="0.22"/></g>
  <g id="k-cal" opacity="0">
    <rect x="300" y="1000" width="480" height="300" rx="24" fill="#FFFFFF" ${LN(5)}/>
    <rect x="300" y="1000" width="480" height="80" rx="24" fill="${TF.red}" ${LN(5)}/>
    <text x="540" y="1240" text-anchor="middle" font-family="Montserrat, sans-serif" font-weight="900" font-size="120" fill="#1d1414">48 h</text>
  </g>
</svg>`;
const blackSvg = `<svg id="set-black" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" opacity="0"><rect width="${W}" height="${H}" fill="#0B0B0D"/></svg>`;
const askBody = `<div id="jahr">1922</div><div id="zaehler">HICKS: 0</div>
<div id="ask"><div class="ask-1">Was hilft bei DIR gegen Schluckauf?</div><div class="ask-2">Schreib deinen Trick in die Kommentare ↓</div></div>`;
const askCss = `#jahr { position: absolute; left: 0; right: 0; top: 400px; margin: 0 auto; width: max-content; padding: 8px 36px; border-radius: 26px;
  background: #FFFDF7; border: 5px solid #1d1414; font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 72px; color: #1d1414; opacity: 0; }
  #zaehler { position: absolute; left: 0; right: 0; top: 520px; margin: 0 auto; width: max-content; padding: 6px 26px; border-radius: 20px;
  background: #1d1414; font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 44px; color: #FFE14D; opacity: 0; }
  #ask { position: absolute; left: 0; right: 0; top: 760px; margin: 0 auto; width: 820px; padding: 22px 30px;
  border-radius: 34px; background: #FFE14D; color: #1d1414; border: 6px solid #1d1414; font-family: "Montserrat", sans-serif;
  font-weight: 900; font-size: 60px; opacity: 0; text-align: center; line-height: 1.15; }
  #ask .ask-2 { font-size: 34px; font-weight: 800; margin-top: 10px; }`;

/* ================= Film ================= */
const SETS = ["mann", "kevin", "koerper", "black"];
const filmBody =
  `<div id="fw" style="position:absolute;inset:0">` +
  mannSvg +
  kevinSvg +
  koerperSvg +
  blackSvg +
  `</div><div id="wflash" style="position:absolute;inset:0;background:#fff;opacity:0"></div>` +
  askBody;
const WT = Object.fromEntries(
  lines.map((l) => [l.id, (VO[l.id]?.words || []).map((w) => +(l.start + w.start).toFixed(2))]),
);
const filmJs = `${HELPERS}
    const L = ${JSON.stringify(L)};
    const WT = ${JSON.stringify(WT)};
    const S0 = ${SC.film[0]};
    const SETS = ${JSON.stringify(SETS)};
    const shot = (set, t, px, py, k, dur = 1.2, push = 1.08) => {
      SETS.forEach((s) => tl.set("#set-" + s, { opacity: s === set ? 1 : 0 }, t));
      tl.set(["#jahr", "#zaehler"], { opacity: set === "mann" ? 1 : 0 }, t);
      const cx = (kk) => Math.min(0, Math.max(1080 - kk * 1080, 540 - kk * px));
      const cy = (kk) => Math.min(0, Math.max(1920 - kk * 1920, 960 - kk * py));
      tl.set("#set-" + set, { x: cx(k), y: cy(k), scale: k, transformOrigin: "0 0" }, t);
      if (push !== 1) tl.to("#set-" + set, { x: cx(k * push), y: cy(k * push), scale: k * push, duration: dur, ease: "power1.out" }, t);
    };
    const hitCam = (t, k = 1.07) => { tl.set("#fw", { scale: k, transformOrigin: "50% 50%" }, t); tl.to("#fw", { scale: 1, duration: 0.25, ease: "power2.out" }, t + 0.02); };
    const flash = (t, a = 0.85) => { tl.set("#wflash", { opacity: a }, t); tl.to("#wflash", { opacity: 0, duration: 0.18 }, t + 0.03); };
    const pop = (sel, t) => {
      tl.fromTo(sel, { opacity: 1, scale: 0.4, transformOrigin: "50% 50%" }, { scale: 1.2, duration: 0.18, ease: "power2.out", immediateRender: false }, t);
      tl.to(sel, { opacity: 0, duration: 0.12 }, t + 0.18);
    };
    const hicMann = (t) => { tl.to("#mann", { y: -16, duration: 0.06, yoyo: true, repeat: 1 }, t); pop("#mann-b1", t); hitCam(t, 1.04); };
    const hicKev = (t) => { tl.to("#kev", { y: -18, duration: 0.06, yoyo: true, repeat: 1 }, t); pop("#kev-b1", t); pop("#kev-b2", t + 0.04); hitCam(t, 1.05); };
    const w = (id, i) => (WT[id] && WT[id][Math.min(i, WT[id].length - 1)]) ?? L[id][0];
    initChar("mann", 22, 0.25); initChar("kev", 26, 0.15); initChar("oma", 22, 0.25); initChar("zwerch", 22, 0.1);
    gsap.set("#oma-pos", { x: -420 });
    gsap.set("#oma-arms", { opacity: 0 });
    // ---------- 1 Haken: 68 Jahre ----------
    shot("mann", S0, 540, 900, 1.0, 1.6, 1.1);
    const H1 = L.h3[0];
    for (let t = S0 + 0.2, k = 0; t < H1 + 0.4; t += 0.75, k++) hicMann(t);
    const years = [1922, 1931, 1940, 1950, 1959, 1968, 1977, 1985, 1990];
    years.forEach((y, i) => tl.set("#jahr", { textContent: String(y) }, S0 + 0.2 + i * ((L.h2[1] - S0) / years.length)));
    const nums = ["0", "12.000", "850.000", "9.000.000", "48.000.000", "130.000.000", "260.000.000", "390.000.000", "430.000.000"];
    nums.forEach((n, i) => tl.set("#zaehler", { textContent: "HICKS: " + n }, L.h2[0] + i * ((L.h2[1] - L.h2[0] + 0.4) / nums.length)));
    shot("mann", w("h1", 3), 540, 780, 1.6, 1.0, 1.06);
    shot("mann", L.h2[0] - 0.05, 540, 900, 1.15, 1.6, 1.08); hitCam(w("h2", 4));
    shot("mann", L.h3[0] - 0.05, 540, 780, 1.9, L.h3[1] - L.h3[0], 1.1);
    // ---------- 2 Kevin + Oma ----------
    shot("kevin", L.k1[0] - 0.1, 540, 900, 1.15, 0.8, 1.04); hicKev(L.k1[0]);
    shot("kevin", L.o1[0] - 0.05, 400, 900, 1.0, 1.0, 1.04);
    tl.to("#oma-pos", { x: 0, duration: 0.3, ease: "back.out(1.4)" }, L.o1[0] - 0.05);
    look("oma", 14, 4, L.o1[0], 0.01); look("kev", 0, 0, L.o1[0], 0.01);
    talk("oma", L.o1[0], L.o1[1], "smirk");
    const BOO = w("o1", 2);
    tl.set("#oma-arms", { opacity: 1 }, BOO); tl.to("#oma-pos", { x: 140, duration: 0.12, ease: "power2.out" }, BOO);
    shot("kevin", BOO, 540, 760, 1.6, 0.6, 1.0); flash(BOO, 0.5); hitCam(BOO, 1.1);
    lids("kev", 0, BOO); squeeze("kev", true, BOO); squeeze("kev", false, BOO + 0.35);
    tl.to("#kev-head", { y: -30, duration: 0.08, yoyo: true, repeat: 1 }, BOO);
    shot("kevin", L.k2[0] - 0.05, 540, 760, 1.5, 0.8, 1.03); hicKev(w("k2", 0)); lids("kev", 0.45, L.k2[0]);
    look("kev", -10, 6, L.k2[0] + 0.2);
    // ---------- 3 Im Körper ----------
    shot("koerper", L.e1[0] - 0.05, 540, 960, 1.0, L.e1[1] - L.e1[0], 1.12);
    shot("koerper", L.e2[0] - 0.05, 540, 1100, 1.3, 1.6, 1.05);
    look("zwerch", 0, -10, L.e2[0], 0.01);
    const TW = w("e2", 6);
    shot("koerper", TW - 0.05, 540, 1200, 1.7, 1.0, 1.05);
    tl.to("#k-dia", { attr: { d: "${DIA_DN}" }, duration: 0.1, ease: "power3.in" }, TW);
    tl.to("#k-diaFace", { y: 110, duration: 0.1, ease: "power3.in" }, TW);
    squeeze("zwerch", true, TW); hitCam(TW, 1.08);
    tl.to(["#k-lungL", "#k-lungR"], { scaleY: 1.06, transformOrigin: "50% 0%", duration: 0.12 }, TW);
    shot("koerper", L.e3[0] - 0.05, 540, 600, 1.2, 1.2, 1.05);
    tl.to("#k-air", { opacity: 1, duration: 0.1 }, w("e3", 1));
    tl.fromTo("#k-air", { y: 80 }, { y: -40, duration: 0.6, ease: "power1.in", immediateRender: false }, w("e3", 1));
    const SN = w("e3", 7);
    shot("koerper", SN - 0.3, 820, 400, 1.9, 0.9, 1.04);
    tl.to("#k-foldL", { attr: { d: "M 690 300 L 820 376 L 690 460 Z" }, duration: 0.06 }, SN);
    tl.to("#k-foldR", { attr: { d: "M 950 300 L 820 384 L 950 460 Z" }, duration: 0.06 }, SN);
    flash(SN, 0.5); hitCam(SN, 1.1);
    shot("kevin", L.k3[0] - 0.05, 540, 760, 1.45, 0.8, 1.03); hicKev(L.k3[0]);
    // reset Körper für später
    tl.set("#k-dia", { attr: { d: "${DIA_UP}" } }, L.k3[0]); tl.set("#k-diaFace", { y: 0 }, L.k3[0]); squeeze("zwerch", false, L.k3[0]);
    tl.set(["#k-lungL", "#k-lungR"], { scaleY: 1 }, L.k3[0]); tl.set("#k-air", { opacity: 0 }, L.k3[0]);
    tl.set("#k-foldL", { attr: { d: "M 690 300 L 812 380 L 690 460 Z" } }, L.k3[0]); tl.set("#k-foldR", { attr: { d: "M 950 300 L 828 380 L 950 460 Z" } }, L.k3[0]);
    // ---------- 4 Mythos & Tipps ----------
    shot("kevin", L.e4[0] - 0.05, 400, 900, 1.0, 1.2, 1.04);
    tl.set("#oma-arms", { opacity: 1 }, L.e4[0] - 0.05); tl.set("#oma-pos", { x: 60 }, L.e4[0] - 0.05);
    tl.to("#oma-pos", { x: -420, duration: 0.3, ease: "power2.in" }, w("e4", 2));
    shot("kevin", w("e4", 4), 540, 820, 1.4, 1.2, 1.04);
    tl.set("#kev-cheeks", { opacity: 1 }, w("e4", 5)); lids("kev", 0.7, w("e4", 5));
    tl.set("#kev-cheeks", { opacity: 0 }, w("e4", 7));
    shot("kevin", w("e4", 7), 600, 1100, 1.4, 1.6, 1.05);
    tl.set("#kev-glass", { opacity: 1 }, w("e4", 7));
    tl.to("#kev-glass", { y: -200, rotation: -25, transformOrigin: "50% 50%", duration: 0.4 }, w("e4", 9));
    // ---------- 5 Aber Vorsicht ----------
    shot("koerper", L.e5[0] - 0.05, 540, 1150, 1.25, 0.9, 1.05);
    tl.set("#kev-glass", { opacity: 0 }, L.e5[0]);
    tl.set("#k-red", { opacity: 1 }, L.e5[0]); flash(L.e5[0], 0.4); hitCam(w("e5", 1), 1.08);
    shot("koerper", L.e6[0] - 0.05, 540, 1250, 1.1, L.e6[1] - L.e6[0], 1.06);
    tl.to("#k-cal", { opacity: 1, duration: 0.05 }, w("e6", 4));
    tl.fromTo("#k-cal", { scale: 0.4, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.3, ease: "back.out(2.5)", immediateRender: false }, w("e6", 4));
    hitCam(w("e6", 4));
    for (let t = L.e6[0] + 0.3; t < L.e6[1]; t += 0.6) { tl.to("#k-dia", { attr: { d: "${DIA_DN}" }, duration: 0.08 }, t); tl.to("#k-dia", { attr: { d: "${DIA_UP}" }, duration: 0.2 }, t + 0.1); }
    // ---------- 6 Auflösung: Stille ----------
    shot("mann", L.e7[0] - 0.05, 540, 900, 1.1, 1.4, 1.06);
    tl.set("#jahr", { textContent: "1990" }, L.e7[0] - 0.05); tl.set("#zaehler", { textContent: "HICKS: 430.000.000" }, L.e7[0] - 0.05);
    for (let t = L.e7[0] + 0.2; t < L.e8[0] + 0.6; t += 0.7) hicMann(t);
    shot("mann", w("e7", 4), 540, 780, 1.6, 1.2, 1.05);
    const ST = w("e8", 3);
    shot("mann", ST, 540, 800, 1.3, L.e9[1] - ST + 0.3, 1.12); flash(ST, 0.9);
    tl.set("#zaehler", { color: "#7CFF8A" }, ST);
    lids("mann", 0, ST + 0.3); look("mann", 0, -8, ST + 0.3);
    face("mann", "smile", w("e9", 3));
    // ---------- 7 Pointe ----------
    shot("kevin", L.k4[0] - 0.05, 540, 800, 1.4, 1.0, 1.04);
    face("kev", "smile", L.k4[0]); lids("kev", 0.1, L.k4[0]); look("kev", 0, 0, L.k4[0]);
    talk("kev", L.k4[0], L.k4[1], "smile");
    tl.set("#oma-arms", { opacity: 1 }, L.o2[0] - 0.3);
    shot("kevin", L.o2[0] - 0.3, 400, 860, 1.0, 0.8, 1.03);
    tl.fromTo("#oma-pos", { x: -420 }, { x: 140, duration: 0.2, ease: "back.out(1.6)", immediateRender: false }, L.o2[0] - 0.3);
    talk("oma", L.o2[0], L.o2[1], "smirk"); flash(L.o2[0], 0.5); hitCam(L.o2[0], 1.1);
    squeeze("kev", true, L.o2[0]); squeeze("kev", false, L.o2[0] + 0.4);
    shot("kevin", L.k5[0] - 0.05, 540, 760, 1.7, 0.9, 1.02); hicKev(w("k5", 0)); lids("kev", 0.5, L.k5[0]); face("kev", "frown", L.k5[0]);
    const BK = L.k5[1] + 0.4;
    shot("black", BK, 540, 960, 1.0, 1.0, 1.0);
    tl.fromTo("#ask", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)", immediateRender: true }, BK + 0.2);
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
const isRedIn = (l, w) => (l.red || []).some((e) => bare(e) === bare(w));
const redSet = new Set(
  spoken.flatMap((l) =>
    VO[l.id]
      ? VO[l.id].words.filter((w) => isRedIn(l, w.text)).map((w) => +(RL(l) + w.start).toFixed(3))
      : [],
  ),
);
// Untertitel wie im Erzähl-Vorbild: 2–3 Wörter pro Einblendung, Schlüsselwörter gelb oder rot.
const chunks = [];
for (const w of words) {
  const cur = chunks[chunks.length - 1];
  const prev = cur && cur.words[cur.words.length - 1];
  const brk =
    !cur || cur.words.length >= 3 || /[.,!?…:]$/u.test(prev.text) || w.start - prev.end > 0.35;
  const item = { ...w, red: redSet.has(w.start) };
  if (brk) chunks.push({ start: w.start, end: w.end, words: [item] });
  else {
    cur.words.push(item);
    cur.end = w.end;
  }
}
const capBody = chunks
  .map(
    (c, i) =>
      `    <div id="cap-${i}" class="cap">${c.words.map((w) => `<span class="${w.red ? "red" : w.emph ? "emph" : ""}">${w.text.replace(/[!?,.…:]+$/u, "")}</span>`).join(" ")}</div>`,
  )
  .join("\n");
const capJs = `
    const W = ${JSON.stringify(chunks.map((c) => [c.start, c.end]))};
    W.forEach(([s, e], i) => {
      const el = "#cap-" + i;
      const next = W[i + 1];
      const end = next && next[0] - e < 0.4 ? next[0] : e + 0.15;
      tl.set(el, { opacity: 1 }, s);
      tl.fromTo(el, { scale: 0.85 }, { scale: 1, duration: 0.09, ease: "back.out(3)", immediateRender: false }, s);
      tl.set(el, { opacity: 0 }, end);
    });
`;

const CAP_EMPH_CSS = `
  .cap { --cap-y: 1300px; font-size: 64px; -webkit-text-stroke: 11px #1d1414; text-shadow: 0 5px 0 rgba(0,0,0,0.35); }
  .cap .emph { color: #FFE14D; }
  .cap .red { color: #FF4D5A; }`;

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
  ? `      <audio id="bed" class="clip" src="assets/sfx/bed-long.mp3" data-start="0" data-duration="${DUR}" data-track-index="9" data-volume="0.08"></audio>`
  : "";
const vo = lines
  .filter((l) => VO[l.id])
  .map(
    (l, i) =>
      `      <audio id="vo-${l.id}" class="clip" src="assets/vo/${l.reuse || l.id}.mp3" data-start="${RL(l)}" data-duration="${VO[l.id].fileDuration}" data-track-index="${40 + i}" data-volume="1"></audio>`,
  )
  .join("\n");
const host = (id, track, kind = "graphics", z = 1) => {
  const [a, b] = SC[id] || [0, DUR];
  return `      <div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${ORDER.includes(id) ? R(a, id) : a}" data-duration="${+(b - a).toFixed(2)}" data-track-index="${track}" data-track-kind="${kind}" data-width="${W}" data-height="${H}" style="z-index:${z}"></div>`;
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
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${TF.wallOld}; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}">
${host("film", 1)}
${host("captions", 5, "captions", 5)}
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
    #wm { position: absolute; left: 60px; top: 1486px; font-family: "Montserrat", sans-serif; font-weight: 700;
      font-size: 34px; color: rgba(255,255,255,0.32); transform: none; transform-origin: left center; white-space: nowrap; }
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
out("./index.html", index);
out("./compositions/film.html", page("film", SC.film, filmBody, askCss, filmJs));
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
