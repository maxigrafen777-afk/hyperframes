// Generates index.html + compositions/*.html from script.json.
// Run: node build.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import {
  C,
  S,
  toothBody,
  toothFace,
  TOOTH_PATH,
  syringe,
  scalpel,
  elevator,
  forceps,
  drill,
  needleHolder,
  drop,
  chip,
  painStar,
  stitch,
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
const ORDER = ["kiefer", "spaeter", "op", "praxis", "patient"];
const GAP = { kiefer: 0.1, spaeter: 0, op: 0.15, praxis: 0.3, patient: 0.25 };
const PAD = { kiefer: 0.3, spaeter: 0, op: 0.4, praxis: 0.5, patient: 2.6 };
const ORIG = Object.fromEntries(ORDER.map((id) => [id, [...SC[id]]]));
// Szene jeder Zeile einmal vorab (nach Original-Start) festlegen.
const sceneOf0 = (t) => ORDER.find((id) => t >= ORIG[id][0] && t < ORIG[id][1]) ?? ORDER.at(-1);
const LINE_SCENE = Object.fromEntries(lines.map((l) => [l.id, sceneOf0(l.start)]));
const SHIFT = {};
let cum = 0;
for (const id of ORDER) {
  SHIFT[id] = +cum.toFixed(3);
  const [a, b] = ORIG[id];
  let prevEnd = -1;
  for (const l of lines.filter((x) => LINE_SCENE[x.id] === id && VO[x.id])) {
    if (prevEnd > 0 && l.start < prevEnd + GAP[id]) l.start = +(prevEnd + GAP[id]).toFixed(2);
    l.end = +(l.start + VO[l.id].duration).toFixed(2);
    prevEnd = l.end;
  }
  const end = prevEnd > 0 ? Math.max(b, prevEnd + PAD[id]) : b;
  SC[id] = [a, +end.toFixed(2)];
  cum += end - b;
}
const R = (t, scene = sceneOf0(t)) => +(t + SHIFT[scene]).toFixed(3);
const RL = (l) => R(l.start, LINE_SCENE[l.id]);
const DUR = +(R(SC.patient[0], "patient") + SC.patient[1] - SC.patient[0]).toFixed(2);
// Betonte Wörter (im Skript GROSS geschrieben) -> gelbe Untertitel + Kamera-Punch.
const isEmph = (w) => {
  const c = w.replace(/[^\p{L}]/gu, "");
  return c.length >= 2 && c === c.toUpperCase();
};
const emphTimes = (scene) =>
  lines
    .filter((l) => LINE_SCENE[l.id] === scene && VO[l.id])
    .flatMap((l) =>
      VO[l.id].words.filter((w) => isEmph(w.text)).map((w) => +(l.start + w.start).toFixed(3)),
    );

const L = Object.fromEntries(lines.map((l) => [l.id, [l.start, l.end]]));

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

/* ================= Jaw drawing (shared by "kiefer" and "op") ================= */
const T = "rotate(-68) scale(0.86) translate(0 -280)";
const GUM =
  "M -40 928 C 150 915 380 916 468 934 C 520 946 548 880 602 822 C 680 742 830 690 1120 664";
const GUM_A = "M -40 928 C 150 915 380 916 468 934 C 500 941 520 925 540 905";
const FLAP =
  "M 498 922 C 530 900 560 838 600 792 C 680 712 830 662 1120 634 L 1120 696 C 1000 706 920 730 880 760 C 820 820 760 858 700 870 C 640 882 592 920 560 968 C 546 984 520 962 498 940 Z";
const BONECAP =
  "M 548 962 C 562 905 584 850 604 820 C 660 760 760 724 860 702 C 830 760 770 840 700 860 C 640 870 590 912 548 962 Z";
const CHUNKS = [
  [520, 615],
  [615, 730],
  [730, 900],
];

const jaw = (p) => `
<svg id="${p}cam" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="-200" y="-200" width="${W + 400}" height="${H + 400}" fill="${C.mouth}"/>
  <path d="M -200 1420 C 200 1480 700 1440 1300 1330 L 1300 2200 L -200 2200 Z" fill="${C.lowerPink}"/>
  <path d="${GUM} L 1120 1310 C 800 1400 300 1500 -40 1530 Z" fill="${C.bone}" ${S()}/>
  <path d="M -40 1470 C 300 1440 800 1350 1120 1250" fill="none" stroke="${C.boneShade}" stroke-width="60" opacity="0.7"/>
  <path d="${GUM_A}" fill="none" stroke="${C.ink}" stroke-width="70" stroke-linecap="round"/>
  <path d="${GUM_A}" fill="none" stroke="${C.gum}" stroke-width="60" stroke-linecap="round"/>

  <path id="${p}socket" opacity="0" d="${TOOTH_PATH}" fill="#9E1E2E" ${S()} transform="translate(800 1010) ${T}"/>

  <g transform="translate(-170 668)">${toothBody(p + "lz-body")}</g>
  <g transform="translate(330 650)"><g id="${p}bz-wob">
    ${toothBody(p + "bz-body")}
    <g transform="translate(0 122)">${toothFace(p + "bz", { r: 52, gap: 64, mouthY: 92 })}</g>
  </g></g>

  <g transform="translate(800 1010)"><g id="${p}wz-root"><g transform="${T}">
    <clipPath id="${p}wzr-clip"><rect x="-300" y="290" width="600" height="420"/></clipPath>
    <g clip-path="url(#${p}wzr-clip)">${toothBody(p + "wzr", { gumLine: 140 })}</g>
  </g></g></g>
  <g transform="translate(800 1010)"><g id="${p}wz-crown"><g transform="${T}">
    <clipPath id="${p}wzc-clip"><rect x="-300" y="-60" width="600" height="353"/></clipPath>
    <g clip-path="url(#${p}wzc-clip)">${toothBody(p + "wzc", { gumLine: 140 })}</g>
    <path id="${p}wz-cut" opacity="0" d="M 175 290 L -175 290" fill="none" stroke="${C.ink}" stroke-width="8" stroke-linecap="round"/>
  </g></g></g>

  ${CHUNKS.map(
    (
      [a, b],
      i,
    ) => `<g id="${p}bone${i}"><clipPath id="${p}bc${i}"><rect x="${a}" y="600" width="${b - a}" height="500"/></clipPath>
    <g clip-path="url(#${p}bc${i})"><path d="${BONECAP}" fill="${C.bone}" ${S()}/>
    <circle cx="${(a + b) / 2 - 10}" cy="${830 - i * 40}" r="5" fill="${C.boneShade}"/><circle cx="${(a + b) / 2 + 18}" cy="${850 - i * 45}" r="4" fill="${C.boneShade}"/></g></g>`,
  ).join("\n  ")}

  <g id="${p}flap">
    <path d="${FLAP}" fill="${C.gum}" ${S()}/>
    <path d="M 560 940 C 600 885 650 860 700 852 C 770 840 830 790 880 740" fill="none" stroke="${C.gumDark}" stroke-width="10" opacity="0.5" stroke-linecap="round"/>
  </g>
  <path id="${p}incision" opacity="0" d="M 520 940 C 545 905 570 860 604 822 C 660 770 720 742 780 726" fill="none" stroke="${C.blood}" stroke-width="9" stroke-linecap="round"/>

  <g transform="translate(800 1010)"><g id="${p}wz-fmove">
    <g transform="translate(-118 -38) rotate(-20)">${toothFace(p + "wz", { r: 44, gap: 52, mouthY: 78, mouthS: 0.85, mouthInit: "smirk" })}</g>
  </g></g>

  <g transform="translate(535 872)">${painStar(p + "pain", { r: 62 })}</g>
  <g transform="translate(548 915)">${stitch(p + "st1", 0.8)}</g>
  <g transform="translate(602 852)">${stitch(p + "st2", 0.8)}</g>
  <g transform="translate(668 806)">${stitch(p + "st3", 0.8)}</g>
  ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<g id="${p}chip${i}" opacity="0">${chip(p + "chipx" + i, { s: 1.2 })}</g>`).join("")}
  ${[0, 1, 2, 3, 4, 5].map((i) => `<g id="${p}drop${i}" opacity="0">${drop(p + "dropx" + i, { s: 1.1 })}</g>`).join("")}

  <g id="${p}syr-pos">${syringe(p + "syr")}</g>
  <g id="${p}scal-pos">${scalpel(p + "scal")}</g>
  <g id="${p}drill-pos">${drill(p + "drill")}</g>
  <g id="${p}elev-pos">${elevator(p + "elev")}</g>
  <g id="${p}forc-pos">${forceps(p + "forc")}</g>
  <g id="${p}nh-pos">${needleHolder(p + "nh")}</g>
</svg>`;

// Shared initial state for a jaw scene (prefix-agnostic via "@").
const JAW_INIT = `
    const WZ = ["#@wz-crown", "#@wz-root", "#@wz-fmove"];
    gsap.set("#@cam", { transformOrigin: "60% 48%" });
    initChar("@bz", 52, 0.42);
    initChar("@wz", 44, 0.38);
    gsap.set("#@pain", { scale: 0, svgOrigin: "0 0" });
    gsap.set(["#@st1", "#@st2", "#@st3"], { scale: 0, svgOrigin: "0 0" });
    gsap.set(WZ.concat(["#@bz-wob"]), { svgOrigin: "0 0" });
    const OFF = { syr: [1180, 20, 28], scal: [1250, 380, 52], drill: [1150, -500, 22], elev: [1000, -560, 18], forc: [800, -900, 16], nh: [1100, -700, 30] };
    Object.entries(OFF).forEach(([k, [x, y, r]]) => gsap.set("#@" + k + "-pos", { x, y, rotation: r, svgOrigin: "0 0" }));
    gsap.set("#@forc-armL", { rotation: -10, svgOrigin: "0 -232" });
    gsap.set("#@forc-armR", { rotation: 10, svgOrigin: "0 -232" });
    gsap.set("#@nh-f-armL", { rotation: -4, svgOrigin: "0 -232" });
    gsap.set("#@nh-f-armR", { rotation: 4, svgOrigin: "0 -232" });
    const go = (k, x, y, t, d = 0.45, rot) => tl.to("#@" + k + "-pos", Object.assign({ x, y, duration: d, ease: "power3.out" }, rot === undefined ? {} : { rotation: rot }), t);
    const away = (k, t, d = 0.4) => { const [x, y, r] = OFF[k]; tl.to("#@" + k + "-pos", { x, y, rotation: r, duration: d, ease: "power3.in" }, t); };
`;

/* ---------- Scene 1: Streit im Kiefer ---------- */
const kieferJs = `${HELPERS}${JAW_INIT}
    // Hook: Kamera knallt rein und wackelt, Schmerzstern pulsiert.
    gsap.set("#@cam", { scale: 1.16 });
    tl.to("#@cam", { scale: 1, duration: 0.55, ease: "power3.out" }, 0);
    shake("#@cam", 0.02, 0.5, 16);
    squeeze("@bz", true, 0); squeeze("@bz", false, 0.9);
    ${JSON.stringify(emphTimes("kiefer").filter((t) => t > 0.7))}.forEach((t) => { punch("#@cam", t); shake("#@cam", t, 0.25, 7); });
    face("@bz", "frown", 0); face("@wz", "smirk", 0);
    look("@bz", 14, 4, 0, 0.01); look("@wz", -10, -2, 0, 0.01);
    tl.set("#@pain", { scale: 0.9 }, 0);
    ${JSON.stringify(Array.from({ length: Math.floor((SC.kiefer[1] - 0.6) / 1.25) + 1 }, (_, i) => +(0.1 + i * 1.25).toFixed(2)))}.forEach((t) => {
      tl.to(WZ, { rotation: -4, x: -10, duration: 0.16, ease: "power2.out" }, t);
      tl.to(WZ, { rotation: 0, x: 0, duration: 0.35, ease: "power2.inOut" }, t + 0.18);
      tl.to("#@bz-wob", { rotation: -2.2, svgOrigin: "0 600", duration: 0.12, ease: "power2.out" }, t + 0.06);
      tl.to("#@bz-wob", { rotation: 0, svgOrigin: "0 600", duration: 0.4, ease: "elastic.out(1,0.5)" }, t + 0.2);
      tl.to("#@pain", { scale: 0.75, duration: 0.04 }, t + 0.03);
      tl.to("#@pain", { scale: 1.15, duration: 0.25, ease: "back.out(3)" }, t + 0.08);
    });
    talk("@bz", ${L.l1}, "frown");
    look("@wz", -14, -6, 0.4);
    talk("@wz", ${L.l2}, "smirk");
    squeeze("@bz", true, ${L.l3[0] - 0.1}); talk("@bz", ${L.l3}, "wavy"); squeeze("@bz", false, ${L.l3[1] + 0.1});
    lids("@wz", 0.5, ${L.l4[0] - 0.1}); talk("@wz", ${L.l4}, "smirk");
    lids("@bz", 0.0, ${L.l5[0] - 0.1}, 0.1); look("@bz", 0, -14, ${L.l5[0] - 0.1}); talk("@bz", ${L.l5}, "frown");
    blink("@wz", 1.6, 0.38); blink("@bz", 3.0, 0.42); blink("@wz", 5.0, 0.38); blink("@wz", ${L.l5[1] + 0.1}, 0.5);
`;

/* ---------- Scene 3: OP ---------- */
const opJs = `${HELPERS}${JAW_INIT}
    face("@bz", "flat", 11.2); face("@wz", "flat", 11.2);
    lids("@bz", 0, 11.2, 0.01); lids("@wz", 0, 11.2, 0.01);
    look("@bz", 16, -10, 11.2, 0.01); look("@wz", 0, 0, 11.2, 0.01);
    gsap.set("#@incision", { opacity: 1, strokeDasharray: 420, strokeDashoffset: 420 });
    gsap.set("#@wz-cut", { opacity: 1, strokeDasharray: 360, strokeDashoffset: 360 });

    ${JSON.stringify(emphTimes("op").filter((t) => !(t > 21.6 && t < 23.5) && !(t > 25.6 && t < 26.4)))}.forEach((t) => { punch("#@cam", t, 1.06); shake("#@cam", t, 0.25, 6); });
    // Dramatik: beim Teilen langsam auf den Zahn zoomen, beim Ziehen wackeln.
    tl.to("#@cam", { scale: 1.14, transformOrigin: "72% 52%", duration: 1.2, ease: "power1.inOut" }, 21.75);
    tl.to("#@cam", { scale: 1, duration: 0.4, ease: "power2.inOut" }, 23.0);
    shake("#@cam", 25.75, 0.45, 14);
    tl.to("#@cam", { scale: 1.06, duration: 0.08, ease: "power2.out" }, 25.75);
    tl.to("#@cam", { scale: 1, duration: 0.4, ease: "power2.inOut" }, 25.85);
    // 1) Betäubung
    go("syr", 700, 812, 11.4, 0.55);
    look("@wz", 12, -16, 11.45); look("@bz", 22, -14, 11.45);
    squeeze("@wz", true, 12.0); shake(WZ, 12.0, 0.35, 6);
    tl.to("#@syr-plunger", { y: 90, duration: 0.8, ease: "power1.inOut" }, 12.2);
    talk("@wz", ${L.l7}, "wavy"); squeeze("@wz", false, 13.6);
    away("syr", 13.1);
    lids("@wz", 0.6, 13.8, 0.4); look("@wz", -6, 8, 13.8, 0.5);
    talk("@wz", ${L.l8}, "wavy", 0.2);

    // 2) Schnitt + Zahnfleisch aufklappen
    go("scal", 520, 940, 15.8, 0.4);
    tl.to("#@scal-pos", { x: 604, y: 822, duration: 0.35, ease: "power1.inOut" }, 16.25);
    tl.to("#@scal-pos", { x: 780, y: 726, duration: 0.4, ease: "power1.inOut" }, 16.6);
    tl.to("#@incision", { strokeDashoffset: 0, duration: 0.75, ease: "none" }, 16.25);
    away("scal", 17.0);
    look("@bz", 30, -6, 16.2);
    tl.to("#@flap", { rotation: 30, svgOrigin: "1060 660", duration: 0.45, ease: "back.out(1.6)" }, 17.05);
    tl.to("#@incision", { opacity: 0, duration: 0.2 }, 17.1);
    lids("@bz", 0, 17.3); talk("@bz", ${L.l9}, "wavy");

    // 3) Knochen wegfräsen
    const chunkAt = [[585, 885], [668, 815], [790, 765]];
    chunkAt.forEach(([x, y], i) => {
      const t = 19.2 + i * 0.7;
      go("drill", x, y, t, 0.25);
      shake("#@drill", t + 0.25, 0.4, 4, "y");
      tl.to("#@bone" + i, { opacity: 0, duration: 0.35, ease: "power1.in" }, t + 0.25);
      [0, 1, 2].forEach((k) => {
        const c = "#@chip" + (i * 3 + k);
        const dx = [-90, -20, 70][k], dy = [-120, -170, -110][k];
        tl.set(c, { opacity: 1, x, y }, t + 0.3 + k * 0.05);
        tl.to(c, { x: x + dx, y: y + dy, rotation: 200, duration: 0.5, ease: "power2.out" }, t + 0.3 + k * 0.05);
        tl.to(c, { opacity: 0, duration: 0.15 }, t + 0.7 + k * 0.05);
      });
    });
    lids("@wz", 0.15, 19.2, 0.2); look("@wz", 10, -14, 19.3);
    look("@bz", 30, -20, 19.2); face("@bz", "wavy", 19.2);

    // 4) Zahn teilen
    go("drill", 864, 874, 21.4, 0.3, 30);
    tl.to("#@drill-pos", { x: 752, y: 1153, duration: 1.2, ease: "none" }, 21.75);
    shake("#@drill", 21.75, 1.2, 3);
    tl.to("#@wz-cut", { strokeDashoffset: 0, duration: 1.2, ease: "none" }, 21.75);
    away("drill", 23.0);
    squeeze("@wz", true, 21.45); squeeze("@wz", false, 21.6); lids("@wz", 0, 21.6, 0.08);
    look("@wz", 14, 6, 21.6);
    talk("@wz", ${L.l10}, "wavy");
    tl.to(["#@wz-crown", "#@wz-fmove"], { x: -10, y: -8, duration: 0.25, ease: "power2.out" }, 23.0);

    // 5) Krone lockern + herausziehen
    go("elev", 552, 945, 24.0, 0.35, 12);
    [24.4, 24.65, 24.9].forEach((t, i) => {
      const s = i % 2 ? -1 : 1;
      tl.to("#@elev-pos", { rotation: 12 + s * 9, duration: 0.12, ease: "power2.inOut" }, t);
      tl.to(["#@wz-crown", "#@wz-fmove"], { rotation: s * 5, duration: 0.12, ease: "power2.inOut" }, t);
    });
    tl.to(["#@wz-crown", "#@wz-fmove"], { rotation: 0, duration: 0.12 }, 25.1);
    away("elev", 25.05, 0.3);
    go("forc", 700, 872, 24.95, 0.4, 14);
    tl.to(["#@forc-armL", "#@forc-armR"], { rotation: 0, duration: 0.1 }, 25.35);
    squeeze("@wz", true, 25.4); face("@wz", "open", 25.4);
    tl.set("#@socket", { opacity: 1 }, 25.75);
    tl.to("#@forc-pos", { x: "+=0", y: "-=1500", rotation: 34, duration: 0.65, ease: "power3.in" }, 25.7);
    tl.to(["#@wz-crown", "#@wz-fmove"], { y: -1500, rotation: 22, duration: 0.65, ease: "power3.in" }, 25.7);
    shake("#@bz-wob", 25.75, 0.4, 3, "rotation");
    look("@bz", 30, -40, 25.8, 0.2);

    // 6) Wurzeln
    go("elev", 700, 960, 26.6, 0.35, 16);
    [27.0, 27.25, 27.5, 27.75].forEach((t, i) => {
      const s = i % 2 ? -1 : 1;
      tl.to("#@elev-pos", { rotation: 16 + s * 8, duration: 0.12, ease: "power2.inOut" }, t);
      tl.to("#@wz-root", { rotation: s * 4, duration: 0.12, ease: "power2.inOut" }, t);
    });
    tl.to("#@wz-root", { rotation: 0, duration: 0.12 }, 27.9);
    away("elev", 27.85, 0.3);
    tl.set("#@forc-armL", { rotation: -10 }, 27.0); tl.set("#@forc-armR", { rotation: 10 }, 27.0);
    tl.set("#@forc-pos", { x: 840, y: -700, rotation: -10 }, 27.0);
    go("forc", 840, 1026, 27.7, 0.4, -10);
    tl.to(["#@forc-armL", "#@forc-armR"], { rotation: 0, duration: 0.1 }, 28.1);
    tl.to(["#@forc-pos", "#@wz-root"], { x: "-=60", y: "-=40", duration: 0.25, ease: "power2.inOut" }, 28.3);
    tl.to(["#@forc-pos", "#@wz-root"], { y: "-=1500", duration: 0.6, ease: "power3.in" }, 28.55);
    look("@bz", 30, -30, 28.4);

    // 7) Spülen, Blutgerinnsel
    go("syr", 720, 780, 29.0, 0.35, 20);
    [0, 1, 2, 3, 4, 5].forEach((i) => {
      const t = 29.3 + i * 0.1, x = 700 + (i % 3) * 30;
      tl.set("#@drop" + i, { opacity: 1, x, y: 800 }, t);
      tl.to("#@drop" + i, { y: 960 + (i % 2) * 30, duration: 0.3, ease: "power1.in" }, t);
      tl.to("#@drop" + i, { opacity: 0, duration: 0.1 }, t + 0.3);
    });
    away("syr", 30.0);
    tl.to("#@socket", { fill: "#5E1019", duration: 0.5 }, 30.0);

    // 8) Zahnfleisch zurück + nähen
    tl.to("#@flap", { rotation: 0, svgOrigin: "1060 660", duration: 0.35, ease: "power2.inOut" }, 30.6);
    [[548, 915], [602, 852], [668, 806]].forEach(([x, y], i) => {
      const t = 31.0 + i * 0.6;
      go("nh", x, y, t, 0.3, 30);
      tl.to("#@nh-pos", { y: y + 18, duration: 0.12, ease: "power1.inOut" }, t + 0.3);
      tl.to("#@st" + (i + 1), { scale: 1, duration: 0.16, ease: "back.out(3)" }, t + 0.45);
    });
    away("nh", 32.9);
    look("@bz", 16, 6, 32.6);
    talk("@bz", ${L.l12}, "smile");
    lids("@bz", 0.55, 33.0, 0.3); look("@bz", 0, 6, 33.0);
    blink("@bz", 14.6, 0); blink("@bz", 23.6, 0); blink("@bz", 30.4, 0);
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
    const docLines = ${JSON.stringify(lines.filter((l) => l.speaker === "arzt").map((l) => [l.start, l.end]))};
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

/* ================= Scene: Patient mit dicken Backen ================= */
const PT = {
  hair: "#5A3A26",
  sweater: "#3D79C9",
  chair: "#3F7FD0",
  chairDark: "#2F63A8",
  ice: "#8FD3F5",
  blush: "#F29C94",
};
const FACE =
  "M 540 640 C 640 640 690 716 700 812 C 800 846 846 958 816 1064 C 784 1170 668 1214 540 1214 C 412 1214 296 1170 264 1064 C 234 958 280 846 380 812 C 390 716 440 640 540 640 Z";
const ptEye = (id, x, y) =>
  `<g transform="translate(${x} ${y})"><clipPath id="${id}-c"><circle r="24"/></clipPath>
    <circle r="24" fill="#fff"/>
    <g id="${id}-p"><circle r="10" fill="${C.ink}"/><circle cx="-3" cy="-3" r="2.6" fill="#fff"/></g>
    <g clip-path="url(#${id}-c)"><rect id="${id}-lid" x="-30" y="-30" width="60" height="60" fill="${P.skin}" ${S(4)} vector-effect="non-scaling-stroke"/></g>
    <circle r="24" fill="none" ${S(4)}/></g>`;
const puff = (x, y, dir) =>
  `<path d="M ${x} ${y - 40} q ${dir * 22} 40 0 80 M ${x + dir * 26} ${y - 26} q ${dir * 16} 26 0 52" fill="none" ${S(5)}/>`;
const patientSvg = `
<svg id="pt-cam" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${P.wall}"/>
  <rect y="0" width="${W}" height="120" fill="${P.ceiling}"/>
  <path d="M 0 120 L ${W} 120" ${S(4)}/>
  <rect y="1340" width="${W}" height="${H - 1340}" fill="${P.wallLow}"/>
  <path d="M 0 1340 L ${W} 1340" ${S(4)}/>
  <rect x="40" y="380" width="230" height="300" rx="6" fill="#F3F1E6" ${S(4)}/>
  <path d="M 80 450 h 150 M 80 500 h 120 M 80 550 h 140 M 80 600 h 90" stroke="#B9C29A" stroke-width="10" stroke-linecap="round"/>
  <!-- Stuhl -->
  <rect x="210" y="1150" width="660" height="900" rx="90" fill="${PT.chair}" ${S()}/>
  <rect x="370" y="560" width="340" height="420" rx="120" fill="${PT.chair}" ${S()}/>
  <rect x="400" y="600" width="280" height="40" rx="20" fill="${PT.chairDark}" opacity="0.6"/>
  <!-- Körper -->
  <path d="M 190 ${H} C 190 1500 250 1310 400 1262 L 680 1262 C 830 1310 890 1500 890 ${H} Z" fill="${PT.sweater}" ${S()}/>
  <path d="M 470 1262 L 540 1360 L 610 1262 Z" fill="#fff" ${S(4)}/>
  <path d="M 540 1360 L 540 1700" stroke="#2F62A6" stroke-width="6"/>
  <rect x="492" y="1150" width="96" height="120" fill="${P.skin}" ${S()}/>
  <rect x="300" y="1300" width="480" height="70" rx="20" fill="#E8F3F7" ${S(4)}/>
  <!-- Kopf -->
  <g id="pt-head">
    <ellipse cx="368" cy="870" rx="24" ry="40" fill="${P.skin}" ${S()}/>
    <ellipse cx="712" cy="870" rx="24" ry="40" fill="${P.skin}" ${S()}/>
    <g id="pt-face">
      <path d="${FACE}" fill="${P.skin}" ${S()}/>
      <ellipse cx="372" cy="1030" rx="78" ry="52" fill="${PT.blush}" opacity="0.65"/>
      <ellipse cx="708" cy="1030" rx="78" ry="52" fill="${PT.blush}" opacity="0.65"/>
      <path d="M 330 960 q 30 -20 60 -6 M 690 954 q 30 -14 60 6" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity="0.7"/>
      <g transform="translate(540 1040)">${mouth("pm-m", { s: 0.62, initial: "frown" })}</g>
    </g>
    <path d="M 378 820 C 360 700 430 606 540 602 C 652 606 722 690 702 820 C 690 770 650 730 606 726 C 586 700 546 696 524 716 C 484 704 424 734 378 820 Z" fill="${PT.hair}" ${S()}/>
    <path d="M 500 640 q 20 -40 60 -30 M 560 616 q 30 -30 64 -10" fill="none" ${S(4)}/>
    ${ptEye("pe1", 490, 870)}${ptEye("pe2", 590, 870)}
    <path id="pt-browL" d="M 452 826 L 516 806" fill="none" ${S(7)}/>
    <path id="pt-browR" d="M 564 806 L 628 826" fill="none" ${S(7)}/>
    <path d="M 540 892 q -14 30 4 36" fill="none" ${S(4)}/>
  </g>
  <g id="pt-puffs">${puff(226, 1010, -1)}${puff(854, 1010, 1)}</g>
  <!-- Kühlpack + Hand -->
  ${`<path d="M 860 ${H} C 900 1500 900 1260 820 1140" fill="none" stroke="${C.ink}" stroke-width="102" stroke-linecap="round"/><path d="M 860 ${H} C 900 1500 900 1260 820 1140" fill="none" stroke="${PT.sweater}" stroke-width="92" stroke-linecap="round"/>`}
  <g id="pt-ice" transform="rotate(14 790 1010)">
    <rect x="720" y="900" width="150" height="210" rx="34" fill="${PT.ice}" ${S()}/>
    <path d="M 795 950 v 110 M 748 978 l 94 54 M 842 978 l -94 54" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
  </g>
  <path d="M 790 1080 C 840 1070 870 1110 856 1150 C 842 1190 790 1196 772 1162 C 760 1136 762 1094 790 1080 Z" fill="${P.skin}" ${S()}/>
</svg>`;
const ctaBody = `
<div id="cta">
  <div class="ct" id="ct1">WIE DICK WAREN</div>
  <div class="ct ct-y" id="ct2">DEINE BACKEN?</div>
  <div id="ct3">Schreib's in die Kommentare ↓</div>
</div>`;
const ctaCss = `
  #cta { position: absolute; left: 0; right: 0; top: 190px; text-align: center; opacity: 0; }
  .ct { font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 88px; line-height: 1.05; color: #fff;
    -webkit-text-stroke: 16px #1d1414; paint-order: stroke fill; text-shadow: 0 8px 0 rgba(0,0,0,0.35); }
  .ct-y { color: #FFE14D; font-size: 104px; }
  #ct3 { display: inline-block; margin-top: 22px; padding: 14px 30px; border-radius: 40px; background: #1d1414;
    color: #fff; font-family: "Montserrat", sans-serif; font-weight: 800; font-size: 44px; }`;
const patientJs = `
    const P0 = ${SC.patient[0]}, P1 = ${SC.patient[1]};
    const LIDS = ["#pe1-lid", "#pe2-lid"], PUP = ["#pe1-p", "#pe2-p"];
    gsap.set(LIDS, { scaleY: 0.5, svgOrigin: "0 -30" });
    gsap.set("#pt-cam", { transformOrigin: "50% 48%", scale: 1.22 });
    gsap.set(["#pt-face", "#pt-head"], { svgOrigin: "540 1100" });
    gsap.set(["#pt-browL"], { svgOrigin: "516 806" });
    gsap.set(["#pt-browR"], { svgOrigin: "564 806" });
    gsap.set("#pt-browL", { rotation: -10 }); gsap.set("#pt-browR", { rotation: 10 });
    // Reveal: Kamera federt rein, Backen schwabbeln.
    tl.to("#pt-cam", { scale: 1, duration: 0.5, ease: "back.out(1.6)" }, P0);
    tl.fromTo("#pt-face", { scaleX: 1.12, scaleY: 0.94 }, { scaleX: 1, scaleY: 1, duration: 0.7, ease: "elastic.out(1.2,0.35)" }, P0 + 0.05);
    // Schwellung pocht.
    const talkWin = [${L.l16}];
    for (let t = P0 + 0.9; t < P1 - 0.2; t += 0.95) {
      if (t > talkWin[0] - 0.6 && t < talkWin[1]) continue;
      tl.to("#pt-face", { scaleX: 1.035, scaleY: 0.99, duration: 0.1, ease: "power2.out" }, t);
      tl.to("#pt-face", { scaleX: 1, scaleY: 1, duration: 0.45, ease: "elastic.out(1,0.4)" }, t + 0.1);
      tl.fromTo("#pt-puffs", { opacity: 1 }, { opacity: 0.25, duration: 0.5, ease: "power1.out" }, t);
    }
    // Nuscheln: Mund klein, Backen wabbeln mit.
    talk("pm", ${L.l16}, "frown", 0.14);
    for (let t = ${L.l16[0]}, i = 0; t < ${L.l16[1]} - 0.1; t += 0.14, i++)
      tl.to("#pt-head", { scaleX: i % 2 ? 1 : 1.025, duration: 0.13, ease: "sine.inOut" }, t);
    // Arzt antwortet aus dem Off: Patient schaut nach links.
    tl.to(PUP, { x: -10, y: 2, duration: 0.2, ease: "power3.out" }, ${L.l17[0]} - 0.1);
    tl.to(LIDS, { scaleY: 0.4, duration: 0.15 }, ${L.l17[0]});
    // Seufzen: Lider fallen, Kopf sinkt.
    tl.to(PUP, { x: 0, y: 6, duration: 0.3, ease: "power2.inOut" }, ${L.l18[0]});
    tl.to(LIDS, { scaleY: 0.68, duration: 0.4 }, ${L.l18[0]});
    tl.to("#pt-head", { y: 10, rotation: -2, duration: 0.6, ease: "sine.inOut" }, ${L.l18[0]});
    talk("pm", ${L.l18}, "frown", 0.22);
    [P0 + 1.4, ${L.l17[1]} + 0.2].forEach((t) => { tl.to(LIDS, { scaleY: 1, duration: 0.06 }, t); tl.to(LIDS, { scaleY: 0.5, duration: 0.09 }, t + 0.07); });
    // Kommentar-Frage
    tl.fromTo("#cta", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.2)" }, ${L.l18[0]} - 0.3);
    tl.to("#ct2", { scale: 1.08, duration: 0.12, ease: "power2.out" }, ${L.l18[0]} + 0.4);
    tl.to("#ct2", { scale: 1, duration: 0.25, ease: "power2.inOut" }, ${L.l18[0]} + 0.52);
    tl.to("#ct3", { y: 8, duration: 0.4, ease: "sine.inOut", repeat: 5, yoyo: true }, ${L.l18[0]} + 0.5);
`;

/* ================= Captions ================= */
// Karte zeigt "SPÄTER" schon groß, daher keine Untertitel dafür.
const spoken = lines.filter((l) => l.speaker !== "card");
const words = spoken.flatMap((l) =>
  VO[l.id]
    ? VO[l.id].words.map((w) => ({
        text: w.text,
        start: +(RL(l) + w.start).toFixed(3),
        end: +(RL(l) + w.end).toFixed(3),
      }))
    : wordTimes([l]).map((w) => ({
        ...w,
        start: +(w.start - l.start + RL(l)).toFixed(3),
        end: +(w.end - l.start + RL(l)).toFixed(3),
      })),
);
const capBody = words
  .map(
    (w, i) =>
      `    <div id="cap-${i}" class="cap${isEmph(w.text) ? " emph" : ""}">${w.text.replace(/[!?,.…]+$/u, "")}</div>`,
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
const HOOK_END = 3.3;
const hookBody = `
    <div id="hook">
      <div class="hk" id="hk1">SO WIRD DEIN</div>
      <div class="hk hk-y" id="hk2">WEISHEITSZAHN</div>
      <div class="hk" id="hk3">GEZOGEN</div>
    </div>`;
const hookCss = `
  #hook { position: absolute; left: 0; right: 0; top: 210px; text-align: center; transform: rotate(-3deg); }
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
      `      <audio id="${s.id}" class="clip" src="assets/sfx/${s.src}" data-start="${s.anchor ? +(R(ORIG[s.anchor][0], s.anchor) + s.offset).toFixed(3) : R(s.start)}" data-track-index="${10 + i}" data-volume="${s.volume}"></audio>`,
  )
  .join("\n");
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
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${C.mouth}; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}">
${host("kiefer", 1)}
${host("spaeter", 2, "graphics", 2)}
${host("op", 3)}
${host("praxis", 4)}
${host("captions", 5, "captions", 5)}
${host("patient", 7)}
${host("hook", 8, "graphics", 6)}
${host("marke", 6, "graphics", 4)}
${sfx}
${vo}
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
out("./compositions/kiefer.html", page("kiefer", SC.kiefer, jaw("k-"), "", pre("k-", kieferJs)));
out("./compositions/op.html", page("op", SC.op, jaw("o-"), "", pre("o-", opJs)));
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
