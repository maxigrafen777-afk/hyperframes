// Pickel (Haut-Querschnitt, Stil v2). Generates index.html + compositions/*.html from script.json.
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
  haut: 0.6,
  station: 1.2,
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
      <g transform="translate(852 836) rotate(-14)"><rect x="-26" y="-14" width="52" height="28" rx="11" fill="${ST2.patch}" ${S(3)}/></g>
    </g>
    ${ss("M 676 1060 C 650 1180 664 1280 706 1336", 70, ST2.sweater)}
    <path d="M 690 1320 C 720 1300 760 1310 766 1340 C 770 1366 740 1378 712 1372 C 690 1366 680 1340 690 1320 Z" fill="${ST2.skin}" ${S(3.5)}/>
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
      <g transform="translate(690 1132) rotate(-6)"><rect x="-30" y="-14" width="60" height="26" rx="11" fill="${ST2.patch}" ${S(3)}/></g>
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
    const D = ${JSON.stringify(lines.filter((l) => l.speaker === "arzt" && LINE_SCENE[l.id] === "station").map((l) => [l.start, l.end]))};
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
    tl.to("#pat-head", { rotation: -4, duration: 0.25, yoyo: true, repeat: 1 }, S1 - 0.9);
`;

/* ================= Haut-Querschnitt (eine feste Einstellung, Stil v2) ================= */
// Oben "draußen" (Luft, hellblau): dort kommen Finger, Handschuh-Hand, Spray,
// Pflaster ins Bild. Unten der Hautquerschnitt: Oberhaut, Lederhaut mit Pickel
// (verstopfter Haarfollikel voller Eiter + Bakterien), Talgdrüse, Haar,
// Gefäße, Fettgewebe. Gedeckte, realistische Farben, dünnere Konturen.
const TK = {
  air: "#CFE8F5",
  airHi: "#E4F3FA",
  epi: "#F3CDB2",
  epiLine: "#E3B497",
  derm: "#ECB3A1",
  dermDark: "#DE9C8B",
  fat: "#F4E2A8",
  fatLine: "#E2CB86",
  red: "#E46F7A",
  pit: "#C9566A",
  pus: "#F4E7B4",
  pusDark: "#E2CF8A",
  head: "#FBF3D2",
  bac: "#9A7BD0",
  gland: "#F3E0B5",
  hair: "#4A2E1F",
  vesselR: "#C8434F",
  vesselB: "#6F84B8",
  skin: "#F2C6A5",
  nail: "#F6DCD6",
  dirt: "#6E6259",
  glove: "#F3F1E8",
  gloveShade: "#DCD9CC",
  metal: "#B8BDC3",
  patch: "#EED9B8",
};
const SURF = 900;
const PK = { x: 520, y: 1070 }; // Pickel (Eitertasche)
const HF = { x: 270, y: 1130 }; // Gesicht der Haut
const POS = {
  haut: [HF.x, HF.y],
  pickel: [PK.x, PK.y - 20],
  finger: [260, 600],
  hand: [720, 480],
  klein: [690, 860],
};
// Hautoberfläche mit Beule über dem Pickel; d-Werte gleicher Struktur, damit GSAP sie morphen kann.
const surf = (h, y0 = SURF) =>
  `M -60 ${y0} L 380 ${y0} C 430 ${y0} 450 ${y0 - h} 520 ${y0 - h - 4} C 590 ${y0 - h} 610 ${y0} 660 ${y0} L 1140 ${y0} L 1140 2000 L -60 2000 Z`;
const SURF_D = { start: surf(68), big: surf(96), popped: surf(30), flat: surf(0) };
const DERM_D = {
  start: surf(60, 950),
  big: surf(84, 950),
  popped: surf(24, 950),
  flat: surf(0, 950),
};
const browPair = (id, gap, r, y) =>
  `<path id="${id}-browL" d="M ${-gap - r * 0.6} ${y + 3} Q ${-gap} ${y - 5} ${-gap + r * 0.6} ${y + 3}" fill="none" ${S(3)}/>` +
  `<path id="${id}-browR" d="M ${gap - r * 0.6} ${y + 3} Q ${gap} ${y - 5} ${gap + r * 0.6} ${y + 3}" fill="none" ${S(3)}/>`;
const bacterium = (id, x, y) =>
  `<g id="${id}" transform="translate(${x} ${y})"><g id="${id}-b"><ellipse rx="17" ry="13" fill="${TK.bac}" ${S(3)}/>
    <circle cx="-6" cy="-3" r="4.5" fill="#fff" ${S(2)}/><circle cx="6" cy="-3" r="4.5" fill="#fff" ${S(2)}/>
    <circle cx="-5" cy="-2" r="2" fill="${C.ink}"/><circle cx="7" cy="-2" r="2" fill="${C.ink}"/>
    <path d="M -5 5 Q 0 9 5 5" fill="none" ${S(2)}/></g></g>`;
// Finger: Spitze bei (0,0), Finger zeigt nach unten (lokal -y = zur Hand hin).
const finger = (id, w = 100, face = false) => `
  <g id="${id}">
    <rect x="${-w / 2}" y="-620" width="${w}" height="650" rx="${w / 2}" fill="${TK.skin}" ${S(4)}/>
    <path d="M ${-w / 2 + 14} -210 q ${w / 2 - 14} 14 ${w - 28} 0 M ${-w / 2 + 14} -350 q ${w / 2 - 14} 14 ${w - 28} 0" fill="none" stroke="#D9A58A" stroke-width="5" stroke-linecap="round"/>
    <rect x="${-w / 2 + 16}" y="-86" width="${w - 32}" height="78" rx="${(w - 32) / 2.4}" fill="${TK.nail}" ${S(3)}/>
    <path d="M ${-w / 2 + 20} -14 Q 0 4 ${w / 2 - 20} -14" fill="none" stroke="${TK.dirt}" stroke-width="7" stroke-linecap="round"/>
    ${face ? `<g transform="translate(0 -300)">${toothFace(id, { r: 22, gap: 23, mouthY: 36, mouthS: 0.36, mouthInit: "smile", lidFill: TK.skin, pupil: 0.24, sw: 3.5 })}${browPair(id, 23, 22, -32)}</g>` : ""}
  </g>`;
// Handschuh-Hand mit Komedonenquetscher: Schlaufe bei (0,0), Hand oben.
const gloveHand = (id) => `
  <g id="${id}">
    <ellipse cx="0" cy="0" rx="28" ry="11" fill="none" stroke="${C.ink}" stroke-width="10"/>
    <ellipse cx="0" cy="0" rx="28" ry="11" fill="none" stroke="${TK.metal}" stroke-width="5"/>
    <path d="M 0 -10 L 0 -210" stroke="${C.ink}" stroke-width="20" stroke-linecap="round"/>
    <path d="M 0 -10 L 0 -210" stroke="${TK.metal}" stroke-width="11" stroke-linecap="round"/>
    <rect x="-70" y="-550" width="140" height="240" rx="40" fill="${TK.glove}" ${S(4)}/>
    <path d="M -96 -280 C -110 -370 -60 -410 0 -410 C 70 -410 112 -370 100 -280 C 92 -200 50 -170 0 -170 C -50 -170 -88 -200 -96 -280 Z" fill="${TK.glove}" ${S(4)}/>
    <path d="M -96 -250 C -120 -230 -110 -190 -70 -190 C -40 -190 -30 -210 -24 -220" fill="${TK.glove}" ${S(4)}/>
    <path d="M -70 -320 C -40 -330 40 -330 70 -320" fill="none" stroke="${TK.gloveShade}" stroke-width="6" stroke-linecap="round"/>
    <g transform="translate(6 -290)">${toothFace(id, { r: 26, gap: 27, mouthY: 42, mouthS: 0.4, mouthInit: "flat", lidFill: TK.glove, pupil: 0.24, sw: 3.5 })}${browPair(id, 27, 26, -38)}</g>
  </g>`;
const sprayCan = (id) => `
  <g id="${id}">
    <rect x="-36" y="-40" width="72" height="170" rx="16" fill="#fff" ${S(4)}/>
    <rect x="-36" y="10" width="72" height="56" fill="#7FC8F0" ${S(3)}/>
    <path d="M -10 22 L 10 22 M 0 12 L 0 32" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
    <rect x="-16" y="-74" width="32" height="36" rx="6" fill="#DDE3E8" ${S(3)}/>
    <rect x="14" y="-68" width="26" height="12" rx="4" fill="#DDE3E8" ${S(3)}/>
  </g>`;
const skin = (p) => `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
 <g transform="translate(540 1000) scale(1.35) translate(-540 -1000)"><g id="${p}cam">
  <rect x="-200" y="-400" width="${W + 400}" height="${SURF + 400}" fill="url(#${p}airG)"/>
  <path d="M -100 520 L 1180 160 L 1180 300 L -100 660 Z" fill="${TK.airHi}" opacity="0.6"/>
  <path id="${p}surf" d="${SURF_D.start}" fill="${TK.epi}" ${S(3)}/>
  <defs>
    <linearGradient id="${p}dermG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F0BDAA"/><stop offset="1" stop-color="${TK.dermDark}"/></linearGradient>
    <radialGradient id="${p}pusG" cx="45%" cy="38%" r="65%"><stop offset="0" stop-color="#FBF2C9"/><stop offset="1" stop-color="${TK.pusDark}"/></radialGradient>
    <linearGradient id="${p}airG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFDDF0"/><stop offset="1" stop-color="#DCEEF7"/></linearGradient>
  </defs>
  <path id="${p}derm" d="${DERM_D.start}" fill="url(#${p}dermG)"/>
  <path d="M -60 965 L 1140 965" stroke="${TK.epiLine}" stroke-width="5" stroke-dasharray="14 12" opacity="0.7"/>
  <rect x="-60" y="1380" width="${W + 120}" height="700" fill="${TK.fat}"/>
  <path d="M -60 1380 L 1140 1380" ${S(3)} opacity="0.5"/>
  ${[
    [60, 1440],
    [200, 1450],
    [340, 1440],
    [480, 1455],
    [620, 1440],
    [760, 1450],
    [900, 1440],
    [1040, 1450],
    [130, 1540],
    [270, 1550],
    [410, 1545],
    [550, 1550],
    [690, 1545],
    [830, 1550],
    [970, 1545],
  ]
    .map(
      ([x, y]) =>
        `<ellipse cx="${x}" cy="${y}" rx="64" ry="44" fill="none" stroke="${TK.fatLine}" stroke-width="5"/>`,
    )
    .join("")}
  <path d="M -60 1318 C 200 1300 400 1340 640 1316 C 820 1300 960 1330 1140 1312" fill="none" stroke="${TK.vesselR}" stroke-width="12" stroke-linecap="round"/>
  <path d="M -60 1348 C 220 1332 420 1366 660 1344 C 840 1330 980 1356 1140 1340" fill="none" stroke="${TK.vesselB}" stroke-width="10" stroke-linecap="round"/>
  <!-- Haar mit Follikel rechts -->
  <path d="M 790 905 C 790 1000 796 1100 800 1200" fill="none" stroke="${TK.dermDark}" stroke-width="30" stroke-linecap="round"/>
  <path d="M 800 1190 C 796 1060 790 950 800 820 C 812 700 840 640 860 600" fill="none" stroke="${TK.hair}" stroke-width="8" stroke-linecap="round"/>
  <ellipse cx="800" cy="1205" rx="22" ry="16" fill="${TK.dermDark}" ${S(3)}/>
  <!-- Entzündung, Eitertasche -->
  <g id="${p}infl"><ellipse cx="${PK.x}" cy="${PK.y}" rx="215" ry="225" fill="${TK.red}" opacity="0.18"/><ellipse cx="${PK.x}" cy="${PK.y}" rx="170" ry="182" fill="${TK.red}" opacity="0.3"/></g>
  <g id="${p}leak" opacity="0">
    <path d="M 430 1180 C 380 1200 370 1260 410 1290 C 450 1316 490 1280 480 1240 C 476 1210 460 1190 430 1180 Z" fill="${TK.pus}" ${S(3)}/>
    <path d="M 610 1190 C 660 1210 676 1268 640 1296 C 604 1318 566 1290 572 1250 C 576 1220 590 1200 610 1190 Z" fill="${TK.pus}" ${S(3)}/>
  </g>
  <path d="M ${PK.x} 870 L ${PK.x} 960" stroke="${C.ink}" stroke-width="38" stroke-linecap="round"/>
  <path d="M ${PK.x} 870 L ${PK.x} 960" stroke="${TK.pusDark}" stroke-width="28" stroke-linecap="round"/>
  <g id="${p}pocket"><ellipse cx="${PK.x}" cy="${PK.y}" rx="128" ry="142" fill="${TK.pit}" ${S(3)}/></g>
  <path d="M 648 1010 C 690 990 720 1020 704 1050 C 730 1070 710 1110 680 1100 C 664 1124 630 1110 636 1084 C 610 1070 620 1030 648 1010 Z" fill="${TK.gland}" ${S(3)}/>
  <g id="${p}pickel-t">
    <ellipse cx="${PK.x}" cy="${PK.y}" rx="124" ry="138" fill="url(#${p}pusG)" ${S(3)}/>
    <path d="M ${PK.x - 90} ${PK.y + 40} C ${PK.x - 70} ${PK.y + 100} ${PK.x + 60} ${PK.y + 110} ${PK.x + 92} ${PK.y + 48}" fill="none" stroke="${TK.pusDark}" stroke-width="12" stroke-linecap="round"/>
    <g transform="translate(${PK.x} ${PK.y - 30})">${toothFace(p + "pickel", { r: 31, gap: 32, mouthY: 50, mouthS: 0.46, mouthInit: "smirk", lidFill: TK.pus, pupil: 0.24, sw: 3.5 })}${browPair(p + "pickel", 32, 31, -44)}</g>
    ${bacterium(p + "bac0", PK.x - 72, PK.y + 48)}${bacterium(p + "bac1", PK.x + 70, PK.y + 40)}${bacterium(p + "bac2", PK.x - 4, PK.y + 92)}${bacterium(p + "bac3", PK.x + 64, PK.y - 74)}
  </g>
  <circle id="${p}head" cx="${PK.x}" cy="842" r="24" fill="${TK.head}" ${S(3)}/>
  ${Array.from({ length: 6 }, (_, i) => `<circle id="${p}drop${i}" opacity="0" r="${7 + (i % 3) * 2}" fill="${TK.pus}" ${S(2)}/>`).join("")}
  ${Array.from({ length: 6 }, (_, i) => `<circle id="${p}mist${i}" opacity="0" r="${6 + (i % 2) * 3}" fill="#BFE6F5" ${S(2)}/>`).join("")}
  <!-- Haut-Gesicht -->
  <g transform="translate(${HF.x} ${HF.y})">
    <ellipse id="${p}blushL" cx="-62" cy="46" rx="22" ry="12" fill="#E8676F" opacity="0"/>
    <ellipse id="${p}blushR" cx="62" cy="46" rx="22" ry="12" fill="#E8676F" opacity="0"/>
    ${toothFace(p + "haut", { r: 40, gap: 41, mouthY: 66, mouthS: 0.55, mouthInit: "frown", lidFill: TK.derm, pupil: 0.24, sw: 3.5 })}${browPair(p + "haut", 41, 40, -56)}
  </g>
  <g id="${p}sweat" opacity="0"><path d="M ${HF.x + 92} ${HF.y - 50} C ${HF.x + 104} ${HF.y - 32} ${HF.x + 106} ${HF.y - 20} ${HF.x + 96} ${HF.y - 12} C ${HF.x + 86} ${HF.y - 6} ${HF.x + 76} ${HF.y - 14} ${HF.x + 80} ${HF.y - 28} Z" fill="#BFE6F5" ${S(3)}/></g>
  <g id="${p}patch-pos"><rect x="-96" y="-50" width="192" height="70" rx="30" fill="${TK.patch}" opacity="0.92" ${S(3)}/>
    <circle cx="-50" cy="-16" r="4" fill="#D8BF96"/><circle cx="0" cy="-22" r="4" fill="#D8BF96"/><circle cx="48" cy="-14" r="4" fill="#D8BF96"/></g>
  <g id="${p}spray-pos">${sprayCan(p + "spray")}</g>
  <g transform="translate(690 902)"><g id="${p}mini">
    <path d="M -74 0 C -50 0 -40 -52 0 -54 C 40 -52 50 0 74 0 Z" fill="${TK.epi}" ${S(3)}/>
    <circle cx="0" cy="-52" r="11" fill="${TK.head}" ${S(2.5)}/>
    <ellipse cx="0" cy="-24" rx="30" ry="18" fill="${TK.red}" opacity="0.35"/>
    <g transform="translate(0 -22)">${toothFace(p + "klein", { r: 15, gap: 15, mouthY: 22, mouthS: 0.26, mouthInit: "smile", lidFill: TK.epi, pupil: 0.26, sw: 3 })}${browPair(p + "klein", 15, 15, -22)}</g>
  </g></g>
  <g id="${p}fi-pos">${finger(p + "finger", 104, true)}</g>
  <g id="${p}th-pos">${finger(p + "thumb", 118)}</g>
  <g id="${p}hand-pos">${gloveHand(p + "hand")}</g>
 </g></g>
</svg>`;

/* ---------- Acting ---------- */
const MOOD = {
  h1: "angry",
  p1: "smug",
  f1: "happy",
  h3: "panic",
  p3: "smug",
  g1: "flat",
  p4: "worried",
  p5: "panic",
  g2: "flat",
  h4: "happy",
  k1: "happy",
  h5: "panic",
};
const CHARS = ["haut", "pickel", "finger", "hand", "klein"];
function lookVec(from, to) {
  const dx = POS[to][0] - POS[from][0],
    dy = POS[to][1] - POS[from][1];
  const n = Math.hypot(dx, dy) || 1;
  return [Math.round((dx / n) * 12), Math.round((dy / n) * 12)];
}
function actLines(scene) {
  return lines
    .filter((l) => LINE_SCENE[l.id] === scene && VO[l.id] && CHARS.includes(l.speaker))
    .map((l) => {
      const me = l.speaker,
        mood = MOOD[l.id] || "flat";
      const t = l.start,
        e = l.end;
      let js = ["haut", "pickel"]
        .filter((c) => c !== me)
        .map((c) => `look("@${c}", ${lookVec(c, me).join(", ")}, ${+(t - 0.1).toFixed(2)});`)
        .join(" ");
      js += `brows("@${me}", "${mood}", ${t});`;
      if (mood === "angry" || mood === "panic")
        js += `squeeze("@${me}", true, ${t}); squeeze("@${me}", false, ${+(t + 0.4).toFixed(2)});`;
      if (mood === "smug") js += `lids("@${me}", 0.5, ${t});`;
      if (mood === "happy" || mood === "flat") js += `lids("@${me}", 0.1, ${t});`;
      const rest =
        mood === "happy" ? "smile" : mood === "smug" ? "smirk" : mood === "flat" ? "flat" : "frown";
      return js + `talk("@${me}", ${t}, ${e}, "${rest}");`;
    })
    .join("\n    ");
}
const hautJs = `${HELPERS}
    initChar("@haut", 40, 0.15); initChar("@pickel", 31, 0.5); initChar("@finger", 22, 0.1); initChar("@hand", 26, 0.15); initChar("@klein", 15, 0.1);
    gsap.set("#@mini", { opacity: 0, svgOrigin: "690 902" });
    const BROWO = { haut: [41, -56], pickel: [32, -44], finger: [23, -32], hand: [27, -38], klein: [15, -22] };
    Object.entries(BROWO).forEach(([c, [g, y]]) => { gsap.set("#@" + c + "-browL", { svgOrigin: -g + " " + y }); gsap.set("#@" + c + "-browR", { svgOrigin: g + " " + y }); });
    const BROW = { angry: [18, -18], panic: [-16, 16], worried: [-14, 14], smug: [-12, 4], happy: [-6, 6], flat: [0, 0] };
    const brows = (ch, mood, t) => {
      const [l, r] = BROW[mood] || [0, 0];
      tl.to("#" + ch + "-browL", { rotation: l, duration: 0.15 }, t);
      tl.to("#" + ch + "-browR", { rotation: r, duration: 0.15 }, t);
    };
    const L = ${JSON.stringify(L)};
    const S0 = ${SC.haut[0]};
    gsap.set("#@cam", { svgOrigin: "540 960" });
    gsap.set("#@pickel-t", { svgOrigin: "${PK.x} ${PK.y}" });
    gsap.set("#@pocket", { svgOrigin: "${PK.x} ${PK.y}" });
    gsap.set("#@infl", { svgOrigin: "${PK.x} ${PK.y}" });
    // Startzustand: Haut genervt, Pickel macht sich breit; alles außerhalb des Bildes.
    face("@haut", "frown", S0); face("@pickel", "smirk", S0); lids("@pickel", 0.5, S0, 0.01);
    look("@haut", 12, -6, S0, 0.01); look("@pickel", -12, 4, S0, 0.01);
    brows("@haut", "angry", S0);
    gsap.set("#@fi-pos", { x: -260, y: 260, rotation: -35, svgOrigin: "0 0" });
    gsap.set("#@th-pos", { x: 1340, y: 260, rotation: 35, svgOrigin: "0 0" });
    gsap.set("#@hand-pos", { x: 1300, y: -200, rotation: 30, svgOrigin: "0 0" });
    gsap.set("#@spray-pos", { x: -200, y: 520, rotation: 40, svgOrigin: "0 0" });
    gsap.set("#@patch-pos", { x: ${PK.x}, y: -200 });
    // Bakterien zappeln (nur wenn sie reagieren, kein Dauerwackeln).
    const wiggle = (t) => [0, 1, 2, 3].forEach((k) => tl.to("#@bac" + k + "-b", { y: -6, rotation: k % 2 ? 12 : -12, duration: 0.12, yoyo: true, repeat: 3, ease: "sine.inOut" }, t + k * 0.05));
    wiggle(L.p1[1] + 0.05);
    tl.to("#@pickel-t", { scaleX: 1.06, scaleY: 0.97, duration: 0.3, yoyo: true, repeat: 1, ease: "sine.inOut" }, L.p1[0] + 0.4);
    // Date: Haut wird rot.
    tl.to(["#@blushL", "#@blushR"], { opacity: 0.6, duration: 0.3 }, L.h3[0] + 0.5);
    tl.to(["#@blushL", "#@blushR"], { opacity: 0, duration: 0.4 }, L.p3[1]);

    // Finger kommen und drücken: der Eiter wird tiefer gedrückt, die Entzündung wächst.
    const F0 = L.f1[0] - 0.85;
    tl.to("#@fi-pos", { x: 430, y: 858, duration: 0.6, ease: "back.out(1.3)" }, F0);
    tl.to("#@th-pos", { x: 612, y: 858, duration: 0.6, ease: "back.out(1.3)" }, F0 + 0.05);
    look("@haut", 10, -12, F0 + 0.2); tl.to("#@sweat", { opacity: 1, duration: 0.2 }, L.h3[0]);
    tl.to("#@sweat", { y: 50, duration: 1.4, ease: "power1.in" }, L.h3[0]);
    const PR = L.h3[1] + 0.05;
    tl.to("#@fi-pos", { x: 468, y: 900, duration: 0.25, ease: "power2.in" }, PR);
    tl.to("#@th-pos", { x: 574, y: 900, duration: 0.25, ease: "power2.in" }, PR);
    [0, 0.45].forEach((d) => {
      tl.to("#@fi-pos", { x: "+=8", y: "+=6", duration: 0.12, yoyo: true, repeat: 1 }, PR + 0.3 + d);
      tl.to("#@th-pos", { x: "-=8", y: "+=6", duration: 0.12, yoyo: true, repeat: 1 }, PR + 0.3 + d);
    });
    tl.to("#@surf", { attr: { d: "${SURF_D.big}" }, duration: 0.5, ease: "power2.out" }, PR + 0.2);
    tl.to("#@derm", { attr: { d: "${DERM_D.big}" }, duration: 0.5, ease: "power2.out" }, PR + 0.2);
    tl.to("#@head", { y: -26, scale: 1.25, svgOrigin: "${PK.x} 842", duration: 0.5 }, PR + 0.2);
    tl.to(["#@pickel-t", "#@pocket"], { y: 34, scale: 1.12, duration: 0.6, ease: "power2.out" }, PR + 0.25);
    tl.to("#@leak", { opacity: 1, duration: 0.4 }, PR + 0.5);
    tl.to("#@infl", { scale: 1.35, duration: 0.8, ease: "power2.out" }, PR + 0.3);
    squeeze("@haut", true, PR + 0.25); squeeze("@haut", false, PR + 1.1);
    wiggle(L.b1[0]); tl.to("#@pickel-t", { y: "+=10", duration: 0.15, yoyo: true, repeat: 3 }, L.b1[0]);
    tl.to("#@fi-pos", { x: -260, y: 260, duration: 0.5, ease: "power2.in" }, L.p3[1] + 0.1);
    tl.to("#@th-pos", { x: 1340, y: 260, duration: 0.5, ease: "power2.in" }, L.p3[1] + 0.1);

    // Handschuh-Hand mit Komedonenquetscher; Spray desinfiziert.
    const G0 = L.g1[0] - 0.8;
    tl.to("#@hand-pos", { x: ${PK.x}, y: 806, duration: 0.6, ease: "back.out(1.2)" }, G0);
    look("@haut", 12, -14, G0 + 0.2); look("@pickel", 8, -14, G0 + 0.3);
    // Steril: ein Hauch Desinfektion aus der Schlaufe, dann direkt öffnen.
    const SP = L.g1[1] - 0.6;
    [0, 1, 2, 3, 4, 5].forEach((k) => {
      const t = SP + k * 0.05, c = "#@mist" + k;
      tl.set(c, { opacity: 1, x: ${PK.x}, y: 812 }, t);
      tl.to(c, { x: ${PK.x} + [-90, -50, -15, 20, 55, 95][k], y: 800 - (k % 3) * 22, opacity: 0, duration: 0.45, ease: "power1.out" }, t);
    });
    tl.to("#@infl", { scale: 1.15, duration: 0.8 }, SP + 0.3);

    // Plopp: Schlaufe drückt, der Pickel schießt durch die Pore nach draußen.
    const POP = L.p4[1] + 0.35;
    tl.to("#@hand-pos", { y: 836, duration: 0.25, ease: "power2.in" }, POP - 0.25);
    tl.to("#@head", { opacity: 0, scale: 1.8, duration: 0.12 }, POP);
    tl.to("#@surf", { attr: { d: "${SURF_D.popped}" }, duration: 0.3, ease: "power2.out" }, POP);
    tl.to("#@derm", { attr: { d: "${DERM_D.popped}" }, duration: 0.3, ease: "power2.out" }, POP);
    tl.to("#@leak", { opacity: 0, duration: 0.4 }, POP + 0.1);
    tl.to("#@pickel-t", { keyframes: [{ y: -150, scale: 0.55, duration: 0.25 }, { x: -60, y: -470, scale: 0.85, rotation: -12, duration: 0.35 }], ease: "power2.out" }, POP);
    tl.to("#@pocket", { y: 0, scale: 0.6, duration: 0.5, ease: "power2.out" }, POP + 0.1);
    [0, 1, 2, 3, 4, 5].forEach((k) => {
      const c = "#@drop" + k, dx = [-120, -60, 0, 50, 110, 160][k], dy = [-150, -230, -260, -210, -170, -120][k];
      tl.set(c, { opacity: 1, x: ${PK.x}, y: 836 }, POP);
      tl.to(c, { x: ${PK.x} + dx, y: 836 + dy, duration: 0.4, ease: "power2.out" }, POP);
      tl.to(c, { y: "+=40", opacity: 0, duration: 0.3, ease: "power1.in" }, POP + 0.4);
    });
    tl.to("#@hand-pos", { y: 760, duration: 0.3, ease: "power2.out" }, POP + 0.05);
    shake("#@cam", POP, 0.3, 7);
    squeeze("@haut", true, POP); squeeze("@haut", false, POP + 0.4);
    tl.to("#@pickel-t", { x: -900, y: -1500, rotation: -80, scale: 0.6, duration: 0.7, ease: "power2.in" }, L.p5[1] + 0.1);

    // Pickelpflaster drauf, Entzündung geht zurück, Haut glatt.
    tl.to("#@hand-pos", { x: 1300, y: -200, duration: 0.5, ease: "power2.in" }, L.p5[1] + 0.2);
    const PA = L.g2[1] + 0.05;
    tl.to("#@patch-pos", { y: 878, duration: 0.5, ease: "bounce.out" }, PA);
    tl.to("#@surf", { attr: { d: "${SURF_D.flat}" }, duration: 0.6 }, PA + 0.3);
    tl.to("#@derm", { attr: { d: "${DERM_D.flat}" }, duration: 0.6 }, PA + 0.3);
    tl.to("#@patch-pos", { y: 900, duration: 0.6 }, PA + 0.3);
    tl.to("#@infl", { opacity: 0, duration: 0.8 }, PA + 0.3);
    tl.to("#@pocket", { scale: 0.2, opacity: 0, duration: 0.8 }, PA + 0.3);
    tl.to(["#@blushL", "#@blushR"], { opacity: 0.5, duration: 0.3 }, L.h4[0]);
    // Pointe: daneben meldet sich der kleine Bruder.
    const KB = L.k1[0] - 0.5;
    tl.fromTo("#@mini", { scale: 0, opacity: 1 }, { scale: 1.5, opacity: 1, duration: 0.4, ease: "back.out(3)", immediateRender: false }, KB);
    look("@haut", 14, -8, KB + 0.2);
    tl.to(["#@blushL", "#@blushR"], { opacity: 0, duration: 0.2 }, L.h5[0]);
    tl.to("#@sweat", { opacity: 1, y: 0, duration: 0.01 }, L.h5[0]);
    tl.to("#@sweat", { y: 50, duration: 1.2, ease: "power1.in" }, L.h5[0] + 0.02);
    ${actLines("haut")}
    // Finger und Hand: Sprechen ohne Haut/Pickel-Logik (eigene Blicke).
    look("@finger", 10, 10, F0 + 0.5); look("@hand", -6, 12, G0 + 0.5);
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

// Stil v2: kleine, ruhige Untertitel unten im Bild.
const CAP_EMPH_CSS = `
  .cap { --cap-y: 1392px; font-size: 58px; -webkit-text-stroke: 10px #1d1414; text-shadow: 0 4px 0 rgba(0,0,0,0.3); }`;

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
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${TK.air}; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}">
${host("haut", 1)}
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
    #wm { position: absolute; left: 60px; top: 1468px; font-family: "Montserrat", sans-serif; font-weight: 700;
      font-size: 38px; color: rgba(255,255,255,0.32); transform: none; transform-origin: left center; white-space: nowrap; }
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
out("./compositions/haut.html", page("haut", SC.haut, skin("h-"), "", pre("h-", hautJs)));
out("./compositions/station.html", page("station", SC.station, stationSvg, "", stationJs));
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
