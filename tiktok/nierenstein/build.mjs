// Nierenstein (Bauch-Ansicht). Generates index.html + compositions/*.html from script.json.
// Run: node build.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import {
  C,
  S,
  toothFace,
  mouth,
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
  teaser: 0,
  streit: 0.25,
  nachher: 0.08,
  op: 0.3,
  frage: 0.2,
  praxis: 0.3,
  patient: 0.3,
};
const PAD = {
  teaser: 0.5,
  streit: 0.35,
  nachher: 0.4,
  op: 0.4,
  frage: 0.4,
  praxis: 0.4,
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
const HOOK_END = 3.3;
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

/* ================= Bauch-Ansicht (geteilt von streit und op) ================= */
// Anatomisch angelehnt: Rumpf-Silhouette mit Ausschnitt in den Bauchraum,
// Wirbelsäule und untere Rippen, beide Nieren neben der Wirbelsäule, Harnleiter
// bis zur Blase. Gesichter haben nur die linke Niere, der Stein und das Bier.
const TN = {
  bg: "#CFE3EA",
  skin: "#F2C6A5",
  skinShade: "#E2AE8B",
  cavity: "#8B2C3C",
  cavityDark: "#6E1F2E",
  bone: "#E9E7D8",
  boneShade: "#CFCBB6",
  kidney: "#B5474B",
  kidneyHi: "#CF6A6B",
  pelvis: "#E9A2A9",
  tube: "#E9A2A9",
  bladder: "#E9A2A9",
  urine: "#F4D35E",
  water: "#7FD0F5",
  stone: "#D7A84A",
  stoneDark: "#A87C2C",
  beer: "#F2B33D",
  beerDark: "#D98E1E",
  foam: "#FFFDF4",
  metal: "#5B6670",
  metalHi: "#8FA3B0",
  lock: "#39E07A",
};
const KID = { x: 350, y: 800 }; // Niere mit Gesicht
const ST = { x: 464, y: 985 }; // Stein im Harnleiter
const BIER = { x: 610, y: 520 };
const POS = { niere: [330, 790], stein: [ST.x, ST.y], bier: [BIER.x, BIER.y] };
const KIDNEY_L =
  "M 350 650 C 440 650 470 720 462 770 C 456 790 430 800 430 820 C 430 840 456 850 462 870 C 470 920 440 950 350 950 C 270 950 245 880 245 800 C 245 720 270 650 350 650 Z";
const KIDNEY_R =
  "M 730 625 C 640 625 610 695 618 745 C 624 765 650 775 650 795 C 650 815 624 825 618 845 C 610 895 640 925 730 925 C 810 925 835 855 835 775 C 835 695 810 625 730 625 Z";
const U1 = `M 462 880 C 468 915 468 945 ${ST.x} ${ST.y}`;
const U2 = `M ${ST.x} ${ST.y} C 458 1060 470 1200 505 1335`;
const UR = "M 618 860 C 612 960 610 1100 575 1335";
const STONE = (() => {
  const pts = [];
  const n = 11;
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 36 + ((i * 7) % 5) : 54 + ((i * 13) % 9);
    pts.push(
      `${(ST.x + Math.cos(a) * r).toFixed(1)} ${(ST.y + Math.sin(a) * r * 0.92).toFixed(1)}`,
    );
  }
  return `M ${pts.join(" L ")} Z`;
})();
const browPair = (id, gap, r, y) =>
  `<path id="${id}-browL" d="M ${-gap - r * 0.75} ${y} L ${-gap + r * 0.75} ${y}" fill="none" ${S(5)}/>` +
  `<path id="${id}-browR" d="M ${gap - r * 0.75} ${y} L ${gap + r * 0.75} ${y}" fill="none" ${S(5)}/>`;
const tube = (id, d, w = 24) =>
  `<path id="${id}-o" d="${d}" fill="none" stroke="${C.ink}" stroke-width="${w + 10}" stroke-linecap="round"/>` +
  `<path id="${id}-i" d="${d}" fill="none" stroke="${TN.tube}" stroke-width="${w}" stroke-linecap="round"/>`;
const liquid = (id, d, col, w = 12) =>
  `<path id="${id}" d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>`;
// Bierkrug mit Gesicht (Ursprung = Krugmitte), angeheitert mit roten Bäckchen.
const beerMug = (id) => `
  <g id="${id}">
    <path d="M 58 -42 C 112 -42 112 52 54 52" fill="none" stroke="${C.ink}" stroke-width="30" stroke-linecap="round"/>
    <path d="M 58 -42 C 112 -42 112 52 54 52" fill="none" stroke="${TN.beer}" stroke-width="18" stroke-linecap="round"/>
    <path d="M -60 -70 L 60 -70 L 52 76 C 50 86 40 92 30 92 L -30 92 C -40 92 -50 86 -52 76 Z" fill="${TN.beer}" ${S()}/>
    <path d="M -40 -50 L -34 70 M 40 -50 L 34 70" stroke="${TN.beerDark}" stroke-width="8" stroke-linecap="round" opacity="0.6"/>
    ${[
      [-24, 60, 5],
      [18, 46, 4],
      [-8, 30, 3],
      [28, 72, 3],
    ]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="0.6"/>`)
      .join("")}
    <path id="${id}-foam" d="M -70 -60 C -82 -92 -50 -112 -30 -96 C -20 -122 20 -122 30 -99 C 52 -114 84 -92 70 -62 C 60 -48 -60 -48 -70 -60 Z" fill="${TN.foam}" ${S()}/>
    <ellipse cx="-38" cy="24" rx="13" ry="8" fill="#E8674F" opacity="0.55"/>
    <ellipse cx="38" cy="24" rx="13" ry="8" fill="#E8674F" opacity="0.55"/>
    <g transform="translate(0 0)">${toothFace(id, { r: 20, gap: 26, mouthY: 34, mouthS: 0.42, mouthInit: "smile", lidFill: TN.beer })}${browPair(id, 26, 20, -30)}</g>
  </g>`;
const body = (p, env = "inside") => `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
 <g id="${p}frame"><g id="${p}cam">
  <rect x="-400" y="-400" width="${W + 800}" height="${H + 1000}" fill="${TN.bg}"/>
  <path d="M 140 120 C 140 420 170 700 200 900 C 220 1100 180 1300 170 1500 C 160 1650 260 1780 540 1780 C 820 1780 920 1650 910 1500 C 900 1300 860 1100 880 900 C 910 700 940 420 940 120 Z" fill="${TN.skin}" ${S()}/>
  <path d="M 400 300 C 460 330 620 330 680 300" fill="none" stroke="${TN.skinShade}" stroke-width="12" stroke-linecap="round"/>
  <clipPath id="${p}cav-c"><path d="M 205 470 C 205 700 245 900 255 1000 C 265 1200 235 1350 245 1480 C 265 1610 385 1665 540 1665 C 695 1665 815 1610 835 1480 C 845 1350 815 1200 825 1000 C 835 900 875 700 875 470 C 700 430 380 430 205 470 Z"/></clipPath>
  <g clip-path="url(#${p}cav-c)">
    <rect x="0" y="400" width="${W}" height="1400" fill="${TN.cavity}"/>
    <ellipse cx="540" cy="1000" rx="300" ry="520" fill="${TN.cavityDark}" opacity="0.35"/>
    ${[600, 680]
      .map(
        (y, i) =>
          `<path d="M 520 ${y} C 400 ${y + 10} 280 ${y + 50} 200 ${y + 130 + i * 20}" fill="none" stroke="${C.ink}" stroke-width="34" stroke-linecap="round"/><path d="M 520 ${y} C 400 ${y + 10} 280 ${y + 50} 200 ${y + 130 + i * 20}" fill="none" stroke="${TN.bone}" stroke-width="24" stroke-linecap="round"/>` +
          `<path d="M 560 ${y} C 680 ${y + 10} 800 ${y + 50} 880 ${y + 130 + i * 20}" fill="none" stroke="${C.ink}" stroke-width="34" stroke-linecap="round"/><path d="M 560 ${y} C 680 ${y + 10} 800 ${y + 50} 880 ${y + 130 + i * 20}" fill="none" stroke="${TN.bone}" stroke-width="24" stroke-linecap="round"/>`,
      )
      .join("")}
    ${Array.from({ length: 11 }, (_, i) => `<rect x="508" y="${520 + i * 76}" width="64" height="62" rx="14" fill="${TN.bone}" ${S(4)}/><rect x="508" y="${520 + i * 76 + 44}" width="64" height="10" fill="${TN.boneShade}" opacity="0.8"/>`).join("")}
    <path d="M 250 1480 C 250 1330 330 1250 420 1260 C 440 1330 430 1420 380 1500 Z" fill="${TN.bone}" ${S()}/>
    <path d="M 830 1480 C 830 1330 750 1250 660 1260 C 640 1330 650 1420 700 1500 Z" fill="${TN.bone}" ${S()}/>
    ${tube(p + "ur", UR)}
    <path d="${KIDNEY_R}" fill="${TN.kidney}" ${S()}/>
    <path d="M 770 680 C 800 700 812 740 812 780" fill="none" stroke="${TN.kidneyHi}" stroke-width="14" stroke-linecap="round" opacity="0.8"/>
    <path d="M 655 770 C 625 775 606 800 604 830 C 602 850 608 865 616 875 L 632 875 C 636 860 644 840 655 830 Z" fill="${TN.pelvis}" ${S(4)}/>
    <g id="${p}bladder"><ellipse cx="540" cy="1400" rx="132" ry="92" fill="${TN.bladder}" ${S()}/>
      <path d="M 460 1360 C 490 1336 560 1332 600 1350" fill="none" stroke="#F6C9CE" stroke-width="12" stroke-linecap="round"/></g>
    ${tube(p + "u2", U2)}
    ${liquid(p + "liq2", U2, TN.water)}
    <g id="${p}u1">${tube(p + "u1", U1)}</g>
    ${liquid(p + "liq1", U1, TN.urine)}
    <g id="${p}niere-t">
      <path d="${KIDNEY_L}" fill="${TN.kidney}" ${S()}/>
      <path d="M 300 690 C 270 710 262 750 262 790" fill="none" stroke="${TN.kidneyHi}" stroke-width="14" stroke-linecap="round" opacity="0.8"/>
      <path id="${p}pelvisL" d="M 425 790 C 460 795 478 820 480 850 C 482 870 476 885 468 895 L 452 895 C 448 880 440 860 425 850 Z" fill="${TN.pelvis}" ${S(4)}/>
      <g transform="translate(330 790)">${toothFace(p + "niere", { r: 30, gap: 38, mouthY: 62, mouthS: 0.62, mouthInit: "frown", lidFill: TN.kidney })}${browPair(p + "niere", 38, 30, -44)}</g>
      <g id="${p}sweat" opacity="0"><path d="M 400 730 C 412 748 414 760 404 768 C 394 774 384 766 388 752 C 390 744 396 736 400 730 Z" fill="#BFE6F5" ${S(3)}/></g>
      <g id="${p}pain" opacity="0" transform="translate(268 690)">${painStar(p + "painS", { r: 44 })}</g>
    </g>
    <ellipse id="${p}bulge" cx="${ST.x}" cy="${ST.y}" rx="62" ry="66" fill="${TN.tube}" ${S()}/>
    <g id="${p}stein-t">
      <path d="${STONE}" fill="${TN.stone}" ${S()}/>
      ${[
        [ST.x - 26, ST.y + 26, 5],
        [ST.x + 28, ST.y + 20, 4],
        [ST.x + 22, ST.y - 30, 4],
        [ST.x - 30, ST.y - 18, 3],
      ]
        .map(
          ([x, y, r]) =>
            `<circle cx="${x}" cy="${y}" r="${r}" fill="${TN.stoneDark}" opacity="0.8"/>`,
        )
        .join("")}
      <path id="${p}crack1" opacity="0" d="M ${ST.x - 6} ${ST.y - 50} L ${ST.x + 4} ${ST.y - 24} L ${ST.x - 8} ${ST.y - 6} L ${ST.x + 6} ${ST.y + 18}" fill="none" ${S(4)}/>
      <path id="${p}crack2" opacity="0" d="M ${ST.x + 50} ${ST.y + 4} L ${ST.x + 24} ${ST.y + 10} L ${ST.x + 10} ${ST.y + 34} M ${ST.x - 48} ${ST.y + 10} L ${ST.x - 22} ${ST.y + 20}" fill="none" ${S(4)}/>
      <g transform="translate(${ST.x} ${ST.y - 4})">${toothFace(p + "stein", { r: 15, gap: 18, mouthY: 24, mouthS: 0.34, mouthInit: "smirk", lidFill: TN.stone })}${browPair(p + "stein", 18, 15, -22)}</g>
    </g>
    ${Array.from({ length: 7 }, (_, i) => `<path id="${p}crumb${i}" opacity="0" d="M -10 -4 L 0 -12 L 11 -3 L 6 9 L -8 8 Z" fill="${TN.stone}" ${S(3)}/>`).join("")}
  </g>
  <path id="${p}stream" d="M ${BIER.x - 78} ${BIER.y + 1} C 480 540 410 580 372 652" fill="none" stroke="${TN.urine}" stroke-width="16" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>
  <g id="${p}bier-pos"><g transform="scale(0.85)">${beerMug(p + "bier")}</g></g>
  ${
    env === "op"
      ? `<defs><radialGradient id="${p}lamp" cx="45%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="0.2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
  <rect x="-400" y="-400" width="${W + 800}" height="${H + 1000}" fill="url(#${p}lamp)"/>
  ${[0, 1, 2, 3].map((i) => `<circle id="${p}wave${i}" cx="${ST.x}" cy="${ST.y}" r="220" fill="none" stroke="#9FE3FF" stroke-width="10" opacity="0"/>`).join("")}
  <g id="${p}dev-pos"><g id="${p}dev">
    <path d="M -120 40 L 120 40 L 170 420 L -170 420 Z" fill="${TN.metal}" ${S()}/>
    <path d="M -80 120 L 80 120 M -100 200 L 100 200" stroke="${TN.metalHi}" stroke-width="10" stroke-linecap="round"/>
    <circle r="130" fill="${TN.metal}" ${S()}/>
    <circle r="92" fill="${TN.metalHi}" ${S(4)}/>
    <circle r="50" fill="#BFE6F5" ${S(4)}/>
    <path d="M -10 -30 L 12 -4 L -4 2 L 10 30" fill="none" stroke="#FFE14D" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  </g></g>
  <g id="${p}lock-pos"><g id="${p}lock">
    <circle r="78" fill="none" stroke="${C.ink}" stroke-width="16"/>
    <circle r="78" fill="none" stroke="${TN.lock}" stroke-width="8"/>
    <path d="M 0 -110 L 0 -56 M 0 56 L 0 110 M -110 0 L -56 0 M 56 0 L 110 0" stroke="${C.ink}" stroke-width="16" stroke-linecap="round"/>
    <path d="M 0 -110 L 0 -56 M 0 56 L 0 110 M -110 0 L -56 0 M 56 0 L 110 0" stroke="${TN.lock}" stroke-width="8" stroke-linecap="round"/>
  </g></g>`
      : ""
  }
 </g></g>
 <rect id="${p}flash" x="0" y="0" width="${W}" height="${H}" fill="#fff" opacity="0"/>
</svg>`;

const BODY_INIT = `
    initChar("@niere", 30, 0.1);
    initChar("@stein", 15, 0.5);
    initChar("@bier", 20, 0.2);
    gsap.set("#@cam", { svgOrigin: "540 960" });
    gsap.set("#@frame", { svgOrigin: "0 0" });
    // Nah (1,7–2,0) für Dialog und Action, kurz weit (1,15) für den Überblick.
    const frameTo = (px, py, k, t, d = 0.4, ease = "power3.inOut") => {
      k = Math.min(k, 2.1);
      const x = Math.min(0, Math.max(${W} - k * ${W}, 540 - k * px));
      const y = Math.min(0, Math.max(${H} - k * ${H}, 960 - k * py));
      tl.to("#@frame", { x, y, scale: k, duration: d, ease }, t);
    };
    gsap.set("#@niere-t", { svgOrigin: "${KID.x} ${KID.y}" });
    gsap.set("#@stein-t", { svgOrigin: "${ST.x} ${ST.y}" });
    gsap.set("#@bier", { svgOrigin: "0 0" });
    const BROWO = { niere: [38, -44], stein: [18, -22], bier: [26, -30] };
    Object.entries(BROWO).forEach(([c, [g, y]]) => { gsap.set("#@" + c + "-browL", { svgOrigin: -g + " " + y }); gsap.set("#@" + c + "-browR", { svgOrigin: g + " " + y }); });
    const BROW = { loud: [14, -14], angry: [18, -18], panic: [-16, 16], worried: [-14, 14], smug: [-12, 4], happy: [-6, 6], flat: [0, 0] };
    const brows = (ch, mood, t) => {
      const [l, r] = BROW[mood] || [0, 0];
      if (!document.querySelector("#" + ch + "-browL")) return;
      tl.to("#" + ch + "-browL", { rotation: l, duration: 0.15 }, t);
      tl.to("#" + ch + "-browR", { rotation: r, duration: 0.15 }, t);
    };
    // Niere zuckt vor Schmerz, Schmerzstern pulst.
    const ouch = (t) => {
      tl.to("#@niere-t", { scaleX: 0.95, scaleY: 1.04, duration: 0.1, ease: "power2.out" }, t);
      tl.to("#@niere-t", { scaleX: 1, scaleY: 1, duration: 0.5, ease: "elastic.out(1,0.4)" }, t + 0.1);
      tl.fromTo("#@pain", { opacity: 1, scale: 0.6, svgOrigin: "0 0" }, { opacity: 0, scale: 1.2, duration: 0.6, ease: "power2.out", immediateRender: false }, t);
    };
    const BOFF = [1300, -300];
    gsap.set("#@bier-pos", { x: BOFF[0], y: BOFF[1], rotation: 30, svgOrigin: "0 0" });
`;

/* ---------- Acting ---------- */
const MOOD = {
  n1: "loud",
  s1: "smug",
  n2: "angry",
  s2: "smug",
  b1: "happy",
  b2: "worried",
  n3: "panic",
  o1: "panic",
  o2: "panic",
  o3: "happy",
  o4: "happy",
  o5: "angry",
};
const CHARS = ["niere", "stein", "bier"];
const FACE = { niere: [370, 880, 1.8], stein: [ST.x, 950, 2.0], bier: [470, 860, 1.25] };
function lookVec(from, to) {
  const dx = POS[to][0] - POS[from][0],
    dy = POS[to][1] - POS[from][1];
  const n = Math.hypot(dx, dy) || 1;
  return [Math.round((dx / n) * 14), Math.round((dy / n) * 14)];
}
function actLines(scene, { frames = true, from = 0, skip = [] } = {}) {
  return lines
    .filter((l) => LINE_SCENE[l.id] === scene && VO[l.id] && CHARS.includes(l.speaker))
    .map((l) => {
      const me = l.speaker,
        mood = MOOD[l.id] || "flat";
      const t = l.start,
        e = l.end;
      let js = CHARS.filter((c) => c !== me)
        .map((c) => `look("@${c}", ${lookVec(c, me).join(", ")}, ${+(t - 0.1).toFixed(2)});`)
        .join(" ");
      if (frames && t >= from && !skip.includes(l.id)) {
        const [fx, fy, fk] = FACE[me];
        js += `frameTo(${fx}, ${fy}, ${fk}, ${+(t - 0.15).toFixed(2)});`;
      }
      js += `brows("@${me}", "${mood}", ${t});`;
      if (mood === "angry" || mood === "panic" || mood === "loud")
        js += `squeeze("@${me}", true, ${t}); squeeze("@${me}", false, ${+(t + 0.45).toFixed(2)});`;
      if (mood === "smug") js += `lids("@${me}", 0.55, ${t});`;
      if (me === "niere" && mood !== "happy") js += `ouch(${t});`;
      const rest = mood === "happy" ? "smile" : mood === "smug" ? "smirk" : "frown";
      return js + `talk("@${me}", ${t}, ${e}, "${rest}");`;
    })
    .join("\n    ");
}
const blinks = (a, b) => {
  let js = "";
  for (let t = a + 1.2, i = 0; t < b - 0.3; t += 1.6, i++)
    js += `blink("@${["niere", "stein"][i % 2]}", ${+t.toFixed(2)});`;
  return js;
};

/* ---------- Szene 1: Niere gegen Stein, das Bier macht alles schlimmer ---------- */
const streitJs = `${HELPERS}${BODY_INIT}
    const S0 = ${SC.streit[0]}, S1 = ${SC.streit[1]};
    // Frame 0: nah, beide Gesichter groß, Schmerz sofort sichtbar.
    frameTo(380, 900, 1.8, S0, 0.01);
    face("@niere", "wavy", S0); face("@stein", "smirk", S0); lids("@stein", 0.55, S0, 0.01);
    look("@niere", 12, 10, S0, 0.01); look("@stein", -12, -10, S0, 0.01);
    gsap.set("#@cam", { scale: 1.12 });
    tl.to("#@cam", { scale: 1, duration: 0.5, ease: "power3.out" }, S0);
    shake("#@cam", S0, 0.35, 10);
    ${JSON.stringify(emphTimes("streit").filter((t) => t > 0.7))}.forEach((t) => { punch("#@cam", t, 1.04); shake("#@cam", t, 0.25, 6); });
    // Überblick (wo im Körper?), dann zurück nah.
    frameTo(540, 1000, 1.15, ${L.s1[0]} - 0.2, 0.55);
    // Stein macht sich breit, Harnleiter staut sich.
    tl.to("#@stein-t", { scale: 1.08, duration: 0.3, yoyo: true, repeat: 1, ease: "sine.inOut" }, ${L.s2[0]} + 0.3);
    ${actLines("streit", { skip: ["n1", "s1"] })}
    // Bier fliegt rein, kippt, gießt in die Niere; der Strahl staut sich am Stein.
    const B0 = ${L.b1[0]} - 0.75;
    tl.to("#@bier-pos", { x: ${BIER.x}, y: ${BIER.y}, rotation: 0, duration: 0.6, ease: "back.out(1.4)" }, B0);
    frameTo(470, 860, 1.25, B0, 0.45);
    const P0 = ${L.b1[1]} + 0.1;
    tl.to("#@bier-pos", { rotation: -50, duration: 0.35, ease: "power2.inOut" }, P0);
    tl.to("#@stream", { strokeDashoffset: 0, duration: 0.35, ease: "none" }, P0 + 0.3);
    tl.to("#@liq1", { strokeDashoffset: 0, duration: 0.6, ease: "power1.in" }, P0 + 0.6);
    frameTo(400, 900, 1.5, P0 + 0.4, 0.5);
    tl.to("#@niere-t", { scale: 1.1, duration: 0.9, ease: "power2.out" }, P0 + 0.6);
    tl.to("#@pelvisL", { fill: "${TN.urine}", duration: 0.4 }, P0 + 0.6);
    tl.to("#@u1-i", { stroke: "${TN.urine}", duration: 0.4 }, P0 + 0.8);
    tl.to("#@bulge", { fill: "#F0C46A", duration: 0.4 }, P0 + 0.9);
    tl.to(["#@u1-o", "#@u1-i"], { strokeWidth: (i) => [52, 42][i], duration: 0.8, ease: "power2.out" }, P0 + 0.8);
    tl.to("#@bulge", { scale: 1.08, svgOrigin: "${ST.x} ${ST.y}", duration: 0.2, yoyo: true, repeat: 3 }, P0 + 1.1);
    tl.to("#@sweat", { opacity: 1, duration: 0.2 }, P0 + 0.9);
    tl.to("#@sweat", { y: 40, duration: 1.4, ease: "power1.in" }, P0 + 0.9);
    tl.to("#@bier-pos", { rotation: 0, duration: 0.35, ease: "power2.inOut" }, ${L.b2[0]} - 0.3);
    tl.to("#@stream", { strokeDashoffset: -1, duration: 0.3, ease: "none" }, ${L.b2[0]} - 0.35);
    // Hicks: das Bier hüpft.
    tl.to("#@bier-pos", { y: ${BIER.y - 26}, duration: 0.1, yoyo: true, repeat: 1, ease: "power2.out" }, ${L.b2[0]} + 0.05);
    face("@bier", "wavy", ${L.b2[1]});
    tl.to("#@niere-t", { scale: 1.16, duration: 0.4, ease: "back.out(2)" }, ${L.n3[0]});
    shake("#@cam", ${L.n3[0]}, 0.5, 9);
    // Kommentar-Frage früh, bevor das Bier kommt (oben frei).
    tl.fromTo("#ask", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)", immediateRender: true }, ${L.n2[0]});
    tl.to("#ask", { opacity: 0, duration: 0.2 }, B0 - 0.1);
    ${blinks(SC.streit[0], SC.streit[1])}
    tl.to("#@flash", { opacity: 0.9, duration: 0.12 }, S1 - 0.12);
`;
const askBody = `<div id="ask"><div class="ask-1">Hattest du schon mal einen?</div><div class="ask-2">Schreib's in die Kommentare ↓</div></div>`;
const askCss = `#ask { position: absolute; left: 0; right: 0; top: 390px; margin: 0 auto; width: max-content; padding: 12px 30px;
  border-radius: 34px; background: #FFE14D; color: #1d1414; border: 6px solid #1d1414; font-family: "Montserrat", sans-serif;
  font-weight: 900; font-size: 46px; opacity: 0; text-align: center; line-height: 1.15; }
  #ask .ask-2 { font-size: 34px; font-weight: 800; }`;

/* ---------- Szene 2: Stoßwellen (ESWL) – orten, zertrümmern, rausspülen ---------- */
const STEPS = ["STEIN ORTEN", "STOSSWELLEN", "BRÖCKCHEN RAUSSPÜLEN"];
const stepsBody = `<div id="steps">${STEPS.map((t, i) => `<div class="st" id="st${i + 1}"><span class="st-n">SCHRITT ${i + 1}/3</span><div class="st-t">${t}</div></div>`).join("")}</div>`;
const stepsCss = `
  .st { position: absolute; left: 0; right: 0; top: 390px; text-align: center; opacity: 0; }
  .st-n { display: inline-block; padding: 8px 24px; border-radius: 30px; background: #FFE14D; color: #1d1414;
    font-family: "Montserrat", sans-serif; font-weight: 800; font-size: 36px; border: 5px solid #1d1414; }
  .st-t { margin-top: 10px; font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 60px; color: #fff;
    -webkit-text-stroke: 12px #1d1414; paint-order: stroke fill; text-shadow: 0 6px 0 rgba(0,0,0,0.35); }`;
const CRUMBS = [
  [-30, -20],
  [24, -26],
  [-8, 6],
  [30, 14],
  [-32, 24],
  [8, 34],
  [2, -40],
];
const opJs = `${HELPERS}${BODY_INIT}
    const O0 = ${SC.op[0]};
    // Zustand aus dem Streit: Niere geschwollen, Stau bis zum Stein, Bier sitzt oben.
    gsap.set("#@niere-t", { scale: 1.12 });
    gsap.set("#@liq1", { strokeDashoffset: 0 });
    gsap.set("#@pelvisL", { fill: "${TN.urine}" }); gsap.set("#@u1-i", { stroke: "${TN.urine}" }); gsap.set("#@bulge", { fill: "#F0C46A" });
    gsap.set(["#@u1-o", "#@u1-i"], { strokeWidth: (i) => [52, 42][i] });
    face("@niere", "wavy", O0); face("@stein", "smirk", O0); face("@bier", "frown", O0); lids("@stein", 0.55, O0, 0.01);
    look("@niere", 12, 10, O0, 0.01); look("@stein", -12, -10, O0, 0.01); look("@bier", -10, 10, O0, 0.01);
    tl.fromTo("#@flash", { opacity: 0.9 }, { opacity: 0, duration: 0.35, ease: "power2.out", immediateRender: false }, O0);
    gsap.set("#@flash", { opacity: 0.9 });
    gsap.set("#@lock-pos", { x: 1300, y: 500 });
    gsap.set("#@dev-pos", { x: -320, y: 1520, rotation: 0, svgOrigin: "0 0" });
    gsap.set("#@dev", { rotation: 45, svgOrigin: "0 0" });
    let curStep = 0;
    const step = (n, t) => {
      if (curStep) tl.to("#st" + curStep, { opacity: 0, y: -20, duration: 0.15 }, t - 0.15);
      tl.fromTo("#st" + n, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3, ease: "back.out(2)", immediateRender: false }, t);
      curStep = n;
    };
    const o1 = ${JSON.stringify(L.o1)}, o2 = ${JSON.stringify(L.o2)}, o3 = ${JSON.stringify(L.o3)}, o4 = ${JSON.stringify(L.o4)}, o5 = ${JSON.stringify(L.o5)};
    frameTo(470, 940, 1.6, O0, 0.01);

    // Schritt 1: Fadenkreuz sucht und rastet auf dem Stein ein.
    step(1, O0 + 0.1);
    tl.to("#@lock-pos", { keyframes: [{ x: 640, y: 820 }, { x: 380, y: 1060 }, { x: ${ST.x}, y: ${ST.y} }], duration: 0.8, ease: "power1.inOut" }, O0 + 0.2);
    tl.fromTo("#@lock", { scale: 1.4, svgOrigin: "0 0" }, { scale: 1, duration: 0.25, ease: "back.out(3)", immediateRender: false }, O0 + 1.0);
    tl.to("#@lock", { opacity: 0.4, duration: 0.08, yoyo: true, repeat: 3 }, O0 + 1.0);
    shake("#@stein-t", o1[0], 0.4, 4, "x");

    // Schritt 2: Stoßwellen-Kopf von außen, Wellen bündeln sich auf den Stein, er reißt und zerfällt.
    const T2 = o1[1] + 0.25;
    step(2, T2);
    frameTo(440, 1000, 1.35, T2, 0.45);
    tl.to("#@dev-pos", { x: 150, y: 1250, duration: 0.6, ease: "power3.out" }, T2);
    tl.to("#@lock", { opacity: 0, duration: 0.2 }, T2 + 0.3);
    for (let k = 0; k < 7; k++) {
      const t = T2 + 0.6 + k * 0.36, c = "#@wave" + (k % 4);
      tl.fromTo(c, { attr: { r: 220 }, opacity: 0.95 }, { attr: { r: 30 }, opacity: 0, duration: 0.42, ease: "power1.in", immediateRender: false }, t);
      tl.to("#@dev", { scale: 1.06, duration: 0.08, yoyo: true, repeat: 1 }, t);
      shake("#@stein-t", t + 0.35, 0.18, 5, "x");
    }
    tl.to("#@crack1", { opacity: 1, duration: 0.05 }, T2 + 1.5);
    tl.to("#@crack2", { opacity: 1, duration: 0.05 }, T2 + 2.2);
    const BR = o2[1] + 0.25;
    tl.to("#@stein-t", { opacity: 0, scale: 1.2, duration: 0.15 }, BR);
    tl.to("#@bulge", { scale: 0.55, svgOrigin: "${ST.x} ${ST.y}", duration: 0.35, ease: "back.out(2)" }, BR);
    shake("#@cam", BR, 0.35, 10);
    ${JSON.stringify(CRUMBS)}.forEach(([dx, dy], i) => {
      const c = "#@crumb" + i;
      tl.set(c, { opacity: 1, x: ${ST.x}, y: ${ST.y}, rotation: i * 40 }, BR);
      tl.to(c, { x: ${ST.x} + dx, y: ${ST.y} + dy, rotation: "+=120", duration: 0.35, ease: "power2.out" }, BR);
    });
    tl.to("#@dev-pos", { x: -320, y: 1520, duration: 0.5, ease: "power2.in" }, BR + 0.4);

    // Schritt 3: Wasser spült die Bröckchen durch den Harnleiter in die Blase.
    const T3 = BR + 0.6;
    step(3, T3);
    frameTo(500, 1100, 1.2, T3, 0.5);
    tl.to("#@liq1", { stroke: "${TN.water}", duration: 0.4 }, T3 + 0.2);
    tl.to(["#@pelvisL", "#@bulge"], { fill: "${TN.tube}", duration: 0.8 }, T3 + 0.4);
    tl.to("#@u1-i", { stroke: "${TN.tube}", duration: 0.8 }, T3 + 0.4);
    tl.to("#@liq2", { strokeDashoffset: 0, duration: 1.0, ease: "power1.inOut" }, T3 + 0.4);
    ${JSON.stringify(CRUMBS)}.forEach(([dx], i) => {
      const c = "#@crumb" + i, t = T3 + 0.4 + i * 0.1;
      tl.to(c, { keyframes: [{ x: 460 + dx * 0.3, y: 1080 }, { x: 472 + dx * 0.3, y: 1210 }, { x: 510 + dx * 0.6, y: 1380 }], duration: 1.1, ease: "power1.in" }, t);
      tl.to(c, { opacity: 0, duration: 0.2 }, t + 1.1);
    });
    tl.to("#@niere-t", { scale: 1, duration: 0.8, ease: "elastic.out(1,0.5)" }, T3 + 0.6);
    tl.to(["#@u1-o", "#@u1-i"], { strokeWidth: (i) => [34, 24][i], duration: 0.6 }, T3 + 0.6);
    tl.to("#@bladder", { scale: 1.06, svgOrigin: "540 1400", duration: 0.2, yoyo: true, repeat: 1 }, T3 + 1.5);
    tl.to("#@liq1", { strokeDashoffset: -1, duration: 0.6 }, o3[1]);
    tl.to("#@liq2", { strokeDashoffset: -1, duration: 0.8 }, o3[1] + 0.2);
    tl.to("#st3", { opacity: 0, duration: 0.2 }, o3[1] - 0.2);
    // Bier will sich die Lorbeeren holen.
    frameTo(470, 860, 1.25, o4[0] - 0.4);
    tl.to("#@bier-pos", { x: ${BIER.x}, y: ${BIER.y}, rotation: 0, duration: 0.45, ease: "back.out(1.4)" }, o4[0] - 0.45);
    ${actLines("op", { frames: false })}
    lids("@niere", 0.2, o3[0]); look("@niere", 0, -6, o3[0]);
    tl.to("#@bier-pos", { rotation: 12, duration: 0.2, yoyo: true, repeat: 1 }, o5[1] - 0.2);
    face("@bier", "frown", o5[1]);
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
  <g id="pt-belly"><g transform="translate(588 800) scale(0.9)">
    <g id="pt-beer">${beerMug("pbier")}</g>
    <g id="pt-water" opacity="0">
      <rect x="-34" y="-110" width="68" height="200" rx="22" fill="#BFE6F5" ${S()}/>
      <rect x="-34" y="-40" width="68" height="60" fill="#3D9BE0" ${S(4)}/>
      <rect x="-16" y="-140" width="32" height="34" rx="6" fill="#3D79C9" ${S(4)}/>
      <path d="M -16 -90 L -16 60" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity="0.7"/>
    </g>
  </g></g>
  <circle cx="580" cy="880" r="28" fill="${P.skin}" ${S()}/>
  <rect x="700" y="1290" width="240" height="26" rx="6" fill="#B08A5E" ${S(4)}/>
  <path d="M 730 1316 L 730 1560 M 910 1316 L 910 1560" ${S(12)}/>
  <g id="pt-puffs" opacity="0">
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
  <div class="ct" id="ct1">WELCHES ORGAN IST</div>
  <div class="ct ct-y" id="ct2">ALS NÄCHSTES DRAN?</div>
  <div id="ct3">Der Top-Kommentar entscheidet –<br>schreib's in die Kommentare ↓</div>
</div>`;
const ctaCss = `
  #cta { position: absolute; left: 0; right: 0; top: 360px; text-align: center; opacity: 0; }
  .ct { font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 54px; line-height: 1.05; color: #fff;
    -webkit-text-stroke: 16px #1d1414; paint-order: stroke fill; text-shadow: 0 8px 0 rgba(0,0,0,0.35); }
  .ct-y { color: #FFE14D; font-size: 72px; }
  #ct3 { display: inline-block; margin-top: 18px; padding: 14px 30px; border-radius: 40px; background: #1d1414;
    color: #fff; font-family: "Montserrat", sans-serif; font-weight: 800; font-size: 42px; }`;
// Gemeinsames Acting für beide Patienten-Auftritte.
const patientBase = (a, b) => `
    const LIDS = ["#pe1-lid", "#pe2-lid"], PUP = ["#pe1-p", "#pe2-p"];
    gsap.set(LIDS, { scaleY: 0.15, svgOrigin: "0 -26" });
    gsap.set("#pt-cam", { transformOrigin: "60% 50%", scale: 1.2 });
    gsap.set("#pt-head", { svgOrigin: "${HX} ${HY + 100}" });
    gsap.set("#pt-belly", { svgOrigin: "580 860" });
    gsap.set("#pt-browL", { rotation: -12, svgOrigin: "${HX - 12} ${HY - 48}" });
    gsap.set("#pt-browR", { rotation: 12, svgOrigin: "${HX + 12} ${HY - 48}" });
    tl.to("#pt-cam", { scale: 1, duration: 0.5, ease: "back.out(1.6)" }, ${a});
    tl.fromTo("#pt-belly", { scale: 1.2 }, { scale: 1, duration: 0.7, ease: "elastic.out(1.2,0.35)" }, ${a} + 0.05);
    for (let t = ${a} + 0.9; t < ${b} - 0.2; t += 0.95) {
      tl.to("#pt-belly", { scale: 1.03, duration: 0.1, ease: "power2.out" }, t);
      tl.to("#pt-belly", { scale: 1, duration: 0.45, ease: "elastic.out(1,0.4)" }, t + 0.1);
      
    }
    tl.to(LIDS, { scaleY: 1, duration: 0.06 }, ${a} + 1.5); tl.to(LIDS, { scaleY: 0.15, duration: 0.09 }, ${a} + 1.57);
`;
const patientJs = `
    const P0 = ${SC.patient[0]}, P1 = ${SC.patient[1]};
    ${patientBase("P0", "P1")}
    // Kevin will mehr trinken – das Bier freut sich zu früh.
    gsap.set(["#pbier-eyeL-lid", "#pbier-eyeR-lid"], { scaleY: 0.2, svgOrigin: "0 -28" });
    tl.to(LIDS, { scaleY: 0.3, duration: 0.15 }, ${L.e1[0]});
    talk("pm", ${L.e1}, "smile", 0.12);
    tl.to(PUP, { x: 10, y: 6, duration: 0.2 }, ${L.e2[0]} - 0.1);
    talk("pbier", ${L.e2}, "smile");
    tl.to("#pt-beer", { y: -30, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.out" }, ${L.e2[0]});
    // Bier wird abgestellt, Wasserflasche kommt.
    tl.to("#pt-beer", { x: 250, y: 470, duration: 0.4, ease: "power2.inOut" }, ${L.e3[0]} - 0.45);
    tl.fromTo("#pt-water", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.3, ease: "back.out(2)", immediateRender: false }, ${L.e3[0]} - 0.1);
    tl.to(PUP, { x: 0, y: -2, duration: 0.2 }, ${L.e3[0]} - 0.1);
    talk("pm", ${L.e3}, "smirk", 0.12);
    tl.to(PUP, { x: 12, y: 10, duration: 0.2 }, ${L.e4[0]} - 0.1);
    face("pbier", "frown", ${L.e4[0]});
    tl.to(["#pbier-eyeL-lid", "#pbier-eyeR-lid"], { scaleY: 0.5, duration: 0.15 }, ${L.e4[0]});
    talk("pbier", ${L.e4}, "frown");
    tl.to("#pbier-foam", { y: 14, scaleY: 0.7, svgOrigin: "0 -60", duration: 0.5, ease: "power2.in" }, ${L.e4[0]});
    tl.fromTo("#cta", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.2)" }, ${L.e4[1]} + 0.1);
    tl.to("#ct2", { scale: 1.08, duration: 0.12, ease: "power2.out" }, ${L.e4[1]} + 0.7);
    tl.to("#ct2", { scale: 1, duration: 0.25, ease: "power2.inOut" }, ${L.e4[1]} + 0.82);
    tl.to("#ct3", { y: 8, duration: 0.4, ease: "sine.inOut", repeat: 4, yoyo: true }, ${L.e4[1]} + 0.8);
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

/* ================= Hook-Titel (erste Sekunden) ================= */
const hookBody = `
    <div id="hook">
      <div id="case">${script.case}</div>
${script.hook.map(([t, size, col], i) => `      <div class="hk" id="hk${i + 1}" style="font-size:${size}px;color:${col}">${t}</div>`).join("\n")}
    </div>`;
const hookCss = `
  #hook { position: absolute; left: 0; right: 0; top: 380px; text-align: center; transform: rotate(-3deg); }
  .hk { font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 86px; line-height: 1.04;
    color: #fff; -webkit-text-stroke: 16px #1d1414; paint-order: stroke fill; text-shadow: 0 8px 0 rgba(0,0,0,0.35); }
  .hk-y { color: #FFE14D; font-size: 102px; }
  #case { display: inline-block; margin-bottom: 8px; padding: 6px 22px; border-radius: 26px; background: #1d1414; color: #fff;
    font-family: "Montserrat", sans-serif; font-weight: 800; font-size: 32px; letter-spacing: 2px; }`;
const hookJs = `
    // Frame 0 = erster Eindruck im Feed: Titel sofort voll lesbar, dann Puls auf dem Schlüsselwort.
    [0.25, 1.6].forEach((t) => {
      tl.to("#hk1", { scale: 1.1, duration: 0.08, ease: "power2.out" }, t);
      tl.to("#hk1", { scale: 1, duration: 0.3, ease: "elastic.out(1,0.5)" }, t + 0.08);
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
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${TN.bg}; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}">
${host("streit", 1)}

${host("op", 3)}
${host("praxis", 4)}
${host("captions", 5, "captions", 5)}
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
    #wm { position: absolute; left: 60px; top: 1440px; font-family: "Montserrat", sans-serif; font-weight: 700;
      font-size: 46px; color: rgba(255,255,255,0.32); transform: none; transform-origin: left center; white-space: nowrap; }
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
  page("streit", SC.streit, body("s-") + askBody, askCss, pre("s-", streitJs)),
);
out(
  "./compositions/op.html",
  page("op", SC.op, body("o-", "op") + stepsBody, stepsCss, pre("o-", opJs)),
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
