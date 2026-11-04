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
  <!-- Schal um den Hals, Eis in der Hand -->
  <path d="M 330 820 C 360 850 420 850 450 820 L 456 860 C 420 890 360 890 324 860 Z" fill="#D94A4A" ${S(4)}/>
  <path d="M 430 850 L 470 960 L 430 968 L 404 862 Z" fill="#D94A4A" ${S(4)}/>
  <path d="M 500 900 C 540 980 560 1060 560 1120" fill="none" stroke="${C.ink}" stroke-width="72" stroke-linecap="round"/><path d="M 500 900 C 540 980 560 1060 560 1120" fill="none" stroke="${PT.sweater}" stroke-width="62" stroke-linecap="round"/>
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
    <g transform="translate(452 792) rotate(-12)"><rect x="-30" y="-16" width="60" height="32" rx="13" fill="#EED9B8" ${S(4)}/></g>
  </g>
</svg>`;
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
const POS = { haut: [HF.x, HF.y], pickel: [PK.x, PK.y - 20], finger: [260, 600], hand: [720, 480] };
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
  `<path id="${id}-browL" d="M ${-gap - r * 0.75} ${y} L ${-gap + r * 0.75} ${y}" fill="none" ${S(4)}/>` +
  `<path id="${id}-browR" d="M ${gap - r * 0.75} ${y} L ${gap + r * 0.75} ${y}" fill="none" ${S(4)}/>`;
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
    ${face ? `<g transform="translate(0 -300)">${toothFace(id, { r: 17, gap: 21, mouthY: 34, mouthS: 0.4, mouthInit: "smile", lidFill: TK.skin })}${browPair(id, 21, 17, -28)}</g>` : ""}
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
    <g transform="translate(6 -290)">${toothFace(id, { r: 21, gap: 28, mouthY: 40, mouthS: 0.45, mouthInit: "flat", lidFill: TK.glove })}${browPair(id, 28, 21, -33)}</g>
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
  <rect x="-200" y="-400" width="${W + 400}" height="${SURF + 400}" fill="${TK.air}"/>
  <path d="M -100 520 L 1180 160 L 1180 300 L -100 660 Z" fill="${TK.airHi}" opacity="0.6"/>
  <path id="${p}surf" d="${SURF_D.start}" fill="${TK.epi}" ${S(4)}/>
  <path id="${p}derm" d="${DERM_D.start}" fill="${TK.derm}"/>
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
  <g id="${p}pocket"><ellipse cx="${PK.x}" cy="${PK.y}" rx="128" ry="142" fill="${TK.pit}" ${S(4)}/></g>
  <path d="M 648 1010 C 690 990 720 1020 704 1050 C 730 1070 710 1110 680 1100 C 664 1124 630 1110 636 1084 C 610 1070 620 1030 648 1010 Z" fill="${TK.gland}" ${S(3)}/>
  <g id="${p}pickel-t">
    <ellipse cx="${PK.x}" cy="${PK.y}" rx="124" ry="138" fill="${TK.pus}" ${S(4)}/>
    <path d="M ${PK.x - 90} ${PK.y + 40} C ${PK.x - 70} ${PK.y + 100} ${PK.x + 60} ${PK.y + 110} ${PK.x + 92} ${PK.y + 48}" fill="none" stroke="${TK.pusDark}" stroke-width="12" stroke-linecap="round"/>
    <g transform="translate(${PK.x} ${PK.y - 30})">${toothFace(p + "pickel", { r: 24, gap: 30, mouthY: 44, mouthS: 0.5, mouthInit: "smirk", lidFill: TK.pus })}${browPair(p + "pickel", 30, 24, -36)}</g>
    ${bacterium(p + "bac0", PK.x - 72, PK.y + 48)}${bacterium(p + "bac1", PK.x + 70, PK.y + 40)}${bacterium(p + "bac2", PK.x - 4, PK.y + 92)}${bacterium(p + "bac3", PK.x + 64, PK.y - 74)}
  </g>
  <circle id="${p}head" cx="${PK.x}" cy="842" r="24" fill="${TK.head}" ${S(3)}/>
  ${Array.from({ length: 6 }, (_, i) => `<circle id="${p}drop${i}" opacity="0" r="${7 + (i % 3) * 2}" fill="${TK.pus}" ${S(2)}/>`).join("")}
  ${Array.from({ length: 6 }, (_, i) => `<circle id="${p}mist${i}" opacity="0" r="${6 + (i % 2) * 3}" fill="#BFE6F5" ${S(2)}/>`).join("")}
  <!-- Haut-Gesicht -->
  <g transform="translate(${HF.x} ${HF.y})">
    <ellipse id="${p}blushL" cx="-62" cy="46" rx="22" ry="12" fill="#E8676F" opacity="0"/>
    <ellipse id="${p}blushR" cx="62" cy="46" rx="22" ry="12" fill="#E8676F" opacity="0"/>
    ${toothFace(p + "haut", { r: 34, gap: 46, mouthY: 70, mouthS: 0.68, mouthInit: "frown", lidFill: TK.derm })}${browPair(p + "haut", 46, 34, -50)}
  </g>
  <g id="${p}sweat" opacity="0"><path d="M ${HF.x + 92} ${HF.y - 50} C ${HF.x + 104} ${HF.y - 32} ${HF.x + 106} ${HF.y - 20} ${HF.x + 96} ${HF.y - 12} C ${HF.x + 86} ${HF.y - 6} ${HF.x + 76} ${HF.y - 14} ${HF.x + 80} ${HF.y - 28} Z" fill="#BFE6F5" ${S(3)}/></g>
  <g id="${p}patch-pos"><rect x="-96" y="-50" width="192" height="70" rx="30" fill="${TK.patch}" opacity="0.92" ${S(4)}/>
    <circle cx="-50" cy="-16" r="4" fill="#D8BF96"/><circle cx="0" cy="-22" r="4" fill="#D8BF96"/><circle cx="48" cy="-14" r="4" fill="#D8BF96"/></g>
  <g id="${p}spray-pos">${sprayCan(p + "spray")}</g>
  <g id="${p}fi-pos">${finger(p + "finger", 104, true)}</g>
  <g id="${p}th-pos">${finger(p + "thumb", 118)}</g>
  <g id="${p}hand-pos">${gloveHand(p + "hand")}</g>
 </g></g>
</svg>`;

/* ---------- Acting ---------- */
const MOOD = {
  h1: "angry",
  p1: "smug",
  h2: "panic",
  p2: "smug",
  f1: "happy",
  h3: "panic",
  p3: "smug",
  g1: "flat",
  p4: "worried",
  p5: "panic",
  g2: "flat",
  h4: "happy",
};
const CHARS = ["haut", "pickel", "finger", "hand"];
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
    initChar("@haut", 34, 0.15); initChar("@pickel", 24, 0.5); initChar("@finger", 17, 0.1); initChar("@hand", 21, 0.15);
    const BROWO = { haut: [46, -50], pickel: [30, -36], finger: [21, -28], hand: [28, -33] };
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
    tl.to(["#@blushL", "#@blushR"], { opacity: 0.6, duration: 0.3 }, L.h2[0]);
    tl.to(["#@blushL", "#@blushR"], { opacity: 0, duration: 0.4 }, L.p2[1]);

    // Finger kommen und drücken: der Eiter wird tiefer gedrückt, die Entzündung wächst.
    const F0 = L.f1[0] - 0.95;
    tl.to("#@fi-pos", { x: 430, y: 858, duration: 0.6, ease: "back.out(1.3)" }, F0);
    tl.to("#@th-pos", { x: 612, y: 858, duration: 0.6, ease: "back.out(1.3)" }, F0 + 0.05);
    look("@haut", 10, -12, F0 + 0.2); tl.to("#@sweat", { opacity: 1, duration: 0.2 }, L.h3[0]);
    tl.to("#@sweat", { y: 50, duration: 1.4, ease: "power1.in" }, L.h3[0]);
    const PR = L.h3[1] + 0.1;
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
    wiggle(PR + 0.6);
    tl.to("#@fi-pos", { x: -260, y: 260, duration: 0.5, ease: "power2.in" }, L.p3[1] + 0.1);
    tl.to("#@th-pos", { x: 1340, y: 260, duration: 0.5, ease: "power2.in" }, L.p3[1] + 0.1);

    // Handschuh-Hand mit Komedonenquetscher; Spray desinfiziert.
    const G0 = L.g1[0] - 1.0;
    tl.to("#@hand-pos", { x: ${PK.x}, y: 806, duration: 0.6, ease: "back.out(1.2)" }, G0);
    look("@haut", 12, -14, G0 + 0.2); look("@pickel", 8, -14, G0 + 0.3);
    const SP = L.g1[1] + 0.05;
    tl.to("#@spray-pos", { x: 330, y: 640, rotation: 30, duration: 0.4, ease: "back.out(1.4)" }, SP - 0.3);
    [0, 1, 2, 3, 4, 5].forEach((k) => {
      const t = SP + 0.2 + k * 0.1, c = "#@mist" + k;
      tl.set(c, { opacity: 1, x: 372, y: 600 }, t);
      tl.to(c, { x: ${PK.x - 30} + k * 12, y: 840 - (k % 2) * 20, opacity: 0, duration: 0.5, ease: "power1.out" }, t);
    });
    tl.to("#@spray-pos", { x: -200, y: 520, duration: 0.4, ease: "power2.in" }, SP + 0.9);
    tl.to("#@infl", { scale: 1.15, duration: 0.8 }, SP + 0.4);

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
    ${actLines("haut")}
    // Finger und Hand: Sprechen ohne Haut/Pickel-Logik (eigene Blicke).
    look("@finger", 10, 10, F0 + 0.5); look("@hand", -6, 12, G0 + 0.5);
`;

/* ================= Kevin fragt (Pflaster auf der Wange) ================= */
const frageJs = `${HELPERS}
    const LIDS = ["#pe1-lid", "#pe2-lid"], PUP = ["#pe1-p", "#pe2-p"];
    gsap.set(LIDS, { scaleY: 0.15, svgOrigin: "0 -26" });
    gsap.set("#pt-browL", { rotation: -12, svgOrigin: "${HX - 12} ${HY - 48}" });
    gsap.set("#pt-browR", { rotation: 12, svgOrigin: "${HX + 12} ${HY - 48}" });
    gsap.set(PUP, { x: 8, y: -2 });
    talk("pm", ${L.q1}, "frown", 0.12);
    tl.to(LIDS, { scaleY: 1, duration: 0.06 }, ${L.q1[0]} + 1.2); tl.to(LIDS, { scaleY: 0.15, duration: 0.09 }, ${L.q1[0]} + 1.27);
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
  .cap { --cap-y: 1392px; font-size: 52px; -webkit-text-stroke: 9px #1d1414; text-shadow: 0 4px 0 rgba(0,0,0,0.3); }`;

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
${host("frage", 3)}
${host("praxis", 4)}
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
out("./compositions/frage.html", page("frage", SC.frage, patientSvg, "", frageJs));
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
