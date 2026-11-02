// Stockwerk 13 · Teil 1. Erzeugt index.html + compositions/*.html aus script.json
// und assets/vo/timings.json (python3 voices.py). Run: node build.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const W = 1080;
const H = 1920;
const script = JSON.parse(readFileSync(new URL("./script.json", import.meta.url), "utf8"));
const VO_FILE = new URL("./assets/vo/timings.json", import.meta.url);
const VO = existsSync(VO_FILE) ? JSON.parse(readFileSync(VO_FILE, "utf8")) : {};
const V = script.voice;
const r3 = (x) => +x.toFixed(3);

/* ================= Timing ================= */
const FIRST = 0.3;
const lines = script.lines;
const LN = {};
let t = FIRST;
for (const l of lines) {
  if (l !== lines[0]) t += l.gap ?? V.gap;
  const vo = VO[l.id];
  const words = l.text.replace("...", " ").split(/\s+/).filter(Boolean);
  const dur = vo ? vo.duration : words.length / 2.6 + 0.2;
  const wt = vo
    ? vo.words
    : words.map((w, i) => ({
        text: w,
        start: (i / words.length) * dur,
        end: ((i + 1) / words.length) * dur,
      }));
  LN[l.id] = {
    ...l,
    start: r3(t),
    end: r3(t + dur),
    words: wt.map((w) => ({ ...w, start: r3(t + w.start), end: r3(t + w.end) })),
  };
  t += dur;
}
const DUR = r3(t + script.tail);
const LS = (id) => LN[id].start;
const LE = (id) => LN[id].end;
const bare = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const W_ = (id, word, n = 0) => {
  const hits = LN[id].words.filter((w) => bare(w.text) === bare(word));
  if (!hits[n]) throw new Error(`Wort "${word}" nicht in ${id}`);
  return hits[n].start;
};
const C0 = (id) => r3(LS(id) - 0.08); // Schnitt kurz vor dem Satz

/* ================= Palette ================= */
const P = { cyan: "#4FD1FF" };

/* ================= Wortanker für die 3D-Szene ================= */
const T_TEASE = 1.3;
const floors = [
  ["n5", "fünf", 5],
  ["n5", "sechs", 6],
  ["n5", "sieben", 7],
  ["n7", "acht", 8],
  ["n7", "neun", 9],
  ["n7", "zehn", 10],
  ["n7", "elf", 11],
  ["n7", "zwölf", 12],
];
const T13 = r3(W_("n9", "dreizehn") - 0.03);
const fl = W_("n10", "flackert");
const press = W_("n2", "sieben");
const ST = W_("n18", "stimme");
const noteWords = [
  "hält",
  "der",
  "aufzug",
  "im",
  "dreizehnten",
  "stock",
  "bleib",
  "auf",
  "keinen",
  "fall",
];
const EV = {
  tease: T_TEASE,
  press,
  drueckst: r3(W_("n2", "drückst") - 0.05),
  akku: W_("n3", "akku"),
  kein: r3(W_("n3", "kein") - 0.05),
  faehrt: W_("n4", "fährt"),
  halt: W_("n6", "hält"),
  t13: T13,
  ruck: r3(W_("n10", "ruck") - 0.05),
  flackert: fl,
  offen: W_("n16", "offen"),
  licht: W_("n16", "licht"),
  n16e: LE("n16"),
  namen: r3(W_("n17", "namen") - 0.05),
  stimme: r3(ST - 0.02),
  wA: r3(W_("n21", "a") - 0.05),
  erdgeschoss: W_("n21", "erdgeschoss"),
  wB: r3(W_("n22", "b") - 0.05),
  machst: W_("n23", "machst"),
};
for (const l of lines) EV[l.id] = C0(l.id);
EV.n16 = LS("n16");
const STK = {
  dur: DUR,
  ev: EV,
  floors: Object.fromEntries(floors.map(([id, w, n]) => [n, r3(W_(id, w) - 0.04)])),
  noteTimes: noteWords.map((w) => r3(W_("n12", w) - 0.02)),
};

/* ================= Seiten ================= */
const page = (id, body, css, script) => `<template>
  <style>
    #root { position: absolute; inset: 0; overflow: hidden; background: #000; }
    ${css}
  </style>
  <div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}" data-layout-allow-overflow data-layout-allow-overlap>
${body}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
${script}
    tl.set({}, {}, ${DUR});
    window.__timelines["${id}"] = tl;
  </script>
</template>
`;

/* ================= Untertitel ================= */
const NO_CAPS = new Set(["n12", "n24"]);
const caps = [];
for (const l of lines) {
  if (NO_CAPS.has(l.id)) continue;
  const L = LN[l.id];
  const emph = new Set((l.emph || []).map(bare));
  let cur = [];
  const flush = () => {
    if (cur.length) caps.push({ words: cur, line: l.id });
    cur = [];
  };
  L.words.forEach((w) => {
    const chars = cur.reduce((s, x) => s + x.text.length, 0) + w.text.length;
    if (cur.length >= 2 || (cur.length && chars > 14)) flush();
    cur.push({ ...w, emph: emph.has(bare(w.text)) });
    if (/[,.:;!?]$/.test(w.text) || w.text === "…") flush();
  });
  flush();
}
caps.forEach((c, i) => {
  c.a = c.words[0].start;
  const next = caps[i + 1];
  const lineEnd = LE(c.line) + 0.2;
  c.b =
    next && next.line === c.line
      ? next.words[0].start
      : next
        ? Math.min(lineEnd, next.words[0].start)
        : lineEnd;
});
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const capText = (w) =>
  esc(
    w.text
      .replace(/[,.:;!?]+$/, "")
      .replace(/^[„"]/, "")
      .replace(/[“"]$/, ""),
  );
const capBody = caps
  .map(
    (c, i) =>
      `    <div class="cap" id="c${i}">${c.words.map((w) => (w.emph ? `<span class="em">${capText(w)}</span>` : capText(w))).join(" ")}</div>`,
  )
  .join("\n");
const capJs = caps
  .map(
    (c, i) =>
      `tl.set("#c${i}", { opacity: 1 }, ${r3(c.a)}); tl.fromTo("#c${i}", { scale: 0.9 }, { scale: 1, duration: 0.08, ease: "power2.out", immediateRender: false }, ${r3(c.a)}); tl.set("#c${i}", { opacity: 0 }, ${r3(c.b)});`,
  )
  .join("\n    ");
const captions = page(
  "captions",
  capBody,
  `#root { background: transparent; }
    .cap { position: absolute; left: 60px; right: 60px; top: 1300px; text-align: center; opacity: 0;
      font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 80px; line-height: 1; letter-spacing: 1px;
      color: #fff; text-transform: uppercase; -webkit-text-stroke: 12px #07080A; paint-order: stroke fill;
      text-shadow: 0 5px 0 rgba(0,0,0,0.45); transform-origin: 50% 50%; }
    .cap .em { color: #FF3B3B; }`,
  capJs,
);

/* ================= Overlay: Serien-Chip + Endkarte ================= */
const E0 = C0("n24");
const overlay = page(
  "overlay",
  `    <div id="vig"></div>
    <svg id="grain" viewBox="0 0 540 960" preserveAspectRatio="none"><filter id="gn"><feTurbulence id="gn-t" type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="1"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.2 -0.35"/></filter><rect width="540" height="960" filter="url(#gn)"/></svg>
    <div id="endbg"></div>
    <div id="chip"><span class="dot"></span>STOCKWERK 13 · TEIL 1</div>
    <div id="endcard">
      <div class="q">WAS MACHST DU?</div>
      <div class="opt a" id="optA"><div class="badge">A</div><div><div class="t">IM AUFZUG BLEIBEN</div><div class="s">Erdgeschoss drücken</div></div></div>
      <div class="opt b" id="optB"><div class="badge">B</div><div><div class="t">AUSSTEIGEN</div><div class="s">Zur Wohnung gehen</div></div></div>
      <div class="cta" id="cta">Schreib <b>A</b> oder <b>B</b> in die Kommentare <span id="arrow">↓</span></div>
      <div class="sub" id="sub">Die Mehrheit entscheidet Teil 2</div>
    </div>`,
  `#root { background: transparent; }
    #vig { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.78) 100%); }
    #grain { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.08; mix-blend-mode: screen; }
    #endbg { position: absolute; inset: 0; background: rgba(4,5,7,0.62); opacity: 0; }
    #chip { position: absolute; top: 210px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 14px;
      padding: 14px 28px; border-radius: 40px; background: rgba(8,9,12,0.72); border: 3px solid rgba(255,255,255,0.22);
      font-family: "Montserrat", sans-serif; font-weight: 800; font-size: 34px; letter-spacing: 3px; color: #E9ECF0; white-space: nowrap; }
    #chip .dot { width: 18px; height: 18px; border-radius: 50%; background: #FF2A2A; box-shadow: 0 0 14px #FF2A2A; }
    #endcard { position: absolute; inset: 0; opacity: 0; font-family: "Montserrat", sans-serif; color: #fff; }
    #endcard .q { position: absolute; top: 400px; left: 0; right: 0; text-align: center; font-weight: 900; font-size: 104px; letter-spacing: 1px;
      -webkit-text-stroke: 10px #07080A; paint-order: stroke fill; }
    .opt { position: absolute; left: 110px; width: 800px; height: 230px; border-radius: 34px; display: flex; align-items: center; gap: 36px;
      padding: 0 40px; background: rgba(8,10,14,0.88); }
    .opt.a { top: 610px; border: 6px solid ${P.cyan}; }
    .opt.b { top: 890px; border: 6px solid #FF4D4D; }
    .opt .badge { width: 136px; height: 136px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      font-weight: 900; font-size: 92px; color: #06121A; flex: none; }
    .opt.a .badge { background: ${P.cyan}; }
    .opt.b .badge { background: #FF4D4D; color: #1A0505; }
    .opt .t { font-weight: 900; font-size: 58px; line-height: 1.05; }
    .opt .s { font-weight: 600; font-size: 36px; color: #AEB7C2; margin-top: 10px; }
    .cta { position: absolute; top: 1200px; left: 80px; right: 120px; text-align: center; font-weight: 800; font-size: 54px; line-height: 1.25; }
    .cta b { font-weight: 900; color: #FFD34D; }
    .cta span { display: inline-block; color: #FFD34D; }
    .sub { position: absolute; top: 1380px; left: 80px; right: 120px; text-align: center; font-weight: 600; font-size: 40px; color: #AEB7C2; }`,
  `tl.set("#chip", { opacity: 0 }, ${C0("n12")}); tl.set("#chip", { opacity: 1 }, ${C0("n14")});
    const grainState = { s: 0 };
    tl.to(grainState, { s: ${Math.round(DUR * 12)}, duration: ${DUR}, ease: "none", onUpdate: () => document.getElementById("gn-t").setAttribute("seed", String(1 + Math.floor(grainState.s))) }, 0);
    tl.set("#endcard", { opacity: 1 }, ${E0});
    tl.fromTo("#endbg", { opacity: 0 }, { opacity: 1, duration: 0.4, immediateRender: false }, ${E0});
    tl.fromTo("#endcard .q", { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out", immediateRender: false }, ${E0});
    tl.fromTo("#optA", { opacity: 0, x: -120 }, { opacity: 1, x: 0, duration: 0.35, ease: "power3.out", immediateRender: false }, ${r3(E0 + 0.12)});
    tl.fromTo("#optB", { opacity: 0, x: 120 }, { opacity: 1, x: 0, duration: 0.35, ease: "power3.out", immediateRender: false }, ${r3(E0 + 0.24)});
    tl.fromTo("#cta", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out", immediateRender: false }, ${r3(W_("n24", "schreib") + 0.05)});
    tl.fromTo("#sub", { opacity: 0 }, { opacity: 1, duration: 0.3, immediateRender: false }, ${r3(LE("n24"))});
    tl.to("#arrow", { y: 14, duration: 0.25, ease: "power2.out" }, ${r3(LE("n24") + 0.3)});
    tl.to("#arrow", { y: 0, duration: 0.35, ease: "power2.in" }, ${r3(LE("n24") + 0.55)});
    tl.to("#arrow", { y: 14, duration: 0.25, ease: "power2.out" }, ${r3(LE("n24") + 1.5)});
    tl.to("#arrow", { y: 0, duration: 0.35, ease: "power2.in" }, ${r3(LE("n24") + 1.75)});`,
);

/* ================= Ton ================= */
const A = [];
const au = (id, src, start, vol, dur) =>
  A.push(
    `      <audio id="${id}" class="clip" src="assets/${src}" data-start="${r3(start)}"${dur ? ` data-duration="${r3(dur)}"` : ""} data-track-index="${20 + A.length}" data-volume="${vol}"></audio>`,
  );
au("bed-drone", "sfx/drone.mp3", 0, 0.55, DUR);
au("sfx-boom0", "sfx/gen-boom.mp3", 0, 0.8);
au("sfx-ding0", "sfx/ding-low.mp3", 0.02, 0.5);
au("sfx-glitch0", "sfx/glitch.mp3", T_TEASE - 0.2, 0.45);
au("sfx-neon", "sfx/neon.mp3", T_TEASE, 0.16, C0("n2") - T_TEASE + 0.3);
au("sfx-klick", "sfx/klick.mp3", press, 0.7);
au("sfx-ding7", "sfx/ding.mp3", press + 0.08, 0.25);
au("sfx-wh-handy", "sfx/whoosh-short.mp3", C0("n3") - 0.05, 0.35);
au(
  "sfx-motor",
  "sfx/motor.mp3",
  W_("n4", "fährt") - 0.1,
  0.32,
  W_("n10", "ruck") - W_("n4", "fährt") + 0.1,
);
au("sfx-start", "sfx/ruck.mp3", W_("n4", "fährt") - 0.05, 0.3);
for (const [id, w] of floors) au(`sfx-tick-${w}`, "sfx/tick.mp3", W_(id, w) - 0.06, 0.28);
au("sfx-riser13", "sfx/gen-riser.mp3", T13 - 1.2, 0.35);
au("sfx-ding13", "sfx/ding-low.mp3", T13, 0.6);
au("sfx-boom13", "sfx/gen-boom.mp3", T13, 0.75);
au("sfx-ruck", "sfx/ruck.mp3", W_("n10", "ruck") - 0.08, 0.9);
au("sfx-glitch", "sfx/glitch.mp3", fl - 0.1, 0.5);
au("sfx-wh-note", "sfx/whoosh-short.mp3", C0("n12") - 0.05, 0.35);
au("sfx-tuer", "sfx/tuer.mp3", C0("n14") + 0.1, 0.6);
au("sfx-neon2", "sfx/neon.mp3", C0("n15"), 0.1, C0("n17") - C0("n15"));
au("sfx-herz", "sfx/herz.mp3", LS("n16"), 0.55, DUR - LS("n16"));
au("sfx-ruf", "sfx/ruf.mp3", LE("n17") + 0.02, 0.45);
au("sfx-stich", "sfx/stich.mp3", ST - 0.04, 0.85);
au("sfx-tuerzu", "sfx/tuer.mp3", C0("n19") + 0.1, 0.4);
au("sfx-pop-a", "sfx/klick.mp3", W_("n21", "a") - 0.05, 0.5);
au("sfx-pop-b", "sfx/klick.mp3", W_("n22", "b") - 0.05, 0.5);
au("sfx-riser-end", "sfx/gen-riser.mp3", C0("n23") - 0.3, 0.3);
au("sfx-impact-end", "sfx/gen-impact.mp3", E0, 0.55);
for (const l of lines)
  A.push(
    `      <audio id="vo-${l.id}" class="clip" src="assets/vo/${l.id}.mp3" data-start="${LS(l.id)}" data-duration="${r3(LE(l.id) - LS(l.id))}" data-track-index="${60 + lines.indexOf(l)}" data-volume="1"></audio>`,
  );

const host = (id, track, kind, z) =>
  `      <div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="0" data-duration="${DUR}" data-track-index="${track}" data-track-kind="${kind}" data-width="${W}" data-height="${H}" style="z-index:${z}"></div>`;

const index = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <title>Stockwerk 13 · Teil 1</title>
    <script src="assets/gsap.min.js"></script>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
      #film3d, #stage, #callouts { position: absolute; inset: 0; width: ${W}px; height: ${H}px; }
      #fontprobe { position: absolute; left: -100px; top: -100px; font-family: "Montserrat", sans-serif; font-size: 10px; opacity: 0; }
      #fontprobe b { font-weight: 900; } #fontprobe i { font-weight: 800; font-style: normal; } #fontprobe u { font-weight: 600; text-decoration: none; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}">
      <div id="film3d" class="clip" data-start="0" data-duration="${DUR}" data-track-index="1" data-track-kind="graphics" style="z-index:1">
        <canvas id="stage" width="${W}" height="${H}"></canvas>
        <div id="fontprobe" aria-hidden="true">.<b>.</b><i>.</i><u>.</u></div>
      </div>
      <svg id="callouts" class="clip" data-start="0" data-duration="${DUR}" data-track-index="4" data-track-kind="graphics" viewBox="0 0 ${W} ${H}" style="z-index:2" data-layout-allow-overflow>
        <g id="callA" style="opacity:0">
          <path id="callA-line" d="M 700 1505 L 980 1505" stroke="${P.cyan}" stroke-width="6" fill="none"/>
          <circle id="callA-dot" cx="980" cy="1300" r="34" fill="none" stroke="${P.cyan}" stroke-width="6"/>
          <g id="callA-pill">
            <rect x="300" y="1450" width="400" height="110" rx="55" fill="#0B1218" stroke="${P.cyan}" stroke-width="6"/>
            <circle cx="358" cy="1505" r="38" fill="${P.cyan}"/>
            <text x="358" y="1522" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="50" fill="#06121A">A</text>
            <text x="414" y="1525" font-family="Montserrat" font-weight="900" font-size="54" fill="#fff">BLEIBEN</text>
          </g>
        </g>
        <g id="callB" style="opacity:0">
          <path id="callB-line" d="M 540 420 L 540 760" stroke="#FF4D4D" stroke-width="6" fill="none"/>
          <circle id="callB-dot" cx="540" cy="800" r="40" fill="none" stroke="#FF4D4D" stroke-width="6"/>
          <g id="callB-pill">
            <rect x="70" y="365" width="470" height="110" rx="55" fill="#180B0B" stroke="#FF4D4D" stroke-width="6"/>
            <circle cx="128" cy="420" r="38" fill="#FF4D4D"/>
            <text x="128" y="437" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="50" fill="#1A0505">B</text>
            <text x="184" y="440" font-family="Montserrat" font-weight="900" font-size="54" fill="#fff">AUSSTEIGEN</text>
          </g>
        </g>
      </svg>
${host("overlay", 2, "graphics", 3)}
${host("captions", 3, "captions", 4)}
${A.join("\n")}
    </div>
    <script>
      window.__STK = ${JSON.stringify(STK)};
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      tl.to({ p: 0 }, { p: 1, duration: ${DUR}, ease: "none" }, 0);
      tl.eventCallback("onUpdate", () => window.__stkRender && window.__stkRender(tl.time()));
      window.addEventListener("hf-seek", (e) => {
        const d = e && e.detail;
        if (d && typeof d.time === "number") tl.totalTime(Math.min(d.time, tl.totalDuration()), true);
        if (window.__stkRender) window.__stkRender(tl.time());
      });
      window.__timelines["main"] = tl;
    </script>
    <script type="module" src="assets/scene.js"></script>
  </body>
</html>
`;

mkdirSync(new URL("./compositions/", import.meta.url), { recursive: true });
const out = (f, s) => writeFileSync(new URL(f, import.meta.url), s);
out("./index.html", index);
out("./compositions/captions.html", captions);
out("./compositions/overlay.html", overlay);
console.log(
  `Dauer ${DUR}s · ${caps.length} Untertitel · VO ${Object.keys(VO).length}/${lines.length}`,
);
