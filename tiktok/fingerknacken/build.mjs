// Fingerknacken (Erzähl-Format, harte Schnitte). Generates index.html + compositions/*.html from script.json.
// Run: node build.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import {
  toothFace,
  painStar,
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

/* ================= Fingerknacken – Bildsprache: feine Linien, weiche Flächen ================= */
const TF = {
  line: "#2B2320",
  skin: "#F7E2C9",
  skinOld: "#EFD3B6",
  skinLine: "#C9A27E",
  spot: "#D8B08C",
  nail: "#F9E9DF",
  desk: "#C9A27A",
  deskLine: "#B08860",
  coat: "#FAFAFA",
  wall: "#EADFCB",
  sweater: "#3D79C9",
  sweaterDark: "#3166AD",
  hair: "#4A2E1F",
  omaHair: "#D9D9D6",
  cardigan: "#8E5B9E",
  bone: "#F3EBD8",
  boneShade: "#E2D6BC",
  cartilage: "#CFE7F2",
  fluid: "#F7E9A8",
  capsule: "#E99AA3",
  red: "#F2545B",
  film: "#1B2433",
  filmBone: "#E8EEF5",
  gold: "#F2C14E",
  air: "#DDF1FA",
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
// Hand von oben (Handrücken), Finger zeigen nach oben. side = -1 linke Hand (Daumen rechts), 1 rechte Hand.
function handTop(id, x, y, side, skin = TF.skinOld, old = true) {
  const fingers = [
    [-96, 250, 50],
    [-34, 290, 54],
    [30, 275, 52],
    [88, 225, 46],
  ];
  const fx = (dx) => side * dx;
  const f = fingers
    .map(
      (
        [dx, len, w],
        i,
      ) => `<g id="${id}-f${i}"><rect x="${fx(dx) - w / 2}" y="${-60 - len}" width="${w}" height="${len + 40}" rx="${w / 2}" fill="${skin}" ${LN(3)}/>
      <path d="M ${fx(dx) - w * 0.34} ${-60 - len + 26} q ${w * 0.34} -10 ${w * 0.68} 0 L ${fx(dx) + w * 0.3} ${-60 - len + 50} q ${-w * 0.3} 8 ${-w * 0.6} 0 Z" fill="${TF.nail}" ${LN(2)}/>
      <path d="M ${fx(dx) - w * 0.3} ${-60 - len * 0.45} q ${w * 0.3} 8 ${w * 0.6} 0 M ${fx(dx) - w * 0.3} ${-60 - len * 0.15} q ${w * 0.3} 8 ${w * 0.6} 0" fill="none" stroke="${TF.skinLine}" stroke-width="3" stroke-linecap="round"/></g>`,
    )
    .join("");
  return `<g id="${id}" transform="translate(${x} ${y})">
    ${f}
    <path d="M ${fx(-140)} 10 C ${fx(-220)} -40 ${fx(-250)} -120 ${fx(-230)} -150 C ${fx(-210)} -176 ${fx(-176)} -160 ${fx(-170)} -120 L ${fx(-130)} -40" fill="${skin}" ${LN(3)}/>
    <path d="M -150 -40 C -150 -90 150 -90 150 -40 L 150 120 C 150 180 100 220 0 220 C -100 220 -150 180 -150 120 Z" fill="${skin}" ${LN(3)}/>
    ${[-96, -34, 30, 88].map((dx) => `<path d="M ${fx(dx) - 16} -56 q 16 -10 32 0" fill="none" stroke="${TF.skinLine}" stroke-width="3" stroke-linecap="round"/>`).join("")}
    ${old ? `<circle cx="${fx(-60)}" cy="40" r="10" fill="${TF.spot}" opacity="0.6"/><circle cx="${fx(40)}" cy="90" r="7" fill="${TF.spot}" opacity="0.6"/><path d="M -110 0 C -60 20 60 20 110 0 M -100 60 C -40 76 40 76 100 60" fill="none" stroke="${TF.skinLine}" stroke-width="2.5" opacity="0.7"/>` : ""}
    <path d="M -150 200 L -150 420 L 150 420 L 150 200 C 100 230 -100 230 -150 200 Z" fill="${TF.coat}" ${LN(3)}/>
  </g>`;
}

/* ---------- Set 1: Schreibtisch, zwei alte Hände, Jahreszähler ---------- */
const tischSvg = `
<svg id="set-tisch" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${TF.desk}"/>
  ${[300, 620, 940, 1260, 1580].map((y) => `<path d="M -20 ${y} C 300 ${y - 30} 700 ${y + 30} 1100 ${y - 10}" fill="none" stroke="${TF.deskLine}" stroke-width="5" opacity="0.6"/>`).join("")}
  <g transform="translate(250 1180) scale(1.25) translate(-250 -1180)">${handTop("hl", 250, 1180, -1)}</g>
  <g transform="translate(800 1180) scale(1.25) translate(-800 -1180)">${handTop("hr", 800, 1180, 1)}</g>
  ${burst("hl-burst", 340, 760, 1.3)}
  ${burst("hl-burst2", 270, 740, 1.1)}
</svg>`;

/* ---------- Set 2: Kevin knackt, Oma schimpft ---------- */
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
      <g transform="translate(540 712)">${v2Face("kev", 26, TF.skin, "smirk")}</g>
      <path d="M 540 740 q -10 24 6 28" fill="none" ${LN(3)}/>
    </g>
    <g id="kev-hands">
      <path d="M 400 1180 C 400 1110 460 1090 540 1090 C 620 1090 680 1110 680 1180 C 680 1240 620 1260 540 1260 C 460 1260 400 1240 400 1180 Z" fill="${TF.skin}" ${LN(3)}/>
      ${[440, 490, 540, 590, 640].map((x) => `<path d="M ${x} 1100 L ${x} 1250" stroke="${TF.skinLine}" stroke-width="4" stroke-linecap="round"/>`).join("")}
      <path d="M 340 1250 C 340 1200 380 1180 410 1190 M 740 1250 C 740 1200 700 1180 670 1190" fill="none" ${LN(3)}/>
    </g>
    ${burst("kev-burst", 410, 1110, 0.9)}${burst("kev-burst2", 670, 1110, 0.9)}
  </g>
  <g id="oma-pos">
    <path d="M -60 1560 L -40 1120 C -30 1040 40 1000 140 1000 C 240 1000 290 1040 300 1120 L 320 1560 Z" fill="${TF.cardigan}" ${LN(3.5)}/>
    <rect x="100" y="930" width="70" height="80" fill="${TF.skin}" ${LN(3)}/>
    <circle cx="130" cy="560" r="60" fill="${TF.omaHair}" ${LN(3)}/>
    <ellipse cx="135" cy="770" rx="120" ry="148" fill="${TF.skin}" ${LN(3.5)}/>
    <path d="M 16 760 C 0 640 60 600 135 600 C 216 600 268 640 254 760 C 240 690 210 670 180 664 C 140 680 90 676 60 664 C 40 690 26 720 16 760 Z" fill="${TF.omaHair}" ${LN(3)}/>
    <g transform="translate(140 772)">${v2Face("oma", 22, TF.skin, "frown")}</g>
    <circle cx="117" cy="772" r="30" fill="none" ${LN(4)}/><circle cx="163" cy="772" r="30" fill="none" ${LN(4)}/>
    <path d="M 210 1100 C 260 1060 300 1000 330 960" fill="none" stroke="${TF.line}" stroke-width="58" stroke-linecap="round"/>
    <path d="M 210 1100 C 260 1060 300 1000 330 960" fill="none" stroke="${TF.cardigan}" stroke-width="50" stroke-linecap="round"/>
    <path d="M 320 980 C 340 950 360 930 400 900 C 412 892 420 904 410 914 L 370 950 C 380 970 360 990 340 990 Z" fill="${TF.skin}" ${LN(3)}/>
  </g>
</svg>`;

/* ---------- Set 3: Fingergelenk im Schnitt, Gasblase ---------- */
const FING =
  "M -120 760 L 860 760 C 960 760 1030 840 1030 960 C 1030 1080 960 1160 860 1160 L -120 1160 Z";
const gelenkSvg = `
<svg id="set-gelenk" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" opacity="0">
  <rect width="${W}" height="${H}" fill="${TF.air}"/>
  <defs><clipPath id="fingC"><path d="${FING}"/></clipPath>
    <radialGradient id="redG" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${TF.red}" stop-opacity="0.55"/><stop offset="1" stop-color="${TF.red}" stop-opacity="0"/></radialGradient></defs>
  <path d="${FING}" fill="${TF.skin}" ${LN(3.5)}/>
  <path d="M 880 800 C 960 810 1000 880 1004 960 C 1000 1040 960 1110 880 1120 L 880 800 Z" fill="${TF.nail}" ${LN(3)}/>
  <g clip-path="url(#fingC)">
    <rect x="-200" y="800" width="1100" height="320" fill="#F2C9C0" opacity="0.55"/>
    <g id="g-caps"><ellipse cx="530" cy="960" rx="150" ry="125" fill="${TF.capsule}" opacity="0.45" ${LN(3)}/></g>
    <ellipse id="g-fluid" cx="530" cy="960" rx="95" ry="92" fill="${TF.fluid}"/>
    <path d="M -100 880 L 400 880 C 450 880 470 900 476 930 C 482 960 476 1000 466 1020 C 456 1040 430 1044 400 1040 L -100 1040 Z" fill="${TF.bone}" ${LN(3)}/>
    <path d="M 470 900 C 486 930 488 990 470 1024" fill="none" stroke="${TF.cartilage}" stroke-width="16" stroke-linecap="round"/>
    <g id="g-bone2">
      <path d="M 1100 880 L 640 880 C 600 880 584 900 580 930 C 576 960 580 1000 590 1020 C 600 1040 620 1044 640 1040 L 1100 1040 Z" fill="${TF.bone}" ${LN(3)}/>
      <path d="M 588 900 C 572 930 570 990 588 1024" fill="none" stroke="${TF.cartilage}" stroke-width="16" stroke-linecap="round"/>
    </g>
    <path d="M -100 905 L 380 905 M -100 1015 L 380 1015" stroke="${TF.boneShade}" stroke-width="8" opacity="0.8"/>
    <g id="g-bubble" opacity="0"><circle cx="528" cy="960" r="44" fill="#FFFFFF" fill-opacity="0.85" ${LN(3)}/>
      <path d="M 506 940 C 512 930 524 926 534 928" fill="none" stroke="#BFE6F5" stroke-width="6" stroke-linecap="round"/>
      <g transform="translate(528 966)">${v2Face("blase", 13, "#FFFFFF", "smile")}</g></g>
    <rect id="g-redtint" x="330" y="780" width="400" height="360" fill="url(#redG)" opacity="0"/>
  </g>
  <g id="g-pop" opacity="0">${[0, 60, 120, 180, 240, 300]
    .map((a) => {
      const r = (a * Math.PI) / 180;
      return `<circle cx="${(528 + Math.cos(r) * 70).toFixed(0)}" cy="${(960 + Math.sin(r) * 70).toFixed(0)}" r="10" fill="#FFFFFF" ${LN(2.5)}/>`;
    })
    .join("")}</g>
  <g id="g-arrows" opacity="0">
    <path d="M 420 660 L 240 660 M 270 630 L 240 660 L 270 690" fill="none" ${LN(8)}/>
    <path d="M 640 660 L 820 660 M 790 630 L 820 660 L 790 690" fill="none" ${LN(8)}/>
  </g>
  <g id="g-clock" opacity="0"><circle cx="540" cy="520" r="110" fill="#FFFFFF" ${LN(5)}/>
    ${Array.from({ length: 12 }, (_, i) => {
      const r = (i * 30 * Math.PI) / 180;
      return `<path d="M ${(540 + Math.sin(r) * 88).toFixed(0)} ${(520 - Math.cos(r) * 88).toFixed(0)} L ${(540 + Math.sin(r) * 100).toFixed(0)} ${(520 - Math.cos(r) * 100).toFixed(0)}" ${LN(4)}/>`;
    }).join("")}
    <path id="g-hand-m" d="M 540 520 L 540 440" ${LN(8)}/><path d="M 540 520 L 590 520" ${LN(8)}/></g>
  <g id="g-pain" opacity="0" transform="translate(530 700)">${painStar("g-painS", { r: 70 })}</g>
</svg>`;

/* ---------- Set 4: Röntgenbilder beider Hände, Preis ---------- */
const xHand = (x, y, mirror = 1) => {
  const fx = (d) => x + mirror * d;
  const rays = [
    [-90, 230],
    [-30, 270],
    [30, 255],
    [86, 210],
  ];
  return `<g>
    <path d="M ${fx(-120)} ${y + 260} L ${fx(-120)} ${y + 320} M ${fx(-40)} ${y + 260} L ${fx(-40)} ${y + 320} M ${fx(40)} ${y + 260} L ${fx(40)} ${y + 320}" stroke="${TF.filmBone}" stroke-width="26" stroke-linecap="round" opacity="0.85"/>
    ${rays
      .map(
        ([
          d,
          len,
        ]) => `<path d="M ${fx(d * 0.6)} ${y + 230} L ${fx(d)} ${y + 40}" stroke="${TF.filmBone}" stroke-width="22" stroke-linecap="round" opacity="0.9"/>
      <path d="M ${fx(d)} ${y + 20} L ${fx(d * 1.05)} ${y - len * 0.45}" stroke="${TF.filmBone}" stroke-width="18" stroke-linecap="round" opacity="0.9"/>
      <path d="M ${fx(d * 1.05)} ${y - len * 0.45 - 20} L ${fx(d * 1.08)} ${y - len * 0.8}" stroke="${TF.filmBone}" stroke-width="15" stroke-linecap="round" opacity="0.9"/>
      <path d="M ${fx(d * 1.08)} ${y - len * 0.8 - 18} L ${fx(d * 1.1)} ${y - len}" stroke="${TF.filmBone}" stroke-width="12" stroke-linecap="round" opacity="0.9"/>`,
      )
      .join("")}
    <path d="M ${fx(110)} ${y + 200} L ${fx(170)} ${y + 80} L ${fx(200)} ${y - 10}" fill="none" stroke="${TF.filmBone}" stroke-width="20" stroke-linecap="round" opacity="0.9"/>
  </g>`;
};
const check = (id, x, y) =>
  `<g id="${id}" opacity="0"><circle cx="${x}" cy="${y}" r="56" fill="#3CC46B" ${LN(4)}/><path d="M ${x - 26} ${y + 2} L ${x - 6} ${y + 22} L ${x + 28} ${y - 18}" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const xraySvg = `
<svg id="set-xray" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" opacity="0">
  <rect width="${W}" height="${H}" fill="#10151E"/>
  <rect x="40" y="460" width="490" height="1000" rx="20" fill="${TF.film}" ${LN(4)}/>
  <rect x="550" y="460" width="490" height="1000" rx="20" fill="${TF.film}" ${LN(4)}/>
  <text x="285" y="560" text-anchor="middle" font-family="Montserrat, sans-serif" font-weight="900" font-size="64" fill="${TF.filmBone}">L</text>
  <text x="795" y="560" text-anchor="middle" font-family="Montserrat, sans-serif" font-weight="900" font-size="64" fill="${TF.filmBone}">R</text>
  ${xHand(285, 1000, -1)}${xHand(795, 1000, 1)}
  ${check("x-chkL", 285, 1330)}${check("x-chkR", 795, 1330)}
  <g id="x-trophy" opacity="0">
    <path d="M 440 700 L 640 700 L 620 860 C 610 920 560 940 540 940 C 520 940 470 920 460 860 Z" fill="${TF.gold}" ${LN(4)}/>
    <path d="M 440 720 C 380 720 380 820 452 830 M 640 720 C 700 720 700 820 628 830" fill="none" ${LN(8)}/>
    <rect x="510" y="940" width="60" height="70" fill="${TF.gold}" ${LN(4)}/><rect x="460" y="1010" width="160" height="40" rx="8" fill="#B88A2E" ${LN(4)}/>
    <path d="M 540 750 L 552 784 L 588 784 L 559 805 L 570 840 L 540 819 L 510 840 L 521 805 L 492 784 L 528 784 Z" fill="#FFF3B0" ${LN(2.5)}/>
  </g>
</svg>`;
const blackSvg = `<svg id="set-black" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" opacity="0"><rect width="${W}" height="${H}" fill="#0B0B0D"/></svg>`;
const askBody = `<div id="jahr">JAHR 1</div><div id="ask"><div class="ask-1">Knackst du auch?</div><div class="ask-2">Ja oder Nein – schreib's in die Kommentare ↓</div></div>
<div id="teil2"><div class="t2-a">TEIL 2</div><div class="t2-b">Nacken knacken – gefährlich?</div><div class="t2-c">Folgen, damit du's nicht verpasst</div></div>`;
const askCss = `#jahr { position: absolute; left: 0; right: 0; top: 400px; margin: 0 auto; width: max-content; padding: 10px 40px; border-radius: 26px;
  background: #FFFDF7; border: 5px solid #1d1414; font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 76px; color: #1d1414; opacity: 0; }
  #ask { position: absolute; left: 0; right: 0; top: 420px; margin: 0 auto; width: max-content; padding: 14px 32px;
  border-radius: 34px; background: #FFE14D; color: #1d1414; border: 5px solid #1d1414; font-family: "Montserrat", sans-serif;
  font-weight: 900; font-size: 50px; opacity: 0; text-align: center; line-height: 1.2; }
  #ask .ask-2 { font-size: 30px; font-weight: 800; }
  #teil2 { position: absolute; left: 0; right: 0; top: 820px; text-align: center; opacity: 0; font-family: "Montserrat", sans-serif; color: #fff; }
  #teil2 .t2-a { font-weight: 900; font-size: 110px; color: #FF4D5A; -webkit-text-stroke: 10px #1d1414; paint-order: stroke fill; }
  #teil2 .t2-b { font-weight: 900; font-size: 56px; margin-top: 10px; }
  #teil2 .t2-c { display: inline-block; margin-top: 24px; padding: 10px 26px; border-radius: 30px; background: #fff; color: #1d1414; font-weight: 800; font-size: 34px; }`;

/* ================= Film ================= */
const SETS = ["tisch", "kevin", "gelenk", "xray", "black"];
const filmBody =
  `<div id="fw" style="position:absolute;inset:0">` +
  tischSvg +
  kevinSvg +
  gelenkSvg +
  xraySvg +
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
      tl.set("#jahr", { opacity: set === "tisch" ? 1 : 0 }, t);
      const cx = (kk) => Math.min(0, Math.max(1080 - kk * 1080, 540 - kk * px));
      const cy = (kk) => Math.min(0, Math.max(1920 - kk * 1920, 960 - kk * py));
      tl.set("#set-" + set, { x: cx(k), y: cy(k), scale: k, transformOrigin: "0 0" }, t);
      if (push !== 1) tl.to("#set-" + set, { x: cx(k * push), y: cy(k * push), scale: k * push, duration: dur, ease: "power1.out" }, t);
    };
    // Kamera-Stoß auf ein Schlüsselwort, weißer Blitz bei Wendungen.
    const hitCam = (t, k = 1.07) => { tl.set("#fw", { scale: k, transformOrigin: "50% 50%" }, t); tl.to("#fw", { scale: 1, duration: 0.25, ease: "power2.out" }, t + 0.02); };
    const flash = (t, a = 0.85) => { tl.set("#wflash", { opacity: a }, t); tl.to("#wflash", { opacity: 0, duration: 0.18 }, t + 0.03); };
    const pop = (sel, t) => {
      tl.fromTo(sel, { opacity: 1, scale: 0.4, transformOrigin: "50% 50%" }, { scale: 1.2, duration: 0.18, ease: "power2.out", immediateRender: false }, t);
      tl.to(sel, { opacity: 0, duration: 0.12 }, t + 0.18);
    };
    const crackL = (t) => {
      tl.to(["#hl-f1", "#hl-f2"], { scaleY: 0.82, transformOrigin: "50% 100%", duration: 0.08, yoyo: true, repeat: 1 }, t);
      pop("#hl-burst", t + 0.08); pop("#hl-burst2", t + 0.12); hitCam(t + 0.08, 1.05);
    };
    const w = (id, i) => (WT[id] && WT[id][Math.min(i, WT[id].length - 1)]) ?? L[id][0];
    initChar("kev", 26, 0.3); initChar("oma", 22, 0.2); initChar("blase", 13, 0.05);
    gsap.set("#oma-pos", { x: -420 });
    // ---------- 1 Haken ----------
    shot("tisch", S0, 540, 1000, 1.0, 1.6, 1.12);
    crackL(S0 + 0.05);
    const years = [1, 9, 17, 26, 34, 43, 51, 60];
    years.forEach((y, i) => tl.set("#jahr", { textContent: "JAHR " + y }, S0 + 0.3 + i * ((L.h2[1] - S0 - 0.4) / years.length)));
    shot("tisch", w("h1", 5), 260, 1020, 1.5, 1.0, 1.1);
    crackL(w("h1", 7));
    // "Jeden Tag. Zweimal. Nie rechts."
    shot("tisch", w("h2", 0), 260, 980, 1.8, 0.8, 1.06); crackL(w("h2", 0) + 0.1);
    shot("tisch", w("h2", 2), 300, 900, 2.2, 0.6, 1.05); crackL(w("h2", 2) + 0.05);
    shot("tisch", w("h2", 3), 790, 1020, 1.6, 1.0, 1.04); hitCam(w("h2", 4));
    // "Er wollte eine Frage klären, die dir jeder schon gestellt hat."
    shot("tisch", L.h3[0] - 0.05, 540, 1000, 1.0, 1.0, 1.08);
    shot("kevin", w("h3", 5), 540, 1160, 1.5, 1.4, 1.1);
    tl.to("#kev-hands", { y: 30, scaleX: 1.06, transformOrigin: "50% 50%", duration: 0.12, yoyo: true, repeat: 3 }, L.o1[0] - 0.65);
    pop("#kev-burst", L.o1[0] - 0.55); pop("#kev-burst2", L.o1[0] - 0.45);
    // ---------- 2 Oma ----------
    shot("kevin", L.o1[0] - 0.3, 540, 960, 1.0, 0.8, 1.04);
    lids("kev", 0.6, L.o1[0] - 0.6); face("kev", "smile", L.o1[0] - 0.6);
    tl.to("#oma-pos", { x: 0, duration: 0.3, ease: "back.out(1.4)" }, L.o1[0] - 0.3);
    look("oma", 14, 4, L.o1[0] - 0.3, 0.01); look("kev", -14, 0, L.o1[0] + 0.2);
    squeeze("oma", true, L.o1[0]); squeeze("oma", false, L.o1[0] + 0.4);
    talk("oma", L.o1[0], L.o1[1], "frown");
    lids("kev", 0.1, L.o1[0] + 0.2); face("kev", "frown", L.o1[0] + 0.2);
    shot("kevin", w("o1", 5), 160, 800, 1.7, 1.0, 1.06); hitCam(w("o1", 7));
    // ---------- 3 Was knackt da? ----------
    shot("gelenk", L.e1[0] - 0.05, 540, 960, 1.0, L.e1[1] - L.e1[0], 1.18);
    shot("gelenk", L.e2[0] - 0.05, 540, 900, 1.1, 1.4, 1.05);
    tl.to("#g-arrows", { opacity: 1, duration: 0.15 }, w("e2", 1));
    tl.to("#g-bone2", { x: 46, duration: 0.5, ease: "power2.out" }, w("e2", 2));
    tl.to("#g-fluid", { attr: { rx: 118 }, duration: 0.5 }, w("e2", 2));
    shot("gelenk", w("e2", 4), 530, 960, 1.7, 1.2, 1.08);
    tl.to("#g-arrows", { opacity: 0, duration: 0.15 }, w("e2", 4));
    shot("gelenk", L.e3[0] - 0.05, 530, 960, 1.9, 0.8, 1.03);
    shot("gelenk", w("e3", 2), 530, 960, 2.4, L.b1[1] - w("e3", 2) + 0.2, 1.05);
    tl.to("#g-bubble", { opacity: 1, duration: 0.05 }, w("e3", 2));
    tl.fromTo("#g-bubble", { scale: 0.1, transformOrigin: "50% 50%" }, { scale: 1.15, duration: 0.6, ease: "back.out(1.6)", immediateRender: false }, w("e3", 2));
    look("blase", 0, -8, w("e3", 2), 0.01);
    const PO = L.b1[0] - 0.3;
    tl.to("#g-bubble", { scale: 1.4, duration: 0.08 }, PO - 0.08);
    tl.to("#g-bubble", { opacity: 0, duration: 0.03 }, PO);
    tl.fromTo("#g-pop", { opacity: 1, scale: 0.6, transformOrigin: "50% 50%" }, { scale: 1.5, opacity: 0, duration: 0.4, ease: "power2.out", immediateRender: false }, PO);
    flash(PO, 0.7); hitCam(PO, 1.1); shake("#set-gelenk", PO, 0.25, 10);
    // ---------- 4 Zwanzig Minuten ----------
    shot("gelenk", L.e4[0] - 0.05, 540, 820, 1.0, L.e4[1] - L.e4[0], 1.06);
    tl.to("#g-bone2", { x: 0, duration: 0.4 }, L.e4[0]);
    tl.to("#g-fluid", { attr: { rx: 95 }, duration: 0.4 }, L.e4[0]);
    tl.to("#g-clock", { opacity: 1, duration: 0.1 }, L.e4[0] + 0.3);
    tl.to("#g-hand-m", { rotation: 1080, svgOrigin: "540 520", duration: L.e4[1] - L.e4[0], ease: "power1.in" }, L.e4[0] + 0.3);
    tl.to("#g-clock", { opacity: 0, duration: 0.1 }, L.e4[1] + 0.05);
    // ---------- 5 Aber Vorsicht ----------
    shot("gelenk", L.e5[0] - 0.05, 530, 960, 1.5, 0.8, 1.04);
    tl.to("#g-redtint", { opacity: 1, duration: 0.1 }, L.e5[0]);
    flash(L.e5[0], 0.4); hitCam(w("e5", 1), 1.08);
    shot("gelenk", L.e6[0] - 0.05, 530, 900, 1.25, L.e6[1] - L.e6[0], 1.08);
    tl.to("#g-caps", { scale: 1.2, transformOrigin: "50% 50%", duration: 0.6, ease: "power2.out" }, w("e6", 3));
    tl.to("#g-pain", { opacity: 1, duration: 0.05 }, w("e6", 1));
    tl.to("#g-pain", { scale: 1.2, transformOrigin: "50% 50%", duration: 0.18, yoyo: true, repeat: 7 }, w("e6", 1));
    hitCam(w("e6", 1));
    // ---------- 6 Auflösung ----------
    shot("tisch", L.e7[0] - 0.05, 540, 1000, 1.0, 1.0, 1.06);
    tl.set("#jahr", { textContent: "JAHR 60" }, L.e7[0] - 0.05);
    shot("tisch", w("e7", 3), 540, 900, 1.3, 0.8, 1.05); hitCam(w("e7", 4));
    shot("xray", w("e7", 6), 540, 960, 1.0, L.e7[1] - w("e7", 6) + 0.2, 1.06); flash(w("e7", 6));
    shot("xray", L.e8[0] - 0.05, 285, 1000, 1.5, 1.0, 1.04);
    tl.to("#x-chkL", { opacity: 1, duration: 0.05 }, w("e8", 1));
    tl.fromTo("#x-chkL", { scale: 0.3, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.25, ease: "back.out(3)", immediateRender: false }, w("e8", 1)); hitCam(w("e8", 1));
    shot("xray", w("e8", 2), 795, 1000, 1.5, 1.0, 1.04);
    tl.to("#x-chkR", { opacity: 1, duration: 0.05 }, w("e8", 3));
    tl.fromTo("#x-chkR", { scale: 0.3, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.25, ease: "back.out(3)", immediateRender: false }, w("e8", 3)); hitCam(w("e8", 3));
    shot("xray", L.e9[0] - 0.05, 540, 1100, 1.15, 1.0, 1.04); hitCam(w("e9", 1));
    shot("xray", w("e9", 2), 540, 880, 1.4, 1.2, 1.06);
    tl.to("#x-trophy", { opacity: 1, duration: 0.05 }, w("e9", 3));
    tl.fromTo("#x-trophy", { scale: 0.3, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.35, ease: "back.out(2.5)", immediateRender: false }, w("e9", 3));
    flash(w("e9", 3), 0.6);
    // ---------- 7 Kevin – und der Nacken ----------
    shot("kevin", L.k1[0] - 0.05, 540, 800, 1.4, L.k1[1] - L.k1[0] + 0.1, 1.04);
    tl.set("#oma-pos", { x: 0 }, L.k1[0] - 0.05);
    face("kev", "smirk", L.k1[0] - 0.05); lids("kev", 0.55, L.k1[0] - 0.05); look("kev", -14, 0, L.k1[0] - 0.05);
    talk("kev", L.k1[0], L.k1[1], "smirk");
    shot("kevin", L.e10[0] - 0.05, 540, 900, 1.1, L.e10[1] - L.e10[0] + 0.6, 1.25);
    tl.set("#oma-pos", { x: -420 }, L.e10[0] - 0.05);
    look("kev", 0, 0, L.e10[0]);
    tl.to("#kev-head", { rotation: 16, svgOrigin: "540 900", duration: 0.5, ease: "power2.inOut" }, L.e10[1] - 0.3);
    tl.to("#kev-head", { rotation: -6, svgOrigin: "540 900", duration: 0.07, ease: "power2.in" }, L.e10[1] + 0.25);
    lids("kev", 1, L.e10[1] + 0.25); hitCam(L.e10[1] + 0.3, 1.1);
    const BK = L.e10[1] + 0.4;
    shot("black", BK, 540, 960, 1.0, 1.0, 1.0);
    tl.fromTo("#teil2", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)", immediateRender: true }, BK + 0.25);
    tl.fromTo("#ask", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)", immediateRender: true }, BK + 0.7);
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
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${TF.desk}; }
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
