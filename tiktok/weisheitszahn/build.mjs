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
const lines = script.lines;
const linesFor = (who) => lines.filter((l) => l.speaker === who).map((l) => [l.start, l.end]);

// Shared runtime helpers injected into each scene script (character acting).
const HELPERS = `
  const st = {};
  const lidSel = (ch) => ["#" + ch + "-eyeL-lid", "#" + ch + "-eyeR-lid"];
  function initChar(ch, r, lid) {
    st[ch] = { lid, mouth: null };
    gsap.set(lidSel(ch), { scaleY: lid, svgOrigin: "0 " + -(r + 8) });
  }
  function lids(ch, v, t, d = 0.14) {
    st[ch].lid = v;
    tl.to(lidSel(ch), { scaleY: v, duration: d, ease: "power2.out" }, t);
  }
  function blink(ch, t) {
    const v = st[ch].lid;
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

const page = (id, dur, body, css, js) => `<template>
  <style>
    #root { position: absolute; inset: 0; overflow: hidden; }
    #root svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    ${css}
  </style>
  <div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}" data-layout-allow-overflow>
${body}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
${js}
    tl.set({}, {}, ${dur});
    window.__timelines["${id}"] = tl;
  </script>
</template>
`;

/* ================= Scene: Zahn (Kiefer + OP), 0–20 s ================= */
const GUM =
  "M -40 928 C 150 915 380 916 468 934 C 520 946 548 880 602 822 C 680 742 830 690 1120 664";
const zahnSvg = `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <g id="zahn-cam">
  <rect x="-200" y="-200" width="${W + 400}" height="${H + 400}" fill="${C.mouth}"/>
  <path d="M -200 1420 C 200 1480 700 1440 1300 1330 L 1300 2200 L -200 2200 Z" fill="${C.lowerPink}"/>
  <path d="${GUM} L 1120 1310 C 800 1400 300 1500 -40 1530 Z" fill="${C.bone}" ${S()}/>
  <path d="M -40 1470 C 300 1440 800 1350 1120 1250" fill="none" stroke="${C.boneShade}" stroke-width="60" opacity="0.7"/>

  <path id="gum-ink" d="${GUM}" fill="none" stroke="${C.ink}" stroke-width="70" stroke-linecap="round"/>
  <path id="gum-band" d="${GUM}" fill="none" stroke="${C.gum}" stroke-width="60" stroke-linecap="round"/>
  <path d="M -40 950 C 150 937 380 938 468 956" fill="none" stroke="${C.gumDark}" stroke-width="10" opacity="0.5"/>
  <path id="wz-socket" opacity="0" d="${TOOTH_PATH}" fill="${C.clot}" ${S()} transform="translate(800 1010) rotate(-68) scale(0.8) translate(0 -280)"/>

  <g transform="translate(-170 668)">${toothBody("lz-body")}</g>

  <g transform="translate(330 650)"><g id="bz-wob">
    ${toothBody("bz-body")}
    <g transform="translate(0 122)">${toothFace("bz", { r: 52, gap: 64, mouthY: 92 })}</g>
  </g></g>

  <g transform="translate(800 1010)"><g id="wz-move">
    <g transform="rotate(-68) scale(0.86) translate(0 -280)">${toothBody("wz-body", { gumLine: 140 })}</g>
  </g></g>


  <g id="wz-flap">
    <path d="M 560 905 C 590 840 640 790 720 760 C 760 790 770 830 760 860 C 700 880 640 900 560 905 Z" fill="${C.gum}" ${S()}/>
  </g>
  <path id="cut-line" d="M 566 880 C 620 830 680 800 742 790" fill="none" stroke="${C.blood}" stroke-width="9" stroke-linecap="round"/>

  <g transform="translate(800 1010)"><g id="wz-fmove">
    <g transform="translate(-118 -38) rotate(-20)">${toothFace("wz", { r: 44, gap: 52, mouthY: 78, mouthS: 0.85, mouthInit: "smirk" })}</g>
  </g></g>

  <g transform="translate(535 872)">${painStar("pain", { r: 62 })}</g>
  <g transform="translate(655 822)">${stitch("st1")}</g>
  <g transform="translate(712 796)">${stitch("st2")}</g>
  <g transform="translate(600 862)">${stitch("st3")}</g>

  <g id="syr-pos">${syringe("syr")}</g>
  <g id="scal-pos">${scalpel("scal")}</g>
  <g id="elev-pos">${elevator("elev")}</g>
  <g id="forc-pos">${forceps("forc")}</g>
  </g>
</svg>`;

const zahnJs = `${HELPERS}
    initChar("bz", 52, 0.42);
    initChar("wz", 44, 0.38);
    face("bz", "frown", 0);
    face("wz", "smirk", 0);
    look("bz", 14, 4, 0, 0.01);
    look("wz", -10, -2, 0, 0.01);
    gsap.set("#pain", { scale: 0.9, svgOrigin: "0 0" });
    gsap.set(["#st1", "#st2", "#st3"], { scale: 0, svgOrigin: "0 0" });
    gsap.set("#cut-line", { strokeDasharray: 220, strokeDashoffset: 220 });
    gsap.set("#syr-pos", { x: 1180, y: 20, rotation: 28, svgOrigin: "0 0" });
    gsap.set("#scal-pos", { x: 1200, y: 300, rotation: 52, svgOrigin: "0 0" });
    gsap.set("#elev-pos", { x: 980, y: -560, rotation: 18, svgOrigin: "0 0" });
    gsap.set("#forc-pos", { x: 760, y: -900, rotation: 16, svgOrigin: "0 0" });
    gsap.set(["#wz-move", "#wz-fmove"], { svgOrigin: "0 0" });
    gsap.set("#bz-wob", { svgOrigin: "0 600" });

    // --- the wisdom tooth keeps shoving (0–8.8 s)
    [0.1, 1.2, 2.6, 3.9, 5.0, 6.2, 7.4].forEach((t, i) => {
      tl.to(["#wz-move", "#wz-fmove"], { rotation: -4, x: -10, duration: 0.16, ease: "power2.out" }, t);
      tl.to(["#wz-move", "#wz-fmove"], { rotation: 0, x: 0, duration: 0.35, ease: "power2.inOut" }, t + 0.18);
      tl.to("#bz-wob", { rotation: -2.2, duration: 0.12, ease: "power2.out" }, t + 0.06);
      tl.to("#bz-wob", { rotation: 0, duration: 0.4, ease: "elastic.out(1,0.5)" }, t + 0.2);
      tl.to("#pain", { scale: 0.75, duration: 0.04 }, t + 0.03); tl.to("#pain", { scale: 1.15, duration: 0.25, ease: "back.out(3)" }, t + 0.08);
    });
    tl.to("#pain", { scale: 0, opacity: 0, duration: 0.2 }, 8.7);

    // dialogue (lip flap from script.json)
    const bzLines = ${JSON.stringify(linesFor("bz"))};
    const wzLines = ${JSON.stringify(linesFor("wz"))};
    talk("bz", bzLines[0][0], bzLines[0][1], "frown");
    look("wz", -14, -6, 0.4);
    talk("wz", wzLines[0][0], wzLines[0][1], "smirk");
    squeeze("bz", true, 3.5); talk("bz", bzLines[1][0], bzLines[1][1], "wavy"); squeeze("bz", false, 5.6);
    lids("wz", 0.5, 5.6); talk("wz", wzLines[1][0], wzLines[1][1], "smirk");
    lids("bz", 0.0, 6.9, 0.1); look("bz", 0, -14, 6.9); talk("bz", bzLines[2][0], bzLines[2][1], "flat");
    blink("wz", 1.6); blink("bz", 2.9); blink("wz", 4.6); blink("bz", 6.4); blink("wz", 8.1);

    // --- after the "SPÄTER" card (10.4 s): needle
    lids("bz", 0, 10.4, 0.01); face("bz", "flat", 10.4); look("bz", 16, -10, 10.4, 0.01);
    lids("wz", 0, 10.4, 0.01); face("wz", "flat", 10.4); look("wz", 0, 0, 10.4, 0.01);
    tl.to("#syr-pos", { x: 700, y: 812, duration: 0.55, ease: "power3.out" }, 10.5);
    look("wz", 12, -16, 10.55); look("bz", 22, -14, 10.55);
    tl.to("#syr-plunger", { y: 90, duration: 0.6, ease: "power1.inOut" }, 11.2);
    squeeze("wz", true, 11.05); talk("wz", wzLines[2][0], wzLines[2][1], "wavy"); squeeze("wz", false, 12.5);
    shake(["#wz-move", "#wz-fmove"], 11.05, 0.35, 6);
    tl.to("#syr-pos", { x: 1180, y: 20, duration: 0.45, ease: "power3.in" }, 12.0);
    lids("wz", 0.55, 12.55, 0.3); look("wz", -6, 6, 12.55, 0.4);

    // scalpel opens the gum
    tl.to("#scal-pos", { x: 566, y: 880, duration: 0.4, ease: "power3.out" }, 12.85);
    tl.to("#scal-pos", { x: 742, y: 790, duration: 0.55, ease: "power1.inOut" }, 13.3);
    tl.to("#cut-line", { strokeDashoffset: 0, duration: 0.55, ease: "power1.inOut" }, 13.3);
    tl.to("#scal-pos", { x: 1260, y: 420, duration: 0.4, ease: "power3.in" }, 13.9);
    tl.to("#wz-flap", { x: 70, y: -60, rotation: 25, svgOrigin: "760 760", duration: 0.35, ease: "back.out(2)" }, 13.95);
    tl.to("#cut-line", { opacity: 0, duration: 0.2 }, 14.0);
    look("bz", 30, 0, 13.2);

    // elevator loosens it
    tl.to("#elev-pos", { x: 548, y: 902, duration: 0.4, ease: "power3.out" }, 14.15);
    lids("wz", 0, 14.4, 0.08); look("wz", 0, -12, 14.4, 0.1);
    talk("wz", wzLines[3][0], wzLines[3][1], "wavy");
    [14.6, 14.9, 15.2, 15.5].forEach((t, i) => {
      const s = i % 2 ? -1 : 1;
      tl.to("#elev-pos", { rotation: 18 + s * 9, duration: 0.14, ease: "power2.inOut" }, t);
      tl.to(["#wz-move", "#wz-fmove"], { rotation: s * 5, duration: 0.14, ease: "power2.inOut" }, t);
    });
    tl.to(["#wz-move", "#wz-fmove"], { rotation: 0, duration: 0.15 }, 15.75);
    tl.to("#elev-pos", { x: 980, y: -560, duration: 0.35, ease: "power3.in" }, 15.8);

    // forceps pull it out
    tl.set("#forc-armL", { rotation: -10, svgOrigin: "0 -232" }, 0);
    tl.set("#forc-armR", { rotation: 10, svgOrigin: "0 -232" }, 0);
    tl.to("#forc-pos", { x: 640, y: 905, duration: 0.45, ease: "power3.out" }, 15.95);
    tl.to("#forc-armL", { rotation: 0, duration: 0.12 }, 16.4);
    tl.to("#forc-armR", { rotation: 0, duration: 0.12 }, 16.4);
    squeeze("wz", true, 16.45); face("wz", "open", 16.45);
    tl.set("#wz-socket", { opacity: 1 }, 16.6);
    tl.to("#wz-flap", { opacity: 0, duration: 0.15 }, 16.6);
    tl.to(["#forc-pos"], { y: "-=1500", rotation: 30, duration: 0.6, ease: "power3.in" }, 16.6);
    tl.to(["#wz-move", "#wz-fmove"], { y: -1500, rotation: 18, duration: 0.6, ease: "power3.in" }, 16.6);
    shake("#bz-wob", 16.65, 0.4, 3, "rotation");
    look("bz", 30, -40, 16.7, 0.2);

    // clot + stitches
    tl.to("#wz-flap", { opacity: 1, x: 0, y: 0, rotation: 0, duration: 0.3, ease: "power2.out" }, 17.5);
    ["#st3", "#st1", "#st2"].forEach((s, i) => tl.to(s, { scale: 1, duration: 0.18, ease: "back.out(3)" }, 18.05 + i * 0.2));
    look("bz", 16, 6, 17.9);
    talk("bz", bzLines[3][0], bzLines[3][1], "smile");
    lids("bz", 0.55, 18.4, 0.3);
    look("bz", 0, 6, 18.4);
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
    tl.fromTo("#sp-text", { scale: 1.25, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: "back.out(2)" }, 0.05);
    tl.fromTo("#sp-flowers", { scale: 1.08, transformOrigin: "50% 50%" }, { scale: 1, duration: 1.4, ease: "none" }, 0);
`;

/* ================= Scene: Praxis, 20–30 s ================= */
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

  <!-- dental chair -->
  <g id="chair">
    <ellipse cx="820" cy="1560" rx="150" ry="28" fill="#BFC4CA" ${S()}/>
    <rect x="775" y="1300" width="90" height="260" fill="#CDD1D6" ${S()}/>
    <g transform="rotate(14 960 1240)"><rect x="905" y="760" width="120" height="500" rx="40" fill="${C.chair}" ${S()}/></g>
    <ellipse cx="990" cy="700" rx="70" ry="48" fill="${C.chair}" ${S()}/>
    <rect x="620" y="1220" width="360" height="90" rx="36" fill="${C.chair}" ${S()}/>
    <rect x="640" y="1290" width="330" height="22" rx="10" fill="${C.chairDark}"/>
  </g>

  <!-- patient -->
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
  </g>

  <!-- dentist -->
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
    const docLines = ${JSON.stringify(linesFor("arzt").map(([a, b]) => [+(a - 20).toFixed(2), +(b - 20).toFixed(2)]))};
    st["doc"] = { lid: 0 };
    gsap.set(["#de1-lid", "#de2-lid"], { scaleY: 0.2, svgOrigin: "0 -21" });
    gsap.set(["#pe1-lid", "#pe2-lid"], { scaleY: 0.25, svgOrigin: "0 -21" });
    gsap.set(["#pe1-p", "#pe2-p"], { x: -10 });
    docLines.forEach(([a, b]) => talk("doc", a, b, "flat", 0.12));
    const blinkP = (sel, t, v) => { tl.to(sel, { scaleY: 1, duration: 0.06 }, t); tl.to(sel, { scaleY: v, duration: 0.08 }, t + 0.07); };
    [1.2, 4.1, 6.9, 9.0].forEach((t) => blinkP(["#de1-lid", "#de2-lid"], t, 0.2));
    [2.3, 5.4, 8.2].forEach((t) => blinkP(["#pe1-lid", "#pe2-lid"], t, 0.25));
    tl.to("#doc-arm", { rotation: -3, svgOrigin: "372 712", duration: 1.2, ease: "sine.inOut", yoyo: true, repeat: 7 }, 0.3);
`;

/* ================= Captions overlay, 0–30 s ================= */
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
      tl.fromTo(el, { scale: 0.82 }, { scale: 1, duration: 0.09, ease: "back.out(3)" }, s);
      tl.set(el, { opacity: 0 }, end);
    });
`;
const capCss = `${CAPTION_CSS}
  #wm { position: absolute; left: 70px; top: 1500px; font-family: "Montserrat", sans-serif; font-weight: 700;
    font-size: 44px; color: rgba(255,255,255,0.32); transform: rotate(32deg); transform-origin: left center; }`;

/* ================= index.html ================= */
const sfx = script.sfx
  .map(
    (s, i) =>
      `      <audio id="${s.id}" class="clip" src="assets/sfx/${s.src}" data-start="${s.start}" data-track-index="${10 + i}" data-volume="${s.volume}"></audio>`,
  )
  .join("\n");
const host = (id, start, dur, track, kind = "graphics", z = 1) =>
  `      <div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${start}" data-duration="${dur}" data-track-index="${track}" data-track-kind="${kind}" data-width="${W}" data-height="${H}" style="z-index:${z}"></div>`;

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
${host("zahn", 0, 20, 1, "graphics", 1)}
${host("spaeter", 9.0, 1.4, 2, "graphics", 2)}
${host("praxis", 20, 10, 3, "graphics", 1)}
${host("captions", 0, DUR, 4, "captions", 5)}
${host("marke", 0, DUR, 5, "graphics", 4)}
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
      font-size: 46px; color: rgba(255,255,255,0.3); transform: rotate(32deg); transform-origin: left center; }
  </style>
  <div id="root" data-composition-id="marke" data-width="${W}" data-height="${H}">
    <div id="wm" data-var-text="handle">${script.handle}</div>
  </div>
  <script>
    window.__timelines["marke"] = gsap.timeline({ paused: true });
  </script>
</template>
`;

writeFileSync(new URL("./index.html", import.meta.url), index);
writeFileSync(
  new URL("./compositions/zahn.html", import.meta.url),
  page("zahn", 20, zahnSvg, "", zahnJs),
);
writeFileSync(
  new URL("./compositions/spaeter.html", import.meta.url),
  page("spaeter", 1.4, spaeterSvg, spaeterCss, spaeterJs),
);
writeFileSync(
  new URL("./compositions/praxis.html", import.meta.url),
  page("praxis", 10, praxisSvg, "", praxisJs),
);
writeFileSync(
  new URL("./compositions/captions.html", import.meta.url),
  page("captions", DUR, capBody, capCss, capJs),
);
writeFileSync(new URL("./compositions/marke.html", import.meta.url), marke);
console.log(`built: ${words.length} caption words, ${script.sfx.length} sfx`);
