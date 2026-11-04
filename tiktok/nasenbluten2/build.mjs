// Nasenbluten 2 (Nase von vorne, Profil, Krankenzimmer). Generates index.html + compositions/*.html from script.json.
// Run: node build.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import {
  C,
  S,
  toothFace,
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
// "reuse": dieselbe Aufnahme noch einmal (Cold Open zeigt den Höhepunkt vorweg).
for (const l of script.lines) if (l.reuse && VO[l.reuse]) VO[l.id] = VO[l.reuse];
const ORDER = script.order;
const GAP = {
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

/* ================= Krankenzimmer: Arzt mit Maske + Patient im Bett (wie das Vorbild) ================= */
// Ein Bild für Frage und Erklärung: links steht der Arzt (weißes Haar, Brille,
// grüne Maske, weißer Kittel, grüne Krawatte, Stethoskop) und zeigt das Mittel
// auf der Handfläche, rechts sitzt Kevin im Bett, vorne die weiße Bettdecke.
const ST2 = {
  wall: "#C8D5DC",
  wallLow: "#BCCAD2",
  rail: "#F4F7F8",
  skin: "#F6DAC3",
  skinShade: "#E8C3A6",
  hairDoc: "#E9E9E6",
  hairDocShade: "#C9CAC6",
  hairPat: "#4A2E1F",
  mask: "#2BA84A",
  maskDark: "#1F8A3B",
  coat: "#FAFAFA",
  coatShade: "#E2E5E7",
  shirt: "#1F3550",
  tie: "#2EA04E",
  pants: "#23262B",
  tube: "#2A2A2E",
  steel: "#C9CED3",
  glove: "#F3F1E8",
  sweater: "#3D79C9",
  sweaterDark: "#3166AD",
  sheet: "#FBFBFB",
  fold: "#C9CED3",
  patch: "#EED9B8",
};
const ss = (d, w, col) =>
  `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="${w + 7}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const smallEye = (id, x, y, lid) =>
  `<g transform="translate(${x} ${y})"><clipPath id="${id}-c"><ellipse rx="17" ry="14"/></clipPath>
    <ellipse rx="17" ry="14" fill="#fff"/>
    <g id="${id}-p"><circle r="6.5" fill="${C.ink}"/></g>
    <g clip-path="url(#${id}-c)"><rect id="${id}-lid" x="-22" y="-20" width="44" height="40" fill="${lid}" ${S(3)} vector-effect="non-scaling-stroke"/></g>
    <ellipse rx="17" ry="14" fill="none" ${S(3)}/></g>`;
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
const docEye = (id, x, y) =>
  `<g transform="translate(${x} ${y})"><clipPath id="${id}-c"><ellipse rx="25" ry="21"/></clipPath>
    <ellipse rx="25" ry="21" fill="#fff"/>
    <g id="${id}-p"><circle r="10" fill="${C.ink}"/><circle cx="-3" cy="-3" r="2.6" fill="#fff"/></g>
    <g clip-path="url(#${id}-c)"><rect id="${id}-lid" x="-32" y="-28" width="64" height="56" fill="${P.skin}" ${S(4)} vector-effect="non-scaling-stroke"/></g>
    <ellipse rx="25" ry="21" fill="none" ${S(4)}/></g>`;
const DOC_T = `translate(321 734) scale(0.6) translate(-632 -840)`;
const stationSvg = `
<svg id="st-cam" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${ST2.wall}"/>
  <g transform="translate(560 900) scale(1.3) translate(-560 -900)">
  <rect x="-200" y="0" width="${W + 400}" height="${H}" fill="${ST2.wall}"/>
  <rect x="-200" y="1180" width="${W + 400}" height="${H}" fill="${ST2.wallLow}"/>
  <rect x="-210" y="372" width="${W + 420}" height="22" fill="${ST2.rail}" ${S(3)}/>
  <rect x="975" y="394" width="16" height="1200" fill="${ST2.rail}" ${S(3)}/>
  <rect x="118" y="394" width="12" height="1200" fill="${ST2.rail}" opacity="0.7"/>

  <!-- Kissen + Patient -->
  <rect x="840" y="830" width="300" height="440" rx="70" fill="${ST2.sheet}" ${S(3.5)}/>
  <path d="M 870 900 C 920 940 960 1040 950 1180" fill="none" stroke="${ST2.fold}" stroke-width="16" stroke-linecap="round" opacity="0.7"/>
  <g id="pat">
    <path d="M 640 1440 L 660 1020 C 670 960 730 936 800 936 C 880 936 945 960 962 1022 L 1000 1440 Z" fill="${ST2.sweater}" ${S(3.5)}/>
    <path d="M 742 936 L 800 1000 L 858 936 L 836 920 L 800 962 L 764 920 Z" fill="#fff" ${S(3)}/>
    <rect x="770" y="880" width="60" height="62" fill="${ST2.skin}" ${S(3.5)}/>
    <ellipse cx="892" cy="800" rx="17" ry="28" fill="${ST2.skin}" ${S(3.5)}/>
    <g id="pat-head">
      <ellipse cx="800" cy="790" rx="94" ry="112" fill="${ST2.skin}" ${S(3.5)}/>
      <path d="M 706 776 C 694 676 740 650 800 650 C 872 650 910 684 898 778 C 884 734 862 714 838 708 C 800 724 756 720 728 708 C 716 730 708 752 706 776 Z" fill="${ST2.hairPat}" ${S(3.5)}/>
      ${smallEye("pe1", 762, 790, ST2.skin)}${smallEye("pe2", 828, 790, ST2.skin)}
      <path id="pat-browL" d="M 744 760 Q 762 752 780 758" fill="none" ${S(4)}/>
      <path id="pat-browR" d="M 812 758 Q 830 752 848 760" fill="none" ${S(4)}/>
      <path d="M 790 806 q -8 20 6 24" fill="none" ${S(3)}/>
      <g transform="translate(792 860)">${mouth("pm-m", { s: 0.5, initial: "flat" })}</g>
    </g>
    <path id="pat-arm-o" d="M 676 1060 C 650 1180 664 1280 706 1336" fill="none" stroke="${C.ink}" stroke-width="77" stroke-linecap="round"/>
    <path id="pat-arm-i" d="M 676 1060 C 650 1180 664 1280 706 1336" fill="none" stroke="${ST2.sweater}" stroke-width="70" stroke-linecap="round"/>
    <g id="pat-hand">
      <g id="pat-fing" opacity="0"><rect x="716" y="1250" width="26" height="90" rx="13" fill="${ST2.skin}" ${S(3)}/>
        <g transform="translate(729 1290)">${toothFace("pfi", { r: 6, gap: 6, mouthY: 10, mouthS: 0.1, mouthInit: "smile", lidFill: ST2.skin, pupil: 0.3, sw: 2 })}</g></g>
      <path d="M 690 1320 C 720 1300 760 1310 766 1340 C 770 1366 740 1378 712 1372 C 690 1366 680 1340 690 1320 Z" fill="${ST2.skin}" ${S(3.5)}/>
    </g>
  </g>

  <!-- Arzt -->
  <g id="doc">
    <g transform="${DOC_T}">
    <g id="doc-tail">
      <path d="M 458 945 C 390 960 312 1002 280 1080 C 256 1140 246 1220 282 1305 C 292 1250 306 1214 326 1186 C 316 1240 326 1282 356 1316 C 356 1236 372 1162 412 1090 C 436 1046 456 1008 470 974 Z" fill="${P.hair}" ${S()}/>
      <path d="M 300 1130 C 300 1180 296 1220 300 1260 M 340 1100 C 336 1150 340 1200 348 1250" fill="none" stroke="${P.hairShade}" stroke-width="5" stroke-linecap="round"/>
      <path d="M 262 1210 C 240 1240 232 1270 240 1300 M 372 1120 C 390 1160 392 1200 384 1240" fill="none" ${S(3)}/>
    </g>
    </g>
    <path d="M 246 1380 L 404 1380 L 414 1900 L 340 1900 L 326 1520 L 314 1900 L 240 1900 Z" fill="${ST2.pants}" ${S(3.5)}/>
    <path d="M 232 930 C 262 902 382 902 412 930 L 420 1410 L 222 1410 Z" fill="${P.shirt}" ${S(3.5)}/>
    <path d="M 306 930 L 336 930 L 348 1190 L 321 1226 L 294 1190 Z" fill="${P.tie}" ${S(3.5)}/>
    <path d="M 292 912 L 321 950 L 350 912" fill="#fff" ${S(3)}/>
    <path d="M 172 960 C 182 922 232 906 284 902 L 302 1010 L 292 1500 L 158 1500 C 148 1310 150 1110 172 960 Z" fill="${ST2.coat}" ${S(3.5)}/>
    <path d="M 470 960 C 460 922 410 906 358 902 L 340 1010 L 350 1500 L 484 1500 C 494 1310 492 1110 470 960 Z" fill="${ST2.coat}" ${S(3.5)}/>
    <path d="M 200 1100 C 196 1250 196 1380 204 1480" fill="none" stroke="${ST2.coatShade}" stroke-width="12" stroke-linecap="round"/>
    <rect x="291" y="850" width="60" height="64" fill="${ST2.skin}" ${S(3.5)}/>
    ${ss("M 272 908 C 232 990 240 1086 296 1126", 8, ST2.tube)}
    ${ss("M 372 908 C 410 990 404 1064 384 1112", 8, ST2.tube)}
    <circle cx="384" cy="1132" r="18" fill="${ST2.steel}" ${S(3.5)}/>
    ${ss("M 186 990 C 168 1120 166 1260 176 1360", 74, ST2.coat)}
    <path d="M 160 1356 C 186 1346 206 1360 204 1386 C 202 1408 178 1416 160 1406 C 146 1396 146 1366 160 1356 Z" fill="${ST2.skin}" ${S(3.5)}/>
    <g id="doc-arm">
      ${ss("M 452 978 C 500 1060 540 1130 620 1166", 72, ST2.coat)}
      <path d="M 616 1140 C 650 1130 730 1136 748 1156 C 760 1172 740 1186 706 1186 L 640 1192 C 618 1192 606 1176 616 1140 Z" fill="${ST2.glove}" ${S(3.5)}/>
      <path d="M 640 1150 C 650 1130 672 1126 684 1140" fill="none" ${S(3)}/>
      <g transform="translate(688 1124) rotate(-8)"><path d="M -40 6 C -46 -18 -20 -30 0 -22 C 20 -32 46 -18 40 6 C 30 20 -30 20 -40 6 Z" fill="#FBFBFA" ${S(3)}/><path d="M -20 -4 C -22 -16 -6 -20 2 -12 C 10 -18 22 -10 14 0 C 6 8 -14 6 -20 -4 Z" fill="#D0142A" opacity="0.85"/></g>
    </g>
    <g id="doc-head"><g transform="${DOC_T}">
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

    <g id="doc-headO">
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

    </g></g>
  </g>

  <!-- Bettdecke vorne -->
  <path d="M 380 1470 C 520 1400 700 1372 880 1380 C 990 1386 1060 1400 1110 1420 L 1300 1420 L 1300 1960 L 380 1960 C 356 1760 356 1600 380 1470 Z" fill="${ST2.sheet}" ${S(3.5)}/>
  ${[
    "M 470 1520 C 560 1480 680 1470 760 1500",
    "M 520 1640 C 640 1590 820 1600 940 1640",
    "M 820 1450 C 900 1460 980 1500 1040 1560",
    "M 430 1760 C 560 1720 720 1740 860 1790",
  ]
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="${ST2.fold}" stroke-width="22" stroke-linecap="round" opacity="0.8"/>`,
    )
    .join("")}
  </g>
</svg>`;
const stationJs = `${HELPERS}
    const S0 = ${SC.station[0]}, S1 = ${SC.station[1]};
    const PL = ["#pe1-lid", "#pe2-lid"], PP = ["#pe1-p", "#pe2-p"];
    const DL = ["#de1-lid", "#de2-lid"], DP = ["#de1-p", "#de2-p"];
    gsap.set(PL, { scaleY: 0.1, svgOrigin: "0 -20" });
    gsap.set(DL, { scaleY: 0.3, svgOrigin: "0 -28" });
    gsap.set(PP, { x: -7, y: -1 });
    gsap.set(DP, { x: 9, y: 3 });
    gsap.set("#doc-head", { svgOrigin: "321 850" });
    gsap.set("#pat-head", { svgOrigin: "800 900" });
    gsap.set("#doc-arm", { svgOrigin: "452 978" });
    const blinkP = (t, v = 0.1) => { tl.to(PL, { scaleY: 1, duration: 0.06 }, t); tl.to(PL, { scaleY: v, duration: 0.09 }, t + 0.07); };
    const blinkD = (t, v = 0.3) => { tl.to(DL, { scaleY: 1, duration: 0.06 }, t); tl.to(DL, { scaleY: v, duration: 0.09 }, t + 0.07); };
    const q = ${JSON.stringify(L.q1)};
    const D = ${JSON.stringify(lines.filter((l) => l.speaker === "arzt" && LINE_SCENE[l.id] === "station" && l.id !== "e2").map((l) => [l.start, l.end]))};
    // Kevin fragt, der Arzt hört zu.
    tl.to("#pat-browL", { rotation: -10, svgOrigin: "780 758", duration: 0.2 }, q[0]);
    tl.to("#pat-browR", { rotation: 10, svgOrigin: "812 758", duration: 0.2 }, q[0]);
    talk("pm", q[0], q[1], "flat", 0.12);
    tl.to("#doc-head", { rotation: 3, duration: 0.6, ease: "sine.inOut" }, q[0] + 0.3);
    blinkD(q[0] + 1.4);
    tl.to("#pat-browL", { rotation: 0, duration: 0.3 }, q[1]);
    tl.to("#pat-browR", { rotation: 0, duration: 0.3 }, q[1]);
    // Der Arzt erklärt und zeigt das Pickelpflaster auf der Handfläche.
    D.forEach(([a, b], i) => {
      talk("doc", a, b, "smile", 0.12);
      tl.to("#doc-head", { rotation: i % 2 ? -2 : 2, duration: 0.6, ease: "sine.inOut" }, a);
      tl.to("#doc-brows", { y: -8, duration: 0.18 }, a);
      tl.to("#doc-brows", { y: 0, duration: 0.3 }, a + 0.6);
      tl.to("#doc-arm", { rotation: -3, duration: 0.5, yoyo: true, repeat: 1, ease: "sine.inOut" }, a + 0.4);
      for (let t = a + 1.3; t < b - 0.3; t += 2.4) blinkD(t);
      // Kevin hört zu: Augen zu und nicken, dann wieder aufmachen.
      tl.to(PL, { scaleY: 0.85, duration: 0.2 }, a + 0.8);
      tl.to("#pat-head", { rotation: -3, duration: 0.25, yoyo: true, repeat: 1 }, a + 1.0);
      tl.to(PL, { scaleY: 0.1, duration: 0.2 }, Math.min(b, a + 2.6));
      for (let t = a + 3.4; t < b - 0.3; t += 2.2) blinkP(t);
    });
    // Pointe: Kevins Finger wandert schon wieder zur Nase.
    const e1 = ${JSON.stringify(L.e1)}, e2 = ${JSON.stringify(L.e2)};
    const RA = e1[0] - 0.6;
    tl.to(["#pat-arm-o", "#pat-arm-i"], { attr: { d: "M 676 1060 C 630 1000 690 920 744 905" }, duration: 0.5, ease: "power2.inOut" }, RA);
    tl.to("#pat-hand", { x: 26, y: -440, duration: 0.5, ease: "power2.inOut" }, RA);
    tl.to("#pat-fing", { opacity: 1, duration: 0.1 }, RA + 0.3);
    talk("pfi", e1[0], e1[1], "smile", 0.1);
    tl.to(PP, { x: 0, y: 8, duration: 0.2 }, RA + 0.2);
    tl.to(DP, { x: 12, y: 6, duration: 0.2 }, e1[1] - 0.2);
    tl.to("#doc-brows", { y: 8, duration: 0.15 }, e2[0]);
    talk("doc", e2[0], e2[1], "frown", 0.12);
    tl.to("#doc-head", { rotation: 5, duration: 0.15, yoyo: true, repeat: 1 }, e2[0]);
    tl.to(["#pat-arm-o", "#pat-arm-i"], { attr: { d: "M 676 1060 C 650 1180 664 1280 706 1336" }, duration: 0.35, ease: "power2.in" }, e2[1] - 0.1);
    tl.to("#pat-hand", { x: 0, y: 0, duration: 0.35, ease: "power2.in" }, e2[1] - 0.1);
    tl.to(PP, { x: -7, y: -1, duration: 0.2 }, e2[1]);
    tl.to("#pat-fing", { opacity: 0, duration: 0.1 }, e2[1] + 0.1);
    tl.fromTo("#ask", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)", immediateRender: true }, e2[1] + 0.3);
`;

/* ================= Szene 1: Nase von vorne (Kevin bohrt), Lupe zeigt das Äderchen ================= */
const TF = {
  skin: "#F6DCC4",
  skinShade: "#E8BFA0",
  skinDeep: "#D9A684",
  nostril: "#5A2E2A",
  lip: "#D98C84",
  lipDark: "#C4756E",
  blood: "#D0142A",
  bloodDark: "#A10E21",
  mucosa: "#EE9DA0",
  vessel: "#C8434F",
  tissue: "#FBFBFA",
  tissueShade: "#E4E7EA",
  nail: "#F6DCD6",
  dirt: "#6E6259",
  hair: "#4A2E1F",
  air: "#CFE8F5",
};
const NL = { x: 418, y: 1110 }; // linkes Nasenloch (Bildseite)
const browPair = (id, gap, r, y) =>
  `<path id="${id}-browL" d="M ${-gap - r * 0.6} ${y + 3} Q ${-gap} ${y - 5} ${-gap + r * 0.6} ${y + 3}" fill="none" ${S(3)}/>` +
  `<path id="${id}-browR" d="M ${gap - r * 0.6} ${y + 3} Q ${gap} ${y - 5} ${gap + r * 0.6} ${y + 3}" fill="none" ${S(3)}/>`;
const v2Face = (id, r, lid, mouthInit = "flat") =>
  `${toothFace(id, { r, gap: r * 1.02, mouthY: r * 1.6, mouthS: r / 72, mouthInit, lidFill: lid, pupil: 0.24, sw: 3.5 })}${browPair(id, r * 1.02, r, -r * 1.4)}`;
const tissue = (id) => `
  <g id="${id}">
    <path d="M -120 -40 C -140 -110 -60 -150 -10 -120 C 30 -160 120 -140 120 -70 C 170 -40 150 60 90 70 C 70 120 -40 130 -70 80 C -150 80 -160 0 -120 -40 Z" fill="${TF.tissue}" ${S(3.5)}/>
    <path d="M -80 -60 C -40 -80 10 -70 40 -90 M -60 40 C -20 30 40 40 80 20" fill="none" stroke="${TF.tissueShade}" stroke-width="8" stroke-linecap="round"/>
    <g id="${id}-stain" opacity="0"><path d="M -100 -30 C -110 -70 -60 -90 -40 -60 C -20 -90 20 -60 0 -30 C 20 0 -20 30 -50 10 C -80 30 -110 10 -100 -30 Z" fill="${TF.blood}" opacity="0.85"/></g>
    <g transform="translate(30 -10)">${v2Face(id, 26, TF.tissue)}</g>
    <path d="M 100 60 C 140 70 170 110 160 160 L 220 220" fill="none" stroke="${C.ink}" stroke-width="64" stroke-linecap="round"/>
    <path d="M 100 60 C 140 70 170 110 160 160 L 220 220" fill="none" stroke="${TF.skin}" stroke-width="56" stroke-linecap="round"/>
  </g>`;
const frontSvg = (p) => `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
 <g id="${p}cam">
  <defs>
    <radialGradient id="${p}skinG" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#FAE6D3"/><stop offset="1" stop-color="${TF.skin}"/></radialGradient>
    <clipPath id="${p}finC"><rect x="0" y="${NL.y + 2}" width="${W}" height="1000"/><ellipse cx="${NL.x}" cy="${NL.y}" rx="44" ry="16" transform="rotate(-8 ${NL.x} ${NL.y})"/></clipPath>
    <clipPath id="${p}lupeC"><circle cx="770" cy="640" r="200"/></clipPath>
  </defs>
  <rect x="-200" y="-200" width="${W + 400}" height="${H + 400}" fill="url(#${p}skinG)"/>
  <g transform="translate(540 1000) scale(1.6) translate(-510 -1010)">
  <rect x="-400" y="-400" width="${W + 800}" height="${H + 800}" fill="url(#${p}skinG)"/>
  <ellipse cx="200" cy="1180" rx="140" ry="90" fill="#F2B9A6" opacity="0.45"/>
  <ellipse cx="840" cy="1180" rx="140" ry="90" fill="#F2B9A6" opacity="0.45"/>
  <path d="M 432 300 C 424 560 404 790 362 958" fill="none" stroke="${TF.skinShade}" stroke-width="16" stroke-linecap="round"/>
  <path d="M 588 300 C 596 560 616 790 658 958" fill="none" stroke="${TF.skinShade}" stroke-width="16" stroke-linecap="round"/>
  <path d="M 440 620 C 432 760 410 880 372 960" fill="none" ${S(3.5)}/>
  <ellipse cx="510" cy="1010" rx="122" ry="104" fill="#F9E2CE"/>
  <path d="M 430 970 C 460 940 560 940 590 970" fill="none" stroke="#FFF3E6" stroke-width="14" stroke-linecap="round"/>
  <path d="M 362 958 C 298 990 290 1080 350 1110 C 378 1124 404 1120 424 1114" fill="none" ${S(4)}/>
  <path d="M 658 958 C 722 990 730 1080 670 1110 C 642 1124 616 1120 596 1114" fill="none" ${S(4)}/>
  <path d="M 446 1120 C 476 1132 544 1132 574 1120" fill="none" ${S(3.5)}/>
  <ellipse cx="${NL.x}" cy="${NL.y}" rx="44" ry="16" transform="rotate(-8 ${NL.x} ${NL.y})" fill="${TF.nostril}"/>
  <ellipse cx="602" cy="${NL.y}" rx="44" ry="16" transform="rotate(8 602 ${NL.y})" fill="${TF.nostril}"/>
  <path d="M 486 1150 C 480 1220 478 1260 474 1300 M 534 1150 C 540 1220 542 1260 546 1300" fill="none" stroke="${TF.skinDeep}" stroke-width="6" stroke-linecap="round"/>
  <path d="M 320 1324 C 400 1290 470 1300 510 1314 C 550 1300 620 1290 700 1324 C 620 1346 400 1346 320 1324 Z" fill="${TF.lip}" ${S(3.5)}/>
  <path d="M 330 1328 C 420 1344 600 1344 690 1328" fill="none" stroke="${TF.lipDark}" stroke-width="5"/>
  <g id="${p}blood"><path d="M 400 1112 C 398 1180 396 1236 404 1286 C 408 1316 432 1316 436 1286 C 442 1236 440 1180 438 1112 Z" fill="${TF.blood}" ${S(2.5)}/>
    <path d="M 410 1130 C 409 1170 409 1210 412 1250" fill="none" stroke="#F0596A" stroke-width="6" stroke-linecap="round"/></g>
  ${Array.from({ length: 5 }, (_, i) => `<circle id="${p}drop${i}" r="${11 + (i % 2) * 3}" fill="${TF.blood}" ${S(2.5)} opacity="0"/>`).join("")}
  <g clip-path="url(#${p}finC)"><g id="${p}fin-pos"><g transform="rotate(-6)">
    <rect x="-56" y="-30" width="112" height="760" rx="56" fill="${TF.skin}" ${S(3.5)}/>
    <rect x="-36" y="-20" width="72" height="80" rx="28" fill="${TF.nail}" ${S(3)}/>
    <path d="M -46 260 q 46 -16 92 0 M -46 410 q 46 -16 92 0" fill="none" stroke="${TF.skinDeep}" stroke-width="6" stroke-linecap="round"/>
  </g></g></g>
  <g id="${p}t1-pos">${tissue(p + "tuch")}</g>
  <g id="${p}t2-pos">${tissue(p + "tuch2")}</g>
  </g>
  <!-- Lupe: innen kratzt der Nagel ein Äderchen auf -->
  <g transform="translate(-10 -90)"><g id="${p}lupe" opacity="0">
    <path d="M 640 800 L 425 1215" fill="none" stroke="${C.ink}" stroke-width="5" stroke-dasharray="14 10"/>
    <g clip-path="url(#${p}lupeC)">
      <rect x="560" y="430" width="420" height="420" fill="${TF.mucosa}"/>
      <path d="M 600 520 C 700 560 760 520 860 560 M 620 600 C 700 640 800 600 900 640 M 640 700 C 720 720 820 690 920 720 M 720 540 C 740 600 730 660 760 720" fill="none" stroke="${TF.vessel}" stroke-width="12" stroke-linecap="round"/>
      <g transform="translate(770 620)"><circle r="34" fill="${TF.vessel}" ${S(3)}/>${v2Face(p + "ader", 12, TF.vessel, "smile")}</g>
      <g id="${p}spurt" opacity="0"><path d="M 770 620 C 720 640 700 700 720 760 C 740 800 800 800 820 760 C 840 700 820 640 770 620 Z" fill="${TF.blood}" ${S(3)}/></g>
      <g id="${p}nail-pos"><path d="M -60 120 L -40 10 C -36 -20 36 -20 40 10 L 60 120 Z" fill="${TF.skin}" ${S(3.5)}/>
        <path d="M -34 20 C -30 -6 30 -6 34 20 L 30 60 L -30 60 Z" fill="${TF.nail}" ${S(3)}/>
        <path d="M -30 0 Q 0 -14 30 0" fill="none" stroke="${TF.dirt}" stroke-width="6" stroke-linecap="round"/></g>
    </g>
    <circle cx="770" cy="640" r="200" fill="none" stroke="${C.ink}" stroke-width="10"/>
    <circle cx="770" cy="640" r="200" fill="none" stroke="#fff" stroke-width="4"/>
  </g></g>
 </g>
</svg>`;
const frontJs = `${HELPERS}
    const BROW = { angry: [18, -18], panic: [-16, 16], worried: [-14, 14], smug: [-12, 4], happy: [-6, 6], flat: [0, 0] };
    const brows = (ch, mood, t) => {
      const [l, r] = BROW[mood] || [0, 0];
      tl.to("#" + ch + "-browL", { rotation: l, svgOrigin: "0 0", duration: 0.15 }, t);
      tl.to("#" + ch + "-browR", { rotation: r, svgOrigin: "0 0", duration: 0.15 }, t);
    };
    initChar("@tuch", 26, 0.15); initChar("@tuch2", 26, 0.15); initChar("@ader", 12, 0.1);
    const L = ${JSON.stringify(L)};
    const S0 = ${SC.front[0]};
    gsap.set("#@cam", { svgOrigin: "540 960" });
    gsap.set("#@blood", { scaleY: 0, svgOrigin: "${NL.x} ${NL.y}" });
    gsap.set("#@fin-pos", { x: ${NL.x}, y: ${NL.y - 26} });
    gsap.set("#@nail-pos", { x: 660, y: 780, rotation: 20, svgOrigin: "0 0" });
    gsap.set(["#@t1-pos", "#@t2-pos"], { x: 1400, y: 1250, rotation: 20, svgOrigin: "0 0" });
    gsap.set("#@lupe", { transformOrigin: "50% 50%" });
    // Frame 0: der Finger bohrt schon.
    for (let t = S0, i = 0; t < L.k2[0] - 0.5; t += 0.16, i++)
      tl.to("#@fin-pos", { y: ${NL.y - 26} + (i % 2 ? 10 : -6), x: ${NL.x} + (i % 3 - 1) * 5, duration: 0.15, ease: "sine.inOut" }, t);
    // Lupe: Nagel kratzt, das Äderchen platzt.
    const LU = L.k1[0] + 0.9;
    tl.fromTo("#@lupe", { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(1.8)", immediateRender: false }, LU);
    look("@ader", 0, 12, LU, 0.01);
    for (let t = LU + 0.3, i = 0; t < L.k2[0] - 0.4; t += 0.15, i++)
      tl.to("#@nail-pos", { x: 700 + (i % 2) * 40, y: 690 - (i % 2) * 10, duration: 0.14, ease: "sine.inOut" }, t);
    const BU = L.k2[0] - 0.5;
    squeeze("@ader", true, BU);
    tl.to("#@spurt", { opacity: 1, duration: 0.05 }, BU);
    tl.fromTo("#@spurt", { scale: 0.2, transformOrigin: "50% 0%" }, { scale: 1.3, duration: 0.5, ease: "power2.out", immediateRender: false }, BU);
    tl.to("#@lupe", { opacity: 0, scale: 0.4, duration: 0.25, ease: "power2.in" }, L.k2[1] + 0.3);
    // Finger raus, Blut läuft.
    tl.to("#@fin-pos", { y: 1900, duration: 0.45, ease: "power2.in" }, BU + 0.1);
    tl.to("#@blood", { scaleY: 1, duration: 0.6, ease: "power1.in" }, BU + 0.3);
    shake("#@cam", BU, 0.25, 6);
    const drips = (t0, t1) => {
      for (let t = t0, k = 0; t < t1; t += 0.42, k++) {
        const c = "#@drop" + (k % 5);
        tl.set(c, { opacity: 1, x: 420, y: 1300 }, t);
        tl.to(c, { y: 1640, duration: 0.42, ease: "power2.in" }, t);
        tl.set(c, { opacity: 0 }, t + 0.42);
      }
    };
    drips(BU + 0.9, L.t1[0] - 1.1);
    // Taschentuch 1 tupft, kommt rot zurück und beschwert sich; Blut läuft weiter.
    const wipe = (k, t0) => {
      tl.to("#@" + k + "-pos", { x: ${NL.x + 30}, y: ${NL.y + 70}, rotation: 0, duration: 0.4, ease: "power2.out" }, t0);
      tl.to("#@blood", { scaleY: 0.15, duration: 0.2 }, t0 + 0.35);
      tl.to("#@" + k + "-pos", { x: ${NL.x + 30}, y: ${NL.y + 80}, duration: 0.12, yoyo: true, repeat: 3 }, t0 + 0.4);
      tl.to("#@" + (k === "t1" ? "tuch" : "tuch2") + "-stain", { opacity: 1, duration: 0.1 }, t0 + 0.5);
      tl.to("#@" + k + "-pos", { x: 600, y: 1210, rotation: 8, duration: 0.4, ease: "power2.inOut" }, t0 + 0.9);
      tl.to("#@blood", { scaleY: 1.15, duration: 0.8, ease: "power1.in" }, t0 + 1.0);
    };
    wipe("t1", L.t1[0] - 1.1);
    tl.to("#@t1-pos", { x: 1400, y: 1500, rotation: 40, duration: 0.4, ease: "power2.in" }, L.t1[1] + 0.1);
    wipe("t2", L.t2[0] - 1.1);
    tl.to("#@blood", { scaleY: 1.3, duration: 0.6 }, L.t2[1] - 0.6);
    drips(L.t2[0] + 0.2, ${SC.front[1]} - 0.1);
    face("@tuch", "frown", S0); face("@tuch2", "frown", S0);
    brows("@tuch", "panic", L.t1[0]); squeeze("@tuch", true, L.t1[0]); squeeze("@tuch", false, L.t1[0] + 0.4);
    talk("@tuch", L.t1[0], L.t1[1], "frown");
    brows("@tuch2", "panic", L.t2[0]); look("@tuch2", -10, 0, L.t2[0]);
    talk("@tuch2", L.t2[0], L.t2[1], "wavy");
`;

/* ================= Szene 2: Profil – Kopf in den Nacken (falsch), dann vorbeugen + zudrücken ================= */
const HEADP =
  "M 1300 160 L 560 160 C 450 170 390 290 380 420 C 372 520 400 600 380 660 C 340 760 240 860 196 920 C 176 950 186 985 220 992 C 250 996 280 986 300 992 C 312 1012 300 1040 296 1060 C 290 1090 300 1110 300 1120 C 300 1140 296 1160 300 1180 C 310 1230 296 1280 330 1320 C 380 1370 470 1380 520 1400 C 560 1460 560 1560 560 1700 L 560 2200 L 1300 2200 Z";
const XRAY =
  "M 238 990 C 236 950 262 912 310 896 L 640 770 C 704 748 764 780 772 842 L 792 1700 L 690 1700 L 680 992 C 676 952 660 932 630 934 L 302 980 C 282 984 264 992 254 1000 Z";
const BLF = "M 300 930 C 280 950 262 975 250 998";
const BLB = "M 320 930 C 420 940 560 930 650 940 C 700 950 720 990 726 1060 L 736 1700";
const profilSvg = (p) => `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
 <rect width="${W}" height="${H}" fill="${TF.air}"/>
 <g id="${p}cam"><g transform="translate(470 900) scale(1.35) translate(-380 -900)"><g id="${p}tilt">
  <rect x="-900" y="-900" width="${W + 1800}" height="${H + 1800}" fill="${TF.air}"/>
  <path d="${HEADP}" fill="${TF.skin}" ${S(3.5)}/>
  <path d="M 1300 160 L 560 160 C 470 168 410 250 392 360 C 470 300 560 290 640 320 C 760 300 900 320 1300 330 Z" fill="${TF.hair}" ${S(3.5)}/>
  <ellipse cx="780" cy="720" rx="50" ry="78" fill="${TF.skin}" ${S(3.5)}/>
  <path d="M 770 690 C 790 700 796 740 780 760" fill="none" ${S(3)}/>
  <path id="${p}eyeO" d="M 412 602 C 424 578 464 576 480 598 C 464 620 428 622 412 602 Z" fill="#fff" ${S(3.5)}/>
  <circle id="${p}eyeP" cx="432" cy="600" r="10" fill="${C.ink}"/>
  <path id="${p}eyeC" d="M 410 604 C 430 620 462 620 482 600" fill="none" ${S(4)} opacity="0"/>
  <path d="M 404 560 C 428 540 468 540 492 554" fill="none" ${S(6)}/>
  <path d="M 214 986 C 230 980 250 982 262 990" fill="none" ${S(3)}/>
  <path d="M 300 1120 C 320 1124 340 1124 352 1118" fill="none" ${S(3)}/>
  <path d="${XRAY}" fill="#F0B4AA" opacity="0.45"/>
  <path d="${XRAY}" fill="none" stroke="#C4756E" stroke-width="4" stroke-dasharray="10 8" opacity="0.7"/>
  <path id="${p}blb" d="${BLB}" fill="none" stroke="${TF.blood}" stroke-width="16" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>
  <path id="${p}blf" d="${BLF}" fill="none" stroke="${TF.blood}" stroke-width="16" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0"/>
  ${Array.from({ length: 4 }, (_, i) => `<circle id="${p}drop${i}" r="${9 + (i % 2) * 3}" fill="${TF.blood}" ${S(2.5)} opacity="0"/>`).join("")}
  <g id="${p}hand-pos">
    <path id="${p}hfA-o" d="M 170 820 C 200 850 220 890 222 930" fill="none" stroke="${C.ink}" stroke-width="58" stroke-linecap="round"/>
    <path id="${p}hfB-o" d="M 150 880 C 150 930 168 976 194 1004" fill="none" stroke="${C.ink}" stroke-width="58" stroke-linecap="round"/>
    <path id="${p}hfA-i" d="M 170 820 C 200 850 220 890 222 930" fill="none" stroke="${TF.skin}" stroke-width="50" stroke-linecap="round"/>
    <path id="${p}hfB-i" d="M 150 880 C 150 930 168 976 194 1004" fill="none" stroke="${TF.skin}" stroke-width="50" stroke-linecap="round"/>
    <path d="M 120 760 C 60 820 50 920 120 960 C 150 976 170 960 160 900 Z" fill="${TF.skin}" ${S(3.5)}/>
    <path d="M 120 960 L -200 1300" stroke="${C.ink}" stroke-width="128" stroke-linecap="round"/>
    <path d="M 120 960 L -200 1300" stroke="#3D79C9" stroke-width="120" stroke-linecap="round"/>
  </g>
 </g></g></g>
 <g id="${p}timer" opacity="0">
  <circle cx="230" cy="480" r="78" fill="#fff" ${S(4)}/>
  <circle id="${p}timerArc" cx="230" cy="480" r="62" fill="none" stroke="#3D9BE0" stroke-width="16" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" transform="rotate(-90 230 480)"/>
  <text x="230" y="494" text-anchor="middle" font-family="Montserrat, sans-serif" font-weight="900" font-size="38" fill="#1d1414">10 Min</text>
 </g>
</svg>`;
const profilJs = `${HELPERS}
    const L = ${JSON.stringify(L)};
    const S0 = ${SC.profil[0]}, S1 = ${SC.profil[1]};
    gsap.set("#@tilt", { svgOrigin: "560 1300" });
    gsap.set("#@hand-pos", { x: -700, y: 500 });
    const drips = (t0, t1) => {
      for (let t = t0, k = 0; t < t1; t += 0.42, k++) {
        const c = "#@drop" + (k % 4);
        tl.set(c, { opacity: 1, x: 250, y: 1000 }, t);
        tl.to(c, { y: 1500, duration: 0.5, ease: "power2.in" }, t);
        tl.set(c, { opacity: 0 }, t + 0.5);
      }
    };
    drips(S0 + 0.1, L.k3[1]);
    // Falsch: Kopf in den Nacken, das Blut läuft nach hinten in den Hals.
    const TB = L.k3[1] - 0.3;
    tl.to("#@tilt", { rotation: 22, duration: 0.6, ease: "power2.inOut" }, TB);
    tl.to("#@blf", { strokeDashoffset: -1, duration: 0.3 }, TB + 0.3);
    tl.to("#@blb", { strokeDashoffset: 0, duration: 1.1, ease: "power1.inOut" }, TB + 0.4);
    tl.to("#@eyeP", { attr: { cx: 446, cy: 592 }, duration: 0.3 }, TB + 0.6);
    shake("#@cam", L.k4[0], 0.4, 8);
    // Richtig: nach vorne beugen und die weiche Nase zudrücken.
    const FW = L.k4[1] + 0.2;
    tl.to("#@tilt", { rotation: -10, duration: 0.6, ease: "power2.inOut" }, FW);
    tl.to("#@blb", { strokeDashoffset: -1, duration: 0.6 }, FW + 0.1);
    tl.set("#@blf", { strokeDashoffset: 1 }, FW + 0.1);
    tl.to("#@blf", { strokeDashoffset: 0, duration: 0.3 }, FW + 0.3);
    drips(FW + 0.5, L.k5[1] + 1.6);
    tl.to("#@hand-pos", { x: 0, y: 0, duration: 0.55, ease: "power2.out" }, L.k5[1] + 0.2);
    const PI = L.k5[1] + 0.8;
    ["A", "B"].forEach((k) => {
      tl.to(["#@hf" + k + "-o", "#@hf" + k + "-i"], { attr: { d: k === "A" ? "M 170 820 C 206 852 236 892 242 938" : "M 150 880 C 160 930 186 972 214 998" }, duration: 0.3, ease: "power2.inOut" }, PI);
    });
    tl.to("#@eyeO", { opacity: 0, duration: 0.1 }, PI);
    tl.to("#@eyeP", { opacity: 0, duration: 0.1 }, PI);
    tl.to("#@eyeC", { opacity: 1, duration: 0.1 }, PI);
    tl.to("#@blf", { strokeDashoffset: -1, duration: 0.9, ease: "power1.in" }, PI + 0.6);
    tl.to("#@timer", { opacity: 1, duration: 0.2 }, PI + 0.2);
    tl.to("#@timerArc", { strokeDashoffset: 0, duration: 1.6, ease: "none" }, PI + 0.3);
    tl.to("#@timer", { scale: 1.1, transformOrigin: "50% 50%", duration: 0.12, yoyo: true, repeat: 1 }, PI + 1.9);
`;

const askBody = `<div id="ask"><div class="ask-1">Bohrst du in der Nase?</div><div class="ask-2">Ja oder Nein – schreib's in die Kommentare ↓</div></div>`;
const askCss = `#ask { position: absolute; left: 0; right: 0; top: 390px; margin: 0 auto; width: max-content; padding: 12px 30px;
  border-radius: 34px; background: #FFE14D; color: #1d1414; border: 5px solid #1d1414; font-family: "Montserrat", sans-serif;
  font-weight: 900; font-size: 44px; opacity: 0; text-align: center; line-height: 1.2; }
  #ask .ask-2 { font-size: 30px; font-weight: 800; }`;
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

// Stil v2: kleine, ruhige Untertitel unten im Bild.
const CAP_EMPH_CSS = `
  .cap { --cap-y: 1400px; font-size: 58px; -webkit-text-stroke: 10px #1d1414; text-shadow: 0 4px 0 rgba(0,0,0,0.3); }`;

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
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${TF.skin}; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}">
${host("front", 1)}
${host("profil", 2)}
${host("station", 3)}
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
const pre = (p, js) => js.replaceAll("@", p);
out("./index.html", index);
out("./compositions/front.html", page("front", SC.front, frontSvg("f-"), "", pre("f-", frontJs)));
out(
  "./compositions/profil.html",
  page("profil", SC.profil, profilSvg("p-"), "", pre("p-", profilJs)),
);
out(
  "./compositions/station.html",
  page("station", SC.station, stationSvg + askBody, askCss, stationJs),
);
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
