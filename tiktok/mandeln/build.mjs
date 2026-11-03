// Mandeln. Generates index.html + compositions/*.html from script.json.
// Run: node build.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import {
  C,
  S,
  toothFace,
  forceps,
  scissors,
  painStar,
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
  teaser: 0,
  streit: 0.08,
  nachher: 0.08,
  op: 0.2,
  frage: 0.2,
  praxis: 0.3,
  patient: 0.25,
};
const PAD = {
  teaser: 0.5,
  streit: 0.35,
  nachher: 0.4,
  op: 0.4,
  frage: 0.4,
  praxis: 0.4,
  patient: 2.3,
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
    if (prevEnd > 0 && l.start < prevEnd + GAP[id]) l.start = +(prevEnd + GAP[id]).toFixed(2);
    l.end = +(l.start + VO[l.id].duration).toFixed(2);
    prevEnd = l.end;
  }
  const end = prevEnd > 0 ? Math.max(b, prevEnd + PAD[id]) : b;
  SC[id] = [a, +end.toFixed(2)];
  SHIFT[id] = +(realT - a).toFixed(3);
  realT += end - a;
}
const R = (t, scene = sceneOf0(t)) => +(t + SHIFT[scene]).toFixed(3);
const RL = (l) => R(l.start, LINE_SCENE[l.id]);
const DUR = +realT.toFixed(2);
const HOOK_END = +(SC.teaser[1] - SC.teaser[0] - 0.55).toFixed(2);
// Betonte Wörter (im Skript GROSS geschrieben) -> gelbe Untertitel + Kamera-Punch.
// Betonte Wörter stehen pro Zeile in "emph" (der Sprechtext bleibt normal
// geschrieben, sonst liest v3 GROSSBUCHSTABEN als Abkürzung).
const bare = (w) => w.toLowerCase().replace(/[^\p{L}]/gu, "");
const isEmphIn = (l, w) => (l.emph || []).some((e) => bare(e) === bare(w));
const emphTimes = (scene) =>
  lines
    .filter((l) => LINE_SCENE[l.id] === scene && VO[l.id])
    .flatMap((l) =>
      VO[l.id].words.filter((w) => isEmphIn(l, w.text)).map((w) => +(l.start + w.start).toFixed(3)),
    );

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

/* ================= Rachen (geteilt von teaser, streit, nachher, op) ================= */
// Blick in den offenen Mund: Gaumen mit Zahnreihe oben, Zäpfchen (zp) in der
// Mitte, Mandel links (ml) und rechts (mr), Zunge unten.
const TZ = {
  bg: "#3E0C16",
  wall: "#6E1C2B",
  palate: "#D9848F",
  palateShade: "#C46F7C",
  uvula: "#EBA3AA",
  tonsil: "#E9928F",
  tonsilRed: "#D9443F",
  pus: "#F6F0C2",
  bed: "#8E2433",
  tongue: "#E46B7A",
  tongueShade: "#C9505F",
  teeth: "#F8F7F1",
};
const POS = { zp: [540, 820], ml: [300, 1080], mr: [780, 1080], eis: [540, 990] };
const UVULA =
  "M 492 430 C 494 560 440 690 440 800 C 440 935 640 935 640 800 C 640 690 586 560 588 430 Z";
const TONSIL = (cx, cy) =>
  `M ${cx - 150} ${cy - 20} C ${cx - 160} ${cy - 150} ${cx - 70} ${cy - 210} ${cx} ${cy - 205} C ${cx + 80} ${cy - 210} ${cx + 160} ${cy - 140} ${cx + 150} ${cy - 10} C ${cx + 165} ${cy + 110} ${cx + 90} ${cy + 205} ${cx} ${cy + 200} C ${cx - 95} ${cy + 205} ${cx - 165} ${cy + 120} ${cx - 150} ${cy - 20} Z`;
const tonsil = (p, k, [cx, cy]) => `
  <g id="${p}${k}-t">
    <path id="${p}${k}-body" d="${TONSIL(cx, cy)}" fill="${TZ.tonsil}" ${S()}/>
    <path d="M ${cx - 100} ${cy - 120} q 20 -14 40 0 M ${cx + 60} ${cy - 130} q 20 -14 40 0 M ${cx - 110} ${cy + 120} q 20 14 40 0 M ${cx + 70} ${cy + 130} q 20 14 40 0 M ${cx - 20} ${cy + 165} q 20 10 40 0" fill="none" stroke="#B9595A" stroke-width="7" stroke-linecap="round"/>
    <g id="${p}${k}-pus" opacity="0">${[
      [-90, -60, 16],
      [100, -40, 13],
      [-70, 150, 14],
      [90, 140, 17],
      [10, -160, 12],
    ]
      .map(
        ([dx, dy, r]) =>
          `<ellipse cx="${cx + dx}" cy="${cy + dy}" rx="${r}" ry="${r * 0.8}" fill="${TZ.pus}" ${S(3)}/>`,
      )
      .join("")}</g>
    <ellipse id="${p}${k}-frost" cx="${cx}" cy="${cy}" rx="150" ry="200" fill="#9FDCF7" opacity="0"/>
    <g transform="translate(${cx} ${cy - 40})">${toothFace(p + k, { r: 44, gap: 56, mouthY: 78, mouthS: 0.9, mouthInit: "smirk", lidFill: TZ.tonsil })}</g>
  </g>`;
const throat = (p, env = "inside") => `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
 <g id="${p}frame"><g id="${p}cam">
  <rect x="-400" y="-400" width="${W + 800}" height="${H + 1000}" fill="${TZ.bg}"/>
  <ellipse cx="540" cy="1100" rx="340" ry="560" fill="${TZ.wall}"/>
  ${[440, 540, 640].map((x) => `<path d="M ${x} 700 C ${x - 10} 1000 ${x + 10} 1300 ${x} 1500" fill="none" stroke="#5C1624" stroke-width="10" stroke-linecap="round"/>`).join("")}
  <path d="M -400 600 C 0 620 150 700 190 900 C 220 1100 150 1320 40 1480 L -400 1480 Z" fill="#A9485A" ${S()}/>
  <path d="M 1480 600 C 1080 620 930 700 890 900 C 860 1100 930 1320 1040 1480 L 1480 1480 Z" fill="#A9485A" ${S()}/>
  <ellipse id="${p}bedL" cx="${POS.ml[0]}" cy="${POS.ml[1]}" rx="140" ry="190" fill="${TZ.bed}" ${S(4)}/>
  <ellipse id="${p}bedR" cx="${POS.mr[0]}" cy="${POS.mr[1]}" rx="140" ry="190" fill="${TZ.bed}" ${S(4)}/>
  <path d="M -400 -400 L 1480 -400 L 1480 620 C 1200 640 900 520 760 470 C 680 440 600 430 540 430 C 480 430 400 440 320 470 C 180 520 -120 640 -400 620 Z" fill="${TZ.palate}" ${S()}/>
  ${[300, 360].map((y) => `<path d="M 200 ${y} C 380 ${y + 40} 700 ${y + 40} 880 ${y}" fill="none" stroke="${TZ.palateShade}" stroke-width="10" stroke-linecap="round"/>`).join("")}
  ${Array.from({ length: 9 }, (_, i) => {
    const x = 60 + i * 120;
    const y = -60 + ((x - 540) / 540) ** 2 * 70;
    return `<rect x="${x - 54}" y="${y}" width="108" height="150" rx="34" fill="${TZ.teeth}" ${S()}/>`;
  }).join("")}
  <g id="${p}zp-t">
    <path id="${p}zp-body" d="${UVULA}" fill="${TZ.uvula}" ${S()}/>
    <path d="M 470 760 C 466 720 478 660 498 610" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity="0.5"/>
    <g transform="translate(540 795)">${toothFace(p + "zp", { r: 34, gap: 42, mouthY: 62, mouthS: 0.7, mouthInit: "frown", lidFill: TZ.uvula })}</g>
  </g>
  ${tonsil(p, "ml", POS.ml)}
  ${tonsil(p, "mr", POS.mr)}
  <path id="${p}cutL" opacity="0" d="${TONSIL(POS.ml[0], POS.ml[1])}" fill="none" stroke="${C.blood}" stroke-width="8" stroke-linecap="round"/>
  <path id="${p}cutR" opacity="0" d="${TONSIL(POS.mr[0], POS.mr[1])}" fill="none" stroke="${C.blood}" stroke-width="8" stroke-linecap="round"/>
  ${[
    [170, 860],
    [400, 900],
    [690, 900],
    [920, 860],
    [250, 1330],
    [840, 1330],
  ]
    .map(
      ([x, y], i) =>
        `<g id="${p}bac${i}" opacity="0"><circle cx="${x}" cy="${y}" r="20" fill="#86CF6E" ${S(4)}/><circle cx="${x - 6}" cy="${y - 4}" r="4" fill="${C.ink}"/><circle cx="${x + 7}" cy="${y - 4}" r="4" fill="${C.ink}"/><path d="M ${x - 6} ${y + 8} q 6 5 12 0" fill="none" ${S(3)}/></g>`,
    )
    .join("")}
  <path id="${p}tongue" d="M -400 1500 C 0 1380 300 1340 540 1340 C 780 1340 1080 1380 1480 1500 L 1480 2600 L -400 2600 Z" fill="${TZ.tongue}" ${S()}/>
  <path d="M 540 1420 C 546 1620 546 1820 540 2050" fill="none" stroke="${TZ.tongueShade}" stroke-width="12" stroke-linecap="round"/>
  <g id="${p}ice" opacity="0">
    <g id="${p}ice-stick"><rect x="522" y="1100" width="36" height="170" rx="16" fill="#E2B474" ${S(4)}/></g>
    <g id="${p}ice-body">
      <path d="M 462 1130 L 462 900 C 462 836 618 836 618 900 L 618 1130 Z" fill="#8FD8F0" ${S()}/>
      <path d="M 462 1060 L 618 1060 L 618 1130 L 462 1130 Z" fill="#F7A8C4" ${S(4)}/>
      <path d="M 486 900 C 486 880 500 866 516 862" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity="0.8"/>
      ${[
        [440, 880],
        [645, 900],
        [452, 1020],
      ]
        .map(
          ([x, y]) =>
            `<path d="M ${x} ${y - 14} v 28 M ${x - 14} ${y} h 28 M ${x - 10} ${y - 10} l 20 20 M ${x + 10} ${y - 10} l -20 20" stroke="#E6F8FF" stroke-width="5" stroke-linecap="round"/>`,
        )
        .join("")}
      <g transform="translate(540 960)">${toothFace(p + "eis", { r: 26, gap: 32, mouthY: 50, mouthS: 0.55, mouthInit: "smile", lidFill: "#8FD8F0" })}</g>
      ${[0, 1, 2].map((i) => `<path id="${p}drip${i}" opacity="0" d="M ${480 + i * 55} 1130 q -8 18 0 30 q 8 -12 0 -30 Z" fill="#8FD8F0" ${S(3)}/>`).join("")}
    </g>
  </g>

  ${[0, 1, 2].map((i) => `<path id="${p}steam${i}" opacity="0" d="M ${480 + i * 60} 960 q -18 -26 0 -52 t 0 -52" fill="none" stroke="#F4F0F0" stroke-width="10" stroke-linecap="round"/>`).join("")}
  <g transform="translate(540 1180)">${painStar(p + "pain", { r: 56 })}</g>
  ${
    env === "op"
      ? `<defs><radialGradient id="${p}lamp" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
  <rect x="-400" y="-400" width="${W + 800}" height="${H + 1000}" fill="url(#${p}lamp)"/>
  <g id="${p}gag" opacity="0">
    <rect x="80" y="130" width="920" height="40" rx="18" fill="#C3C8CD" ${S()}/>
    <rect x="60" y="130" width="44" height="1400" rx="18" fill="#AEB4BA" ${S()}/>
    <rect x="976" y="130" width="44" height="1400" rx="18" fill="#AEB4BA" ${S()}/>
    <path d="M 260 1400 C 400 1370 680 1370 820 1400 L 800 1470 C 680 1450 400 1450 280 1470 Z" fill="#D9DDE1" ${S()}/>
    <rect x="80" y="1420" width="200" height="34" rx="14" fill="#AEB4BA" ${S(4)}/><rect x="800" y="1420" width="200" height="34" rx="14" fill="#AEB4BA" ${S(4)}/>
  </g>
  ${[POS.mr, POS.ml].map(([x, y], i) => `<g transform="translate(${x} ${y})"><g id="${p}spark${i}" opacity="0">${painStar(p + "sparkx" + i, { r: 46 })}</g></g>`).join("")}
  <g id="${p}forc-pos">${forceps(p + "forc")}</g>
  <g id="${p}sci-pos">${scissors(p + "sci")}</g>
  <g id="${p}bip-pos">${forceps(p + "bip")}</g>`
      : ""
  }
 </g></g>
 <rect id="${p}flash" x="0" y="0" width="${W}" height="${H}" fill="#fff" opacity="0"/>
</svg>`;

const BODY_INIT = `
    initChar("@zp", 34, 0.15);
    initChar("@ml", 44, 0.45);
    initChar("@mr", 44, 0.45);
    initChar("@eis", 26, 0.05);
    gsap.set("#@cam", { svgOrigin: "540 960" });
    gsap.set("#@frame", { svgOrigin: "0 0" });
    const frameTo = (px, py, k, t, d = 0.3, ease = "power3.inOut") => {
      const x = Math.min(0, Math.max(${W} - k * ${W}, 540 - k * px));
      const y = Math.min(0, Math.max(${H} - k * 2400, 960 - k * py));
      tl.to("#@frame", { x, y, scale: k, duration: d, ease }, t);
    };
    gsap.set("#@pain", { scale: 0, svgOrigin: "0 0" });
    gsap.set("#@ml-t", { svgOrigin: "${POS.ml[0]} ${POS.ml[1]}" });
    gsap.set("#@mr-t", { svgOrigin: "${POS.mr[0]} ${POS.mr[1]}" });
    gsap.set("#@zp-t", { svgOrigin: "540 440" });
    const T2 = ["#@ml-t", "#@mr-t"];
    // Schwellung: Mandeln wachsen, das Zäpfchen wird zusammengedrückt.
    const swell = (k, t, d = 0.5, ease = "elastic.out(1,0.5)") => {
      tl.to(T2, { scale: k, duration: d, ease }, t);
      tl.to("#@zp-t", { scaleX: Math.max(0.72, 1.2 - k * 0.32), duration: d, ease }, t);
    };
    const throb = (a, b, base, step = 0.9) => {
      for (let t = a; t < b - 0.3; t += step) {
        tl.to(T2, { scale: base * 1.04, duration: 0.12, ease: "power2.out" }, t);
        tl.to(T2, { scale: base, duration: 0.5, ease: "elastic.out(1,0.45)" }, t + 0.12);
      }
    };
    const red = (t, on = true, d = 0.6) => tl.to(["#@ml-body", "#@mr-body"], { fill: on ? "${TZ.tonsilRed}" : "${TZ.tonsil}", duration: d }, t);
    const bacteria = (a, b) => {
      for (let i = 0; i < 6; i++) {
        const el = "#@bac" + i;
        tl.to(el, { opacity: 1, duration: 0.3 }, a + i * 0.15);
        for (let t = a + i * 0.15, j = 0; t < b - 0.4; t += 0.8, j++)
          tl.to(el, { x: j % 2 ? -10 : 10, y: j % 2 ? 8 : -8, duration: 0.8, ease: "sine.inOut" }, t);
        tl.to(el, { opacity: 0, duration: 0.3 }, b - 0.3);
      }
    };
    const steam = (a, b) => {
      for (let t = a, i = 0; t < b - 0.6; t += 0.35, i++) {
        const el = "#@steam" + (i % 3);
        tl.fromTo(el, { y: 0, opacity: 0 }, { y: -50, opacity: 0.9, duration: 0.4, ease: "sine.out", immediateRender: false }, t);
        tl.to(el, { y: -120, opacity: 0, duration: 0.5, ease: "sine.in" }, t + 0.4);
      }
    };
`;

/* ---------- Acting für drei Figuren ---------- */
// Stimmung pro Zeile (das Modell kennt keine Tags): laut, wütend, froh, kalt, frech, Panik.
const MOOD = {
  s1: "loud",
  s2: "smug",
  s3: "smug",
  s4: "angry",
  s5: "smug",
  i0: "happy",
  i1: "happy",
  i2: "cold",
  i3: "panic",
  i4: "smug",
  n1: "angry",
  n2: "smug",
  n3: "loud",
  t1: "panic",
};
const CHARS = ["zp", "ml", "mr", "eis"];
const FACE = {
  zp: [540, 900, 1.1],
  ml: [330, 1060, 1.25],
  mr: [750, 1060, 1.25],
  eis: [540, 960, 1.15],
};
function lookVec(from, to) {
  const dx = POS[to][0] - POS[from][0],
    dy = POS[to][1] - POS[from][1];
  const n = Math.hypot(dx, dy) || 1;
  return [Math.round((dx / n) * 16), Math.round((dy / n) * 16)];
}
function actLines(scene, { frames = true, from = 0 } = {}) {
  return lines
    .filter((l) => LINE_SCENE[l.id] === scene && VO[l.id] && CHARS.includes(l.speaker))
    .map((l) => {
      const me = l.speaker,
        mood = MOOD[l.id] || (me === "zp" ? "flat" : "smug");
      let js = CHARS.filter((c) => c !== me && c !== "eis")
        .map((c) => `look("@${c}", ${lookVec(c, me).join(", ")}, ${+(l.start - 0.1).toFixed(2)});`)
        .join(" ");
      if (frames && l.start >= from) {
        const [fx, fy, fk] = FACE[me];
        js += `frameTo(${fx}, ${fy}, ${fk}, ${+(l.start - 0.12).toFixed(2)}, ${mood === "loud" || mood === "panic" ? 0.22 : 0.4});`;
      }
      const t = l.start,
        e = l.end;
      if (mood === "loud" || mood === "angry" || mood === "panic")
        js += `squeeze("@${me}", true, ${t}); squeeze("@${me}", false, ${+(t + 0.55).toFixed(2)});`;
      if (mood === "smug") js += `lids("@${me}", 0.5, ${t});`;
      if (mood === "happy") js += `lids("@${me}", 0.3, ${t}); look("@${me}", 0, -6, ${t});`;
      if (mood === "cold") js += `shake("#@${me}-t", ${t}, ${+(e - t).toFixed(2)}, 5, "x");`;
      const rest =
        mood === "happy" ? "smile" : mood === "smug" ? "smirk" : me === "zp" ? "frown" : "wavy";
      return js + `talk("@${me}", ${t}, ${e}, "${rest}");`;
    })
    .join("\n    ");
}
const blinks = (scene, a, b) => {
  let js = "";
  for (let t = a + 1.3, i = 0; t < b - 0.3; t += 1.7, i++)
    js += `blink("@${["zp", "ml", "mr"][i % 3]}", ${+t.toFixed(2)});`;
  return js;
};

/* ---------- Szene 1: Streit im Rachen, das Eis hilft nur kurz ---------- */
const streitJs = `${HELPERS}${BODY_INIT}
    const S0 = ${SC.streit[0]}, S1 = ${SC.streit[1]};
    gsap.set("#@cam", { scale: 1.08 });
    tl.to("#@cam", { scale: 1, duration: 0.5, ease: "power3.out" }, S0);
    tl.set(T2, { scale: 1.1 }, S0); tl.set("#@zp-t", { scaleX: 0.85 }, S0);
    face("@zp", "frown", S0); face("@ml", "smirk", S0); face("@mr", "smirk", S0);
    look("@zp", 0, 14, S0, 0.01); look("@ml", 12, -10, S0, 0.01); look("@mr", -12, -10, S0, 0.01);
    tl.fromTo("#vorher", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.25, ease: "back.out(2)", immediateRender: true }, S0);
    tl.to("#vorher", { opacity: 0, duration: 0.2 }, S0 + 1.7);
    bacteria(S0 + 0.3, ${L.i0[0]});
    ${JSON.stringify(emphTimes("streit").filter((t) => t > SC.streit[0] + 0.7))}.forEach((t) => { punch("#@cam", t); shake("#@cam", t, 0.25, 7); });
    // Mit jedem frechen Satz werden die Mandeln dicker.
    swell(1.2, ${L.s2[0]}); swell(1.3, ${L.s3[0]}); red(${L.s4[1]}, true, 0.8);
    throb(${L.s4[1]}, ${L.i0[0]} - 0.7, 1.3, 0.8);
    ${actLines("streit", { from: SC.streit[0] + 0.3 })}
    // Bakterien winken bei "unsere Gäste".
    for (let k = 0; k < 6; k++) tl.to("#@bac" + k, { y: -24, duration: 0.15, yoyo: true, repeat: 3, ease: "sine.inOut" }, ${L.s5[0]} + 1.0 + k * 0.05);
    // Das Eis am Stiel rauscht als Retter rein und kühlt: die Mandeln frieren und schrumpfen.
    const I0 = ${L.i0[0]} - 0.6;
    tl.set("#@ice", { opacity: 1 }, I0);
    tl.fromTo("#@ice", { y: -1200, rotation: -25, svgOrigin: "540 1130" }, { y: 0, rotation: 0, duration: 0.6, ease: "back.out(1.4)", immediateRender: false }, I0);
    look("@eis", 0, 0, I0, 0.01); lids("@eis", 0.05, I0, 0.01);
    const F0 = ${L.i0[1]};
    tl.to(["#@ml-frost", "#@mr-frost"], { opacity: 0.45, duration: 0.6 }, F0);
    swell(1.0, F0, 0.9, "power2.out");
    red(F0, false, 0.9);
    // ... aber es schmilzt: wird kürzer, tropft, schwitzt. Am Ende fällt nur der Stiel.
    const MT = ${L.i3[0]};
    gsap.set("#@ice-body", { svgOrigin: "540 1130" });
    tl.to("#@ice-body", { scaleY: 0.25, duration: ${+(L.i3[1] - L.i3[0]).toFixed(2)}, ease: "power1.in" }, MT + 0.2);
    [0, 1, 2].forEach((k) => {
      tl.set("#@drip" + k, { opacity: 1 }, MT + 0.3 + k * 0.4);
      tl.fromTo("#@drip" + k, { y: 0 }, { y: 140, duration: 0.5, ease: "power2.in", immediateRender: false }, MT + 0.3 + k * 0.4);
      tl.set("#@drip" + k, { opacity: 0 }, MT + 0.8 + k * 0.4);
    });
    steam(MT + 0.2, ${L.i3[1]});
    tl.to(["#@ml-frost", "#@mr-frost"], { opacity: 0, duration: 0.5 }, MT + 0.4);
    const ST = ${L.i4[0]} - 0.15;
    tl.to("#@ice-body", { opacity: 0, duration: 0.15 }, ST);
    gsap.set("#@ice-stick", { svgOrigin: "540 1185" });
    tl.to("#@ice-stick", { y: 300, rotation: 80, duration: 0.45, ease: "bounce.out" }, ST);
    tl.to("#@ice-stick", { opacity: 0, duration: 0.3 }, ST + 1.2);
    swell(1.42, ${L.i4[0]} + 0.3, 0.7);
    red(${L.i4[0]} + 0.3, true, 0.5);
    tl.set("#@pain", { scale: 1 }, ${L.i4[0]} + 0.4);
    squeeze("@zp", true, ${L.i4[0]} + 0.4); face("@zp", "wavy", ${L.i4[0]} + 0.4); squeeze("@zp", false, ${L.i4[1]});
    throb(${L.i4[1]} + 0.2, S1, 1.42, 0.7);
    ${blinks("streit", SC.streit[0], SC.streit[1])}
`;

/* ---------- Szene 2b: Wochen später, wieder entzündet ---------- */
const nachherJs = `${HELPERS}${BODY_INIT}
    const N0 = ${SC.nachher[0]}, N1 = ${SC.nachher[1]};
    tl.set("#@zp-t", { scaleX: 0.75 }, N0);
    tl.set(["#@ml-body", "#@mr-body"], { fill: "${TZ.tonsilRed}" }, N0);
    tl.set(T2, { scale: 1.42 }, N0); swell(1.5, N0 + 0.2, 0.6);
    tl.fromTo(["#@ml-pus", "#@mr-pus"], { opacity: 0 }, { opacity: 1, duration: 0.6, immediateRender: false }, N0 + 0.3);
    tl.set("#@pain", { scale: 1 }, N0);
    face("@zp", "wavy", N0); face("@ml", "smirk", N0); face("@mr", "smirk", N0);
    lids("@ml", 0.5, N0, 0.01); lids("@mr", 0.5, N0, 0.01);
    throb(N0 + 0.9, N1, 1.5, 0.7);
    ${JSON.stringify(emphTimes("nachher"))}.forEach((t) => { punch("#@cam", t); shake("#@cam", t, 0.25, 7); });
    ${actLines("nachher")}
    look("@zp", 0, 0, ${L.n3[0]}); lids("@zp", 0, ${L.n3[0]});
    ${blinks("nachher", SC.nachher[0], SC.nachher[1])}
`;

/* ---------- Cold Open: die zweite Mandel wird geholt, dann zurückspulen ---------- */
const teaserBody = `<div id="rw"><div id="rw-lines"></div><div id="rw-icon">◀◀</div></div>`;
const teaserCss = `
  #rw { position: absolute; inset: 0; opacity: 0; }
  #rw-lines { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(255,255,255,0.18) 0 6px, transparent 6px 46px); }
  #rw-icon { position: absolute; left: 0; right: 0; top: 820px; text-align: center; font-family: "Montserrat", sans-serif;
    font-weight: 900; font-size: 200px; color: #fff; -webkit-text-stroke: 14px #1d1414; paint-order: stroke fill; }`;
const OP_TOOLS = `
    const OFF = { forc: [-300, -500, -30], sci: [1380, -500, 30], bip: [1380, -600, 25] };
    Object.entries(OFF).forEach(([k, [x, y, r]]) => gsap.set("#@" + k + "-pos", { x, y, rotation: r, svgOrigin: "0 0" }));
    ["#@forc-armL", "#@bip-armL"].forEach((a) => gsap.set(a, { rotation: -10, svgOrigin: "0 -232" }));
    ["#@forc-armR", "#@bip-armR"].forEach((a) => gsap.set(a, { rotation: 10, svgOrigin: "0 -232" }));
    gsap.set(["#@sci-bladeL", "#@sci-bladeR"], { svgOrigin: "0 -120" });
    const go = (k, x, y, t, d = 0.6, rot) => tl.to("#@" + k + "-pos", Object.assign({ x, y, duration: d, ease: "power2.inOut" }, rot === undefined ? {} : { rotation: rot }), t);
    const away = (k, t, d = 0.45) => { const [x, y, r] = OFF[k]; tl.to("#@" + k + "-pos", { x, y, rotation: r, duration: d, ease: "power2.in" }, t); };
    const grip = (k, closed, t) => tl.to(["#@" + k + "-armL", "#@" + k + "-armR"], { rotation: (i) => (closed ? 0 : i ? 10 : -10), duration: 0.12 }, t);
    const snip = (t) => { tl.to("#@sci-bladeL", { rotation: -14, duration: 0.1 }, t - 0.12); tl.to("#@sci-bladeR", { rotation: 14, duration: 0.1 }, t - 0.12); tl.to(["#@sci-bladeL", "#@sci-bladeR"], { rotation: 0, duration: 0.07 }, t); };
    const opState = (t) => {
      tl.set(T2, { scale: 1.5 }, t); tl.set("#@zp-t", { scaleX: 0.72 }, t);
      tl.set(["#@ml-body", "#@mr-body"], { fill: "${TZ.tonsilRed}" }, t);
      tl.set(["#@ml-pus", "#@mr-pus"], { opacity: 1 }, t);
    };
`;
const teaserJs = `${HELPERS}${BODY_INIT}${OP_TOOLS}
    const T0 = ${SC.teaser[0]}, T1 = ${SC.teaser[1]};
    opState(T0);
    tl.set("#@gag", { opacity: 1 }, T0); tl.set("#@mr-t", { opacity: 0 }, T0);
    tl.set("#@cutL", { opacity: 1 }, T0);
    tl.set("#@forc-pos", { x: 300, y: 930, rotation: -20 }, T0); grip("forc", true, T0);
    face("@zp", "open", T0); lids("@zp", 0, T0, 0.01); look("@zp", -16, 10, T0, 0.01);
    frameTo(380, 1050, 1.12, T0, 0.01);
    gsap.set("#@cam", { scale: 1.1 });
    tl.to("#@cam", { scale: 1, duration: 0.5, ease: "power3.out" }, T0);
    shake("#@cam", T0 + 0.02, 0.5, 14);
    squeeze("@ml", true, ${L.t1[0]}); talk("@ml", ${L.t1}, "wavy");
    tl.to(["#@forc-pos", "#@ml-t"], { y: "-=120", duration: 1.6, ease: "power1.in" }, T0 + 0.3);
    const RW = T1 - 0.55;
    tl.to("#rw", { opacity: 1, duration: 0.08 }, RW);
    tl.fromTo("#rw-lines", { backgroundPositionY: "0px" }, { backgroundPositionY: "-600px", duration: 0.55, ease: "none", immediateRender: false }, RW);
    tl.to(["#@forc-pos", "#@ml-t"], { y: "+=120", duration: 0.5, ease: "power2.inOut" }, RW);
    tl.to("#@frame", { scale: 1.3, duration: 0.5, ease: "power2.in" }, RW);
    tl.fromTo("#@flash", { opacity: 0 }, { opacity: 0.7, duration: 0.5, ease: "power2.in", immediateRender: false }, RW);
`;

/* ---------- Szene 3: Mandel-OP in 4 erklärten Schritten ---------- */
// Alle Beats hängen an den Arzt-Sätzen a1–a4.
const STEPS = ["NARKOSE & SPERRER", "MANDEL LÖSEN", "RAUS DAMIT", "BLUTUNG STILLEN"];
const stepsBody = `<div id="steps">${STEPS.map((t, i) => `<div class="st" id="st${i + 1}"><span class="st-n">SCHRITT ${i + 1}/4</span><div class="st-t">${t}</div></div>`).join("")}</div>`;
const stepsCss = `
  .st { position: absolute; left: 0; right: 0; top: 250px; text-align: center; opacity: 0; }
  .st-n { display: inline-block; padding: 8px 24px; border-radius: 30px; background: #FFE14D; color: #1d1414;
    font-family: "Montserrat", sans-serif; font-weight: 800; font-size: 36px; border: 5px solid #1d1414; }
  .st-t { margin-top: 12px; font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 64px; color: #fff;
    -webkit-text-stroke: 12px #1d1414; paint-order: stroke fill; text-shadow: 0 6px 0 rgba(0,0,0,0.35); }`;
const opJs = `${HELPERS}${BODY_INIT}${OP_TOOLS}
    // Ohne Arzt-Stimme: die Figuren kommentieren, kurze Schritt-Labels erklären.
    const O0 = ${SC.op[0]};
    opState(O0);
    face("@zp", "wavy", O0); face("@ml", "smirk", O0); face("@mr", "smirk", O0);
    lids("@ml", 0.5, O0, 0.01); lids("@mr", 0.5, O0, 0.01);
    let curStep = 0;
    const step = (n, t) => {
      if (curStep) tl.to("#st" + curStep, { opacity: 0, y: -20, duration: 0.15 }, t - 0.15);
      tl.fromTo("#st" + n, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3, ease: "back.out(2)", immediateRender: false }, t);
      curStep = n;
    };
    const o1 = ${JSON.stringify(L.o1)}, o2 = ${JSON.stringify(L.o2)}, o3 = ${JSON.stringify(L.o3)}, o4 = ${JSON.stringify(L.o4)}, o5 = ${JSON.stringify(L.o5)};
    frameTo(540, 900, 1, O0, 0.01);
    tl.fromTo("#@flash", { opacity: 0.8 }, { opacity: 0, duration: 0.35, ease: "power2.out", immediateRender: false }, O0);
    gsap.set("#@flash", { opacity: 0.8 });

    // Schritt 1: Sperrer rein, Licht an
    step(1, O0 + 0.1);
    tl.set("#@gag", { opacity: 1 }, O0 + 0.4);
    tl.fromTo("#@gag", { y: -60 }, { y: 0, duration: 0.35, ease: "back.out(2)", immediateRender: false }, O0 + 0.4);
    tl.to("#@tongue", { y: 40, duration: 0.35, ease: "power2.out" }, O0 + 0.5);
    frameTo(750, 1060, 1.2, o1[0] - 0.15, 0.4);
    lids("@mr", 0, o1[0], 0.08); look("@mr", -6, -14, o1[0]); talk("@mr", o1[0], o1[1], "frown");
    look("@ml", 16, 0, o1[0]); look("@zp", 12, 12, o1[0]);

    // Schritt 2: rechte Mandel fassen und herauslösen
    step(2, o2[0] - 1.1);
    frameTo(760, 1080, 1.15, o2[0] - 1.0, 0.45);
    grip("forc", false, o2[0] - 1.0);
    go("forc", 760, 920, o2[0] - 1.0, 0.7, 20);
    grip("forc", true, o2[0] - 0.2);
    squeeze("@mr", true, o2[0]); talk("@mr", o2[0], o2[1], "wavy"); squeeze("@mr", false, o2[1]);
    go("sci", 900, 900, o2[0] + 0.1, 0.4, 15);
    tl.set("#@cutR", { opacity: 1, strokeDasharray: 1400, strokeDashoffset: 1400 }, o2[0] + 0.5);
    tl.to("#@cutR", { strokeDashoffset: 0, duration: 1.0, ease: "none" }, o2[0] + 0.5);
    tl.to("#@sci-pos", { keyframes: [{ x: 930, y: 1100 }, { x: 860, y: 1260 }, { x: 680, y: 1240 }], duration: 1.0, ease: "none" }, o2[0] + 0.5);
    snip(o2[0] + 0.6); snip(o2[0] + 1.1); snip(o2[0] + 1.4);
    away("sci", o2[0] + 1.6);

    // Schritt 3: raus damit – dann merkt die linke, dass der Bruder fehlt
    step(3, o3[0] - 0.9);
    tl.to(["#@forc-pos", "#@mr-t"], { y: "-=1400", duration: 0.7, ease: "power3.in" }, o3[0] - 0.9);
    tl.to("#@cutR", { opacity: 0, duration: 0.2 }, o3[0] - 0.6);
    frameTo(330, 1060, 1.2, o3[0] - 0.15, 0.4);
    lids("@ml", 0, o3[0], 0.08); look("@ml", 16, 0, o3[0]); talk("@ml", o3[0], o3[1], "wavy");
    tl.set("#@forc-pos", { x: -300, y: -500, rotation: -30 }, o3[0]); grip("forc", false, o3[0]);
    go("forc", 320, 920, o3[1] - 0.2, 0.6, -20);
    grip("forc", true, o4[0] - 0.3);
    squeeze("@ml", true, o4[0]); talk("@ml", o4[0], o4[1], "wavy");
    go("sci", 180, 1000, o4[0], 0.3, -10);
    tl.set("#@cutL", { opacity: 1, strokeDasharray: 1400, strokeDashoffset: 1400 }, o4[0] + 0.2);
    tl.to("#@cutL", { strokeDashoffset: 0, duration: 0.7, ease: "none" }, o4[0] + 0.2);
    snip(o4[0] + 0.3); snip(o4[0] + 0.7);
    away("sci", o4[1] + 0.1);
    tl.to(["#@forc-pos", "#@ml-t"], { y: "-=1400", duration: 0.7, ease: "power3.in" }, o4[1] + 0.2);
    tl.to("#@cutL", { opacity: 0, duration: 0.2 }, o4[1] + 0.4);
    away("forc", o4[1] + 1.0);

    // Schritt 4: Blutung stillen – das Zäpfchen atmet auf
    step(4, o5[0] - 1.8);
    frameTo(540, 1080, 1, o5[0] - 1.8, 0.4);
    go("bip", 780, 1080, o5[0] - 1.7, 0.35, 20);
    tl.set("#@spark0", { opacity: 1 }, o5[0] - 1.4); tl.fromTo("#@spark0", { scale: 0.3, svgOrigin: "0 0" }, { scale: 1.1, duration: 0.15, immediateRender: false }, o5[0] - 1.4); tl.to("#@spark0", { opacity: 0, duration: 0.15 }, o5[0] - 1.2);
    tl.to("#@bedR", { fill: "#B5535B", duration: 0.3 }, o5[0] - 1.4);
    go("bip", 300, 1080, o5[0] - 1.15, 0.3, -15);
    tl.set("#@spark1", { opacity: 1 }, o5[0] - 0.8); tl.fromTo("#@spark1", { scale: 0.3, svgOrigin: "0 0" }, { scale: 1.1, duration: 0.15, immediateRender: false }, o5[0] - 0.8); tl.to("#@spark1", { opacity: 0, duration: 0.15 }, o5[0] - 0.6);
    tl.to("#@bedL", { fill: "#B5535B", duration: 0.3 }, o5[0] - 0.8);
    away("bip", o5[0] - 0.4);
    tl.to("#@zp-t", { scaleX: 1, duration: 0.6, ease: "elastic.out(1,0.5)" }, o5[0] - 0.3);
    frameTo(540, 900, 1.1, o5[0] - 0.15, 0.4);
    lids("@zp", 0.45, o5[0], 0.3); look("@zp", 0, 0, o5[0]); talk("@zp", o5[0], o5[1], "smile");
    tl.to("#st4", { opacity: 0, duration: 0.2 }, o5[1]);
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
  <path d="M 500 900 C 560 960 600 920 580 860" fill="none" stroke="${C.ink}" stroke-width="72" stroke-linecap="round"/><path d="M 500 900 C 560 960 600 920 580 860" fill="none" stroke="${PT.sweater}" stroke-width="62" stroke-linecap="round"/>
  <g id="pt-belly">
    <rect x="574" y="836" width="16" height="70" rx="7" fill="#E2B474" ${S(3)}/>
    <path d="M 548 850 L 548 760 C 548 728 616 728 616 760 L 616 850 Z" fill="#8FD8F0" ${S(4)}/>
    <path d="M 548 822 L 616 822 L 616 850 L 548 850 Z" fill="#F7A8C4" ${S(3)}/>
    <g transform="translate(582 786)">${toothFace("pice", { r: 10, gap: 13, mouthY: 20, mouthS: 0.32, mouthInit: "smile", lidFill: "#8FD8F0" })}</g>
  </g>

  <circle cx="580" cy="856" r="28" fill="${P.skin}" ${S()}/>
  <g id="pt-puffs">
    <path d="M 270 1020 q -26 40 0 80 M 246 1036 q -18 26 0 52" fill="none" ${S(5)}/>
    <path d="M 590 1030 q 26 40 0 80 M 614 1046 q 18 26 0 52" fill="none" ${S(5)}/>
  </g>
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
  </g>
</svg>`;
const ctaBody = `
<div id="cta">
  <div class="ct" id="ct1">HABT IHR EURE</div>
  <div class="ct ct-y" id="ct2">MANDELN NOCH?</div>
  <div id="ct3">Schreib's in die Kommentare ↓</div>
</div>`;
const ctaCss = `
  #cta { position: absolute; left: 0; right: 0; top: 140px; text-align: center; opacity: 0; }
  .ct { font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 84px; line-height: 1.05; color: #fff;
    -webkit-text-stroke: 16px #1d1414; paint-order: stroke fill; text-shadow: 0 8px 0 rgba(0,0,0,0.35); }
  .ct-y { color: #FFE14D; font-size: 104px; }
  #ct3 { display: inline-block; margin-top: 18px; padding: 14px 30px; border-radius: 40px; background: #1d1414;
    color: #fff; font-family: "Montserrat", sans-serif; font-weight: 800; font-size: 42px; }`;
// Gemeinsames Acting für beide Patienten-Auftritte.
const patientBase = (a, b) => `
    const LIDS = ["#pe1-lid", "#pe2-lid"], PUP = ["#pe1-p", "#pe2-p"];
    gsap.set(LIDS, { scaleY: 0.15, svgOrigin: "0 -26" });
    gsap.set("#pt-cam", { transformOrigin: "60% 50%", scale: 1.2 });
    gsap.set("#pt-head", { svgOrigin: "${HX} ${HY + 100}" });
    gsap.set("#pt-belly", { svgOrigin: "582 900" });
    gsap.set("#pt-browL", { rotation: -12, svgOrigin: "${HX - 12} ${HY - 48}" });
    gsap.set("#pt-browR", { rotation: 12, svgOrigin: "${HX + 12} ${HY - 48}" });
    tl.to("#pt-cam", { scale: 1, duration: 0.5, ease: "back.out(1.6)" }, ${a});
    tl.fromTo("#pt-belly", { scale: 1.2 }, { scale: 1, duration: 0.7, ease: "elastic.out(1.2,0.35)" }, ${a} + 0.05);
    for (let t = ${a} + 0.9; t < ${b} - 0.2; t += 0.95) {
      tl.to("#pt-belly", { scale: 1.03, duration: 0.1, ease: "power2.out" }, t);
      tl.to("#pt-belly", { scale: 1, duration: 0.45, ease: "elastic.out(1,0.4)" }, t + 0.1);
      tl.fromTo("#pt-puffs", { opacity: 1 }, { opacity: 0.25, duration: 0.5, ease: "power1.out" }, t);
    }
    tl.to(LIDS, { scaleY: 1, duration: 0.06 }, ${a} + 1.5); tl.to(LIDS, { scaleY: 0.15, duration: 0.09 }, ${a} + 1.57);
`;
const patientJs = `
    const P0 = ${SC.patient[0]}, P1 = ${SC.patient[1]};
    ${patientBase("P0", "P1")}
    talk("pm", ${L.e1}, "frown", 0.13);
    tl.to("#pt-head", { rotation: -3, duration: 0.3, ease: "sine.inOut" }, ${L.e1[0]});
    tl.to(PUP, { x: -8, y: 0, duration: 0.2, ease: "power3.out" }, ${L.e2[0]} - 0.1);
    tl.to("#pt-head", { rotation: 0, duration: 0.3, ease: "sine.inOut" }, ${L.e2[0]});
    // "Juhu!" – Eis hoch. Dann beschwert sich das Eis: "Schon wieder ich?!"
    tl.to(LIDS, { scaleY: 0.3, duration: 0.15 }, ${L.e3[0]});
    tl.to("#pt-belly", { y: -30, rotation: -8, duration: 0.3, ease: "back.out(2)" }, ${L.e3[0]});
    talk("pm", ${L.e3}, "smile", 0.12);
    gsap.set(["#pice-eyeL-lid", "#pice-eyeR-lid"], { scaleY: 0.05, svgOrigin: "0 -18" });
    tl.to(PUP, { x: 10, y: 4, duration: 0.2 }, ${L.e4[0]} - 0.1);
    tl.to(LIDS, { scaleY: 0.05, duration: 0.15 }, ${L.e4[0]});
    shake("#pt-belly", ${L.e4[0]}, 0.4, 4, "x");
    talk("pice", ${L.e4}, "frown");
    tl.fromTo("#cta", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.2)" }, ${L.e4[0]});
    tl.to("#ct2", { scale: 1.08, duration: 0.12, ease: "power2.out" }, ${L.e4[0]} + 0.7);
    tl.to("#ct2", { scale: 1, duration: 0.25, ease: "power2.inOut" }, ${L.e4[0]} + 0.82);
    tl.to("#ct3", { y: 8, duration: 0.4, ease: "sine.inOut", repeat: 4, yoyo: true }, ${L.e4[0]} + 0.8);
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

const CAP_EMPH_CSS = `
  .cap.emph { color: #FFE14D; font-size: 104px; -webkit-text-stroke: 16px #1d1414; }`;

const VORHER_CSS = `#vorher { position: absolute; left: 0; right: 0; top: 160px; margin: 0 auto; width: max-content; padding: 12px 30px;
  border-radius: 34px; background: #FFE14D; color: #1d1414; border: 6px solid #1d1414; font-family: "Montserrat", sans-serif;
  font-weight: 900; font-size: 52px; opacity: 0; }`;

/* ================= Hook-Titel (erste Sekunden) ================= */
const hookBody = `
    <div id="hook">
${script.hook.map(([t, size, col], i) => `      <div class="hk" id="hk${i + 1}" style="font-size:${size}px;color:${col}">${t}</div>`).join("\n")}
    </div>`;
const hookCss = `
  #hook { position: absolute; left: 0; right: 0; top: 130px; text-align: center; transform: rotate(-3deg); }
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
      `      <audio id="${s.id}" class="clip" src="assets/sfx/${s.src}" data-start="${sfxStart(s)}" data-track-index="${10 + i}" data-volume="${s.volume}"></audio>`,
  )
  .join("\n");
function sfxStart(s) {
  if (s.anchor) return +(R(ORIG[s.anchor][0], s.anchor) + s.offset).toFixed(3);
  if (s.line) return +(RL(lines.find((l) => l.id === s.line)) + s.offset).toFixed(3);
  return R(s.start);
}
const bed = existsSync(new URL("./assets/sfx/bed-long.mp3", import.meta.url))
  ? `      <audio id="bed" class="clip" src="assets/sfx/bed-long.mp3" data-start="0" data-duration="${DUR}" data-track-index="9" data-volume="0.17"></audio>`
  : "";
const vo = lines
  .filter((l) => VO[l.id])
  .map(
    (l, i) =>
      `      <audio id="vo-${l.id}" class="clip" src="assets/vo/${l.reuse || l.id}.mp3" data-start="${RL(l)}" data-duration="${VO[l.id].fileDuration}" data-track-index="${40 + i}" data-volume="1"></audio>`,
  )
  .join("\n");
const host = (id, track, kind = "graphics", z = 1) => {
  const [a, b] = SC[id] || (id === "hook" ? [0, HOOK_END] : [0, DUR]);
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
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${TZ.bg}; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}">
${host("teaser", 13)}
${host("streit", 1)}

${host("op", 3)}
${host("praxis", 4)}
${host("captions", 5, "captions", 5)}
${host("nachher", 11)}
${host("patient", 7)}
${host("hook", 8, "graphics", 6)}
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
out(
  "./compositions/streit.html",
  page(
    "streit",
    SC.streit,
    throat("s-") + '<div id="vorher">3 WOCHEN VORHER</div>',
    VORHER_CSS,
    pre("s-", streitJs),
  ),
);
out(
  "./compositions/op.html",
  page("op", SC.op, throat("o-", "op") + stepsBody, stepsCss, pre("o-", opJs)),
);
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
out(
  "./compositions/nachher.html",
  page("nachher", SC.nachher, throat("n-"), "", pre("n-", nachherJs)),
);
out(
  "./compositions/teaser.html",
  page("teaser", SC.teaser, throat("t-", "op") + teaserBody, teaserCss, pre("t-", teaserJs)),
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
