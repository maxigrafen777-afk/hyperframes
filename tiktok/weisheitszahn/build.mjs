// Generates index.html + compositions/*.html from script.json.
// Run: node build.mjs
import { readFileSync, writeFileSync } from "node:fs";
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
const DUR = script.duration;
const SC = script.scenes;
const lines = script.lines;
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
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
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
    face("@bz", "frown", 0); face("@wz", "smirk", 0);
    look("@bz", 14, 4, 0, 0.01); look("@wz", -10, -2, 0, 0.01);
    tl.set("#@pain", { scale: 0.9 }, 0);
    [0.1, 1.3, 2.7, 4.0, 5.2, 6.4, 7.6, 8.8].forEach((t) => {
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
    squeeze("@bz", true, 4.5); talk("@bz", ${L.l3}, "wavy"); squeeze("@bz", false, 6.5);
    lids("@wz", 0.5, 6.5); talk("@wz", ${L.l4}, "smirk");
    lids("@bz", 0.0, 7.8, 0.1); look("@bz", 0, -14, 7.8); talk("@bz", ${L.l5}, "frown");
    blink("@wz", 1.6, 0.38); blink("@bz", 3.0, 0.42); blink("@wz", 5.0, 0.38); blink("@wz", 9.0, 0.5);
`;

/* ---------- Scene 3: OP ---------- */
const opJs = `${HELPERS}${JAW_INIT}
    face("@bz", "flat", 11.2); face("@wz", "flat", 11.2);
    lids("@bz", 0, 11.2, 0.01); lids("@wz", 0, 11.2, 0.01);
    look("@bz", 16, -10, 11.2, 0.01); look("@wz", 0, 0, 11.2, 0.01);
    gsap.set("#@incision", { opacity: 1, strokeDasharray: 420, strokeDashoffset: 420 });
    gsap.set("#@wz-cut", { opacity: 1, strokeDasharray: 360, strokeDashoffset: 360 });

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
const flower = (x, y, s, rot) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${[0, 72, 144, 216, 288]
    .map(
      (a) =>
        `<ellipse cx="0" cy="-60" rx="38" ry="62" transform="rotate(${a})" fill="#3A2290" stroke="#1B1046" stroke-width="6"/>`,
    )
    .join("")}<circle r="22" fill="#24155E"/></g>`;
const spaeterSvg = `
<svg viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#07060C"/>
  <g id="sp-flowers" opacity="0.85">
    ${flower(150, 760, 1.4, 10)}${flower(470, 690, 1.0, 40)}${flower(820, 760, 1.5, -20)}
    ${flower(300, 1010, 1.1, 70)}${flower(680, 1040, 1.3, 15)}${flower(1010, 980, 0.9, 50)}${flower(60, 1080, 0.8, 30)}
  </g>
</svg>
<div id="sp-text">SPÄTER…</div>`;
const spaeterCss = `
  #sp-text { position: absolute; left: 0; right: 0; top: 820px; text-align: center;
    font-family: "Archivo Black", sans-serif; font-size: 150px; color: #7DF3EC; letter-spacing: 2px;
    -webkit-text-stroke: 10px #0B2B44; paint-order: stroke fill; text-shadow: 0 0 40px rgba(125,243,236,0.45); }`;
const spaeterJs = `
    tl.fromTo("#sp-text", { scale: 1.25, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: "back.out(2)" }, O + 0.05);
    tl.fromTo("#sp-flowers", { scale: 1.08, transformOrigin: "50% 50%" }, { scale: 1, duration: 1.4, ease: "none" }, O);
`;

/* ================= Scene: Praxis ================= */
const tiles = (() => {
  let s = "";
  for (let i = -6; i <= 12; i++)
    s += `<line x1="${540 + i * 120}" y1="1360" x2="${540 + i * 260}" y2="1920" stroke="${C.floorLine}" stroke-width="4"/>`;
  [1430, 1530, 1660, 1820].forEach(
    (y) =>
      (s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${C.floorLine}" stroke-width="4"/>`),
  );
  return s;
})();
const limb = (d, w, fill) =>
  `<path d="${d}" fill="none" stroke="${C.ink}" stroke-width="${w + 10}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const eyeSmall = (id, x, y, r = 17) =>
  `<g transform="translate(${x} ${y})"><g id="${id}"><circle r="${r}" fill="#fff" ${S(4)}/><circle id="${id}-p" cx="5" r="${r * 0.42}" fill="${C.ink}"/><clipPath id="${id}-c"><circle r="${r}"/></clipPath><g clip-path="url(#${id}-c)"><rect id="${id}-lid" x="${-r - 4}" y="${-r - 4}" width="${2 * r + 8}" height="${2 * r + 8}" fill="var(--lid)" ${S(4)} vector-effect="non-scaling-stroke"/></g><circle r="${r}" fill="none" ${S(4)}/></g></g>`;

const praxisSvg = `
<svg viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.wall}"/>
  <rect y="0" width="${W}" height="70" fill="#C8D3A0"/>
  <rect y="420" width="${W}" height="26" fill="${C.trim}" ${S(3)}/>
  <rect y="446" width="${W}" height="914" fill="${C.wallLow}"/>
  <rect y="1360" width="${W}" height="560" fill="${C.floor}"/>
  ${tiles}
  <rect y="1340" width="${W}" height="26" fill="#6B5A47" ${S(3)}/>
  <g id="chair">
    <ellipse cx="820" cy="1560" rx="150" ry="28" fill="#BFC4CA" ${S()}/>
    <rect x="775" y="1300" width="90" height="260" fill="#CDD1D6" ${S()}/>
    <g transform="rotate(14 960 1240)"><rect x="905" y="760" width="120" height="500" rx="40" fill="${C.chair}" ${S()}/></g>
    <ellipse cx="990" cy="700" rx="70" ry="48" fill="${C.chair}" ${S()}/>
    <rect x="620" y="1220" width="360" height="90" rx="36" fill="${C.chair}" ${S()}/>
    <rect x="640" y="1290" width="330" height="22" rx="10" fill="${C.chairDark}"/>
  </g>
  <g id="pat" style="--lid:${C.skinLight}">
    ${limb("M 860 1250 L 690 1262 L 680 1500", 86, C.pants)}
    <ellipse cx="650" cy="1520" rx="62" ry="24" fill="#1A1A1C" ${S()}/>
    ${limb("M 820 1240 L 640 1240 L 610 1490", 86, C.pants)}
    <ellipse cx="580" cy="1512" rx="62" ry="24" fill="#1A1A1C" ${S()}/>
    <path d="M 800 900 C 820 870 900 868 930 885 C 960 905 970 960 968 1020 L 975 1250 L 790 1250 C 776 1120 772 980 800 900 Z" fill="${C.sweater}" ${S()}/>
    <path d="M 860 1020 L 870 1240" stroke="#2F62A6" stroke-width="5"/>
    <path d="M 835 880 L 870 935 L 905 880 Z" fill="#fff" ${S(4)}/>
    ${limb("M 830 940 L 800 1120 L 720 1150", 60, C.sweater)}
    <circle cx="712" cy="1152" r="27" fill="${C.skinLight}" ${S()}/>
    <rect x="845" y="830" width="44" height="60" fill="${C.skinLight}" ${S()}/>
    <ellipse cx="868" cy="770" rx="68" ry="80" fill="${C.skinLight}" ${S()}/>
    <ellipse cx="935" cy="785" rx="12" ry="20" fill="${C.skinLight}" ${S(4)}/>
    <path d="M 800 760 C 790 680 850 660 880 668 C 930 672 950 710 940 770 C 930 735 900 712 870 718 C 840 722 815 735 800 760 Z" fill="${C.hairDark}" ${S()}/>
    ${eyeSmall("pe1", 840, 772)}${eyeSmall("pe2", 885, 772)}
    <path d="M 856 790 Q 846 812 860 815" fill="none" ${S(4)}/>
    <path d="M 845 838 Q 860 832 876 838" fill="none" ${S(4)}/>
    <path d="M 905 800 q 10 -14 0 -24" fill="none" stroke="#E7A0A0" stroke-width="6" stroke-linecap="round"/>
  </g>
  <g id="doc" style="--lid:${C.skinMid}">
    <path d="M 205 1180 L 265 1180 L 262 1505 L 212 1505 Z" fill="${C.scrubs}" ${S()}/>
    <path d="M 290 1180 L 350 1180 L 345 1505 L 293 1505 Z" fill="${C.scrubs}" ${S()}/>
    <ellipse cx="228" cy="1522" rx="52" ry="22" fill="#1A1A1C" ${S()}/>
    <ellipse cx="322" cy="1522" rx="52" ry="22" fill="#1A1A1C" ${S()}/>
    <rect x="258" y="625" width="44" height="60" fill="${C.skinMid}" ${S()}/>
    <path d="M 170 700 C 185 670 230 662 280 668 C 330 662 372 670 388 700 L 410 1230 L 150 1230 Z" fill="${C.coat}" ${S()}/>
    <path d="M 255 670 L 280 760 L 305 670 Z" fill="${C.scrubs}" ${S(4)}/>
    <path d="M 280 760 L 280 1230" ${S(4)}/>
    <path d="M 255 670 L 230 760 L 280 860 M 305 670 L 330 760 L 280 860" fill="none" ${S(4)}/>
    <path d="M 190 1000 h 60 v 50 h -60 Z M 315 990 h 60 v 50 h -60 Z" fill="none" ${S(4)}/>
    ${limb("M 185 710 L 160 900 L 168 1060", 66, C.coat)}
    <circle cx="170" cy="1085" r="28" fill="${C.skinMid}" ${S()}/>
    <g id="doc-arm">
      ${limb("M 372 712 L 430 900 L 470 760", 62, C.coat)}
      <line x1="472" y1="756" x2="560" y2="694" stroke="#8D949B" stroke-width="9" stroke-linecap="round"/>
      <circle cx="568" cy="688" r="17" fill="#DCE3E8" ${S(4)}/>
      <circle cx="470" cy="752" r="28" fill="${C.skinMid}" ${S()}/>
    </g>
    <circle cx="280" cy="470" r="44" fill="${C.hairBrown}" ${S()}/>
    <ellipse cx="280" cy="565" rx="72" ry="84" fill="${C.skinMid}" ${S()}/>
    <ellipse cx="208" cy="575" rx="12" ry="20" fill="${C.skinMid}" ${S(4)}/>
    <ellipse cx="352" cy="575" rx="12" ry="20" fill="${C.skinMid}" ${S(4)}/>
    <path d="M 208 570 C 200 480 255 465 280 466 C 330 466 362 500 352 570 C 340 525 300 505 270 510 C 240 512 218 535 208 570 Z" fill="${C.hairBrown}" ${S()}/>
    ${eyeSmall("de1", 256, 568)}${eyeSmall("de2", 304, 568)}
    <path d="M 284 585 Q 296 610 280 614" fill="none" ${S(4)}/>
    <g transform="translate(282 638)">${mouth("doc-m", { s: 0.75, initial: "flat" })}</g>
  </g>
</svg>`;

const praxisJs = `${HELPERS}
    const docLines = ${JSON.stringify(lines.filter((l) => l.speaker === "arzt").map((l) => [l.start, l.end]))};
    gsap.set(["#de1-lid", "#de2-lid"], { scaleY: 0.2, svgOrigin: "0 -21" });
    gsap.set(["#pe1-lid", "#pe2-lid"], { scaleY: 0.25, svgOrigin: "0 -21" });
    gsap.set(["#pe1-p", "#pe2-p"], { x: -10 });
    docLines.forEach(([a, b]) => talk("doc", a, b, "flat", 0.12));
    const blinkP = (sel, t, v) => { tl.to(sel, { scaleY: 1, duration: 0.06 }, t); tl.to(sel, { scaleY: v, duration: 0.08 }, t + 0.07); };
    [36.2, 39.1, 41.9, 45.0].forEach((t) => blinkP(["#de1-lid", "#de2-lid"], t, 0.2));
    [37.3, 40.4, 43.2, 46.4].forEach((t) => blinkP(["#pe1-lid", "#pe2-lid"], t, 0.25));
    [35.3, 37.5, 39.7, 41.9, 44.1, 46.3].forEach((t, i) =>
      tl.to("#doc-arm", { rotation: i % 2 ? 0 : -3, svgOrigin: "372 712", duration: 1.2, ease: "sine.inOut" }, t));
`;

/* ================= Captions ================= */
const words = wordTimes(lines);
const capBody = words
  .map((w, i) => `    <div id="cap-${i}" class="cap">${w.text.replace(/[!?,.…]+$/u, "")}</div>`)
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

/* ================= index.html ================= */
const sfx = script.sfx
  .map(
    (s, i) =>
      `      <audio id="${s.id}" class="clip" src="assets/sfx/${s.src}" data-start="${s.start}" data-track-index="${10 + i}" data-volume="${s.volume}"></audio>`,
  )
  .join("\n");
const host = (id, track, kind = "graphics", z = 1) => {
  const [a, b] = SC[id] || [0, DUR];
  return `      <div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${a}" data-duration="${+(b - a).toFixed(2)}" data-track-index="${track}" data-track-kind="${kind}" data-width="${W}" data-height="${H}" style="z-index:${z}"></div>`;
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
${host("marke", 6, "graphics", 4)}
${sfx}
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

const out = (f, s) => writeFileSync(new URL(f, import.meta.url), s);
const pre = (p, js) => js.replaceAll("@", p);
out("./index.html", index);
out("./compositions/kiefer.html", page("kiefer", SC.kiefer, jaw("k-"), "", pre("k-", kieferJs)));
out("./compositions/op.html", page("op", SC.op, jaw("o-"), "", pre("o-", opJs)));
out("./compositions/spaeter.html", page("spaeter", SC.spaeter, spaeterSvg, spaeterCss, spaeterJs));
out("./compositions/praxis.html", page("praxis", SC.praxis, praxisSvg, "", praxisJs));
out("./compositions/captions.html", page("captions", [0, DUR], capBody, CAPTION_CSS, capJs));
out("./compositions/marke.html", marke);
console.log(`built: ${words.length} caption words, ${script.sfx.length} sfx, ${DUR}s`);
