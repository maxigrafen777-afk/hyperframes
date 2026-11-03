// Stockwerk 13 · Teil 2. Erzeugt index.html + compositions/*.html aus script.json
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
const passiert = W_("p3", "passiert");
const rw0 = r3(LE("p3") + 0.35);
const rw1 = r3(C0("p5") - 0.05);
const hammer = W_("p5", "hämmerst");
const run = W_("p6", "rennt");
const closeT = r3(W_("p7", "gesicht") + 0.12);
const schlag = r3(W_("p8", "schlag") - 0.04);
const fahrt = W_("p9", "fährt");
const m13 = r3(W_("p14", "dreizehn") - 0.03);
const disp = [
  [0, "13"],
  [r3(W_("p9", "zwölf") - 0.04), "12"],
  [r3(W_("p9", "acht") - 0.04), "8"],
  [r3(W_("p9", "vier") - 0.04), "4"],
  [r3(W_("p9", "erdgeschoss") - 0.04), "EG"],
  [r3(W_("p12", "eins") - 0.04), "-1"],
  [r3(W_("p12", "zwei") - 0.04), "-2"],
  [r3(W_("p12", "drei") - 0.04), "-3"],
];
// -4 … -12 laufen schnell durch, bis zur -13
{
  const a = LE("p12") + 0.1;
  const b = m13 - 0.15;
  for (let k = 4; k <= 12; k++) disp.push([r3(a + ((k - 4) / 9) * (b - a)), String(-k)]);
  disp.push([m13, "-13"]);
}
// Zwischen-Etagen beim Runterfahren (11..9, 7..5, 3..1)
for (const [from, to, a, b] of [
  [11, 9, W_("p9", "zwölf"), W_("p9", "acht")],
  [7, 5, W_("p9", "acht"), W_("p9", "vier")],
  [3, 1, W_("p9", "vier"), W_("p9", "erdgeschoss")],
]) {
  const n = from - to + 1;
  for (let i = 0; i < n; i++) disp.push([r3(a + ((i + 1) / (n + 1)) * (b - a)), String(from - i)]);
}
disp.sort((x, y) => x[0] - y[0]);
const EV = {
  passiert: r3(passiert - 0.03),
  rw0,
  rw1,
  hammer,
  presses: [hammer, hammer + 0.26, hammer + 0.5, W_("p5", "erdgeschoss")].map(r3),
  run,
  closeT,
  schlag,
  fahrt,
  eg: r3(W_("p9", "erdgeschoss") - 0.04),
  m13,
  stehen: W_("p14", "stehen"),
  vib: W_("p15", "vibriert"),
  msg: r3(W_("p16", "warum") - 0.05),
  sign: W_("p18", "leuchtet"),
  wA: r3(W_("p21", "a") - 0.05),
  wB: r3(W_("p22", "b") - 0.05),
  machst: W_("p23", "machst"),
};
for (const l of lines) EV[l.id] = C0(l.id);
const STK = { dur: DUR, ev: EV, disp };

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
const NO_CAPS = new Set(["p16", "p24"]);
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
const E0 = C0("p24");
const overlay = page(
  "overlay",
  `    <div id="vig"></div>
    <svg id="grain" viewBox="0 0 540 960" preserveAspectRatio="none"><filter id="gn"><feTurbulence id="gn-t" type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="1"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.2 -0.35"/></filter><rect width="540" height="960" filter="url(#gn)"/></svg>
    <div id="endbg"></div>
    <div id="rw"><div class="bars"></div><div class="sym">◀◀</div><div class="lbl">ZURÜCKSPULEN</div></div>
    <div id="chip"><span class="dot"></span>STOCKWERK 13 · TEIL 2</div>
    <div id="brA" class="branch a"><span>A</span>BLEIBEN</div>
    <div id="brB" class="branch b"><span>B</span>AUSSTEIGEN</div>
    <div id="endcard">
      <div class="q">WAS MACHST DU?</div>
      <div class="opt a" id="optA"><div class="badge">A</div><div><div class="t">ZUM NOTAUSGANG RENNEN</div><div class="s">Durch den dunklen Gang</div></div></div>
      <div class="opt b" id="optB"><div class="badge">B</div><div><div class="t">ZURÜCKSCHREIBEN</div><div class="s">Antworte dir selbst</div></div></div>
      <div class="cta" id="cta">Schreib <b>A</b> oder <b>B</b> in die Kommentare <span id="arrow">↓</span></div>
      <div class="sub" id="sub">Die Mehrheit entscheidet Teil 3</div>
    </div>`,
  `#root { background: transparent; }
    #vig { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.78) 100%); }
    #grain { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.08; mix-blend-mode: screen; }
    #endbg { position: absolute; inset: 0; background: rgba(4,5,7,0.62); opacity: 0; }
    #chip { position: absolute; top: 210px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 14px;
      padding: 14px 28px; border-radius: 40px; background: rgba(8,9,12,0.72); border: 3px solid rgba(255,255,255,0.22);
      font-family: "Montserrat", sans-serif; font-weight: 800; font-size: 34px; letter-spacing: 3px; color: #E9ECF0; white-space: nowrap; }
    .branch { position: absolute; top: 300px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; opacity: 0;
      padding: 8px 22px 8px 8px; border-radius: 34px; background: rgba(8,9,12,0.72); font-family: "Montserrat", sans-serif; font-weight: 900;
      font-size: 30px; letter-spacing: 2px; color: #fff; white-space: nowrap; }
    .branch span { width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; }
    .branch.a { border: 3px solid ${P.cyan}; } .branch.a span { background: ${P.cyan}; color: #06121A; }
    .branch.b { border: 3px solid #FF4D4D; } .branch.b span { background: #FF4D4D; color: #1A0505; }
    #rw { position: absolute; inset: 0; opacity: 0; }
    #rw .bars { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0 3px, rgba(0,0,0,0) 3px 9px); }
    #rw .sym { position: absolute; top: 560px; left: 0; right: 0; text-align: center; font-family: "Montserrat", sans-serif; font-weight: 900;
      font-size: 190px; color: #fff; letter-spacing: -20px; text-shadow: 6px 0 0 rgba(255,40,40,0.7), -6px 0 0 rgba(60,200,255,0.7); }
    .lbl { position: absolute; top: 800px; left: 0; right: 0; text-align: center; font-family: "Montserrat", sans-serif; font-weight: 900;
      font-size: 56px; letter-spacing: 10px; color: #fff; }
    #chip .dot { width: 18px; height: 18px; border-radius: 50%; background: #FF2A2A; box-shadow: 0 0 14px #FF2A2A; }
    #endcard { position: absolute; inset: 0; opacity: 0; font-family: "Montserrat", sans-serif; color: #fff; }
    .opt .t { font-size: 52px !important; }
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
  `tl.set("#brA", { opacity: 1 }, 0); tl.set("#brA", { opacity: 0 }, ${C0("p2")}); tl.set("#brB", { opacity: 1 }, ${C0("p2")});
    tl.set("#brB", { opacity: 0 }, ${rw1}); tl.set("#brA", { opacity: 1 }, ${rw1}); tl.set("#brA", { opacity: 0 }, ${E0});
    tl.set("#chip", { opacity: 0 }, ${C0("p16")}); tl.set("#chip", { opacity: 1 }, ${C0("p17")});
    tl.set("#brA", { opacity: 0 }, ${C0("p16")}); tl.set("#brA", { opacity: 1 }, ${C0("p17")});
    ${Array.from({ length: Math.ceil((rw1 - rw0) / 0.12) }, (_, i) => `tl.set("#rw", { opacity: ${i % 3 === 2 ? 0.55 : 1} }, ${r3(rw0 + i * 0.12)});`).join(" ")}
    tl.set("#rw", { opacity: 0 }, ${rw1});
    const grainState = { s: 0 };
    tl.to(grainState, { s: ${Math.round(DUR * 12)}, duration: ${DUR}, ease: "none", onUpdate: () => document.getElementById("gn-t").setAttribute("seed", String(1 + Math.floor(grainState.s))) }, 0);
    tl.set("#endcard", { opacity: 1 }, ${E0});
    tl.fromTo("#endbg", { opacity: 0 }, { opacity: 1, duration: 0.4, immediateRender: false }, ${E0});
    tl.fromTo("#endcard .q", { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out", immediateRender: false }, ${E0});
    tl.fromTo("#optA", { opacity: 0, x: -120 }, { opacity: 1, x: 0, duration: 0.35, ease: "power3.out", immediateRender: false }, ${r3(E0 + 0.12)});
    tl.fromTo("#optB", { opacity: 0, x: 120 }, { opacity: 1, x: 0, duration: 0.35, ease: "power3.out", immediateRender: false }, ${r3(E0 + 0.24)});
    tl.fromTo("#cta", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out", immediateRender: false }, ${r3(W_("p24", "schreib") + 0.05)});
    tl.fromTo("#sub", { opacity: 0 }, { opacity: 1, duration: 0.3, immediateRender: false }, ${r3(LE("p24"))});
    tl.to("#arrow", { y: 14, duration: 0.25, ease: "power2.out" }, ${r3(LE("p24") + 0.3)});
    tl.to("#arrow", { y: 0, duration: 0.35, ease: "power2.in" }, ${r3(LE("p24") + 0.55)});
    tl.to("#arrow", { y: 14, duration: 0.25, ease: "power2.out" }, ${r3(LE("p24") + 1.5)});
    tl.to("#arrow", { y: 0, duration: 0.35, ease: "power2.in" }, ${r3(LE("p24") + 1.75)});`,
);

/* ================= Ton ================= */
const A = [];
const au = (id, src, start, vol, dur) =>
  A.push(
    `      <audio id="${id}" class="clip" src="assets/${src}" data-start="${r3(start)}"${dur ? ` data-duration="${r3(dur)}"` : ""} data-track-index="${20 + A.length}" data-volume="${vol}"></audio>`,
  );
au("bed-drone", "sfx/drone.mp3", 0, 0.55, DUR);
au("sfx-boom0", "sfx/gen-boom.mp3", 0, 0.6);
au("sfx-herz0", "sfx/herz.mp3", 0, 0.35, C0("p4"));
au("sfx-schritte", "sfx/schritte.mp3", W_("p2", "denn"), 0.5, passiert - W_("p2", "denn"));
au("sfx-licht-aus", "sfx/glitch.mp3", passiert - 0.12, 0.6);
au("sfx-stich", "sfx/stich.mp3", passiert - 0.04, 0.9);
au("sfx-rewind", "sfx/gen-rewind.mp3", rw0, 0.7);
au("sfx-rewind2", "sfx/gen-rewind.mp3", rw0 + 0.8, 0.6);
au("sfx-glitch-rw", "sfx/glitch.mp3", rw1 - 0.1, 0.45);
EV.presses.forEach((p, i) => au(`sfx-klick${i}`, "sfx/klick.mp3", p, 0.8));
au("sfx-herz1", "sfx/herz.mp3", C0("p5"), 0.55, EV.eg - C0("p5"));
au("sfx-lauf", "sfx/lauf.mp3", run - 0.1, 0.75, closeT - run + 0.1);
au("sfx-tuerzu", "sfx/tuer.mp3", C0("p7"), 0.7);
au("sfx-zu", "sfx/knall.mp3", closeT, 0.55);
au("sfx-schlag", "sfx/knall.mp3", schlag, 1.0);
au("sfx-schlag2", "sfx/gen-boom.mp3", schlag, 0.6);
au("sfx-motor", "sfx/motor.mp3", fahrt - 0.15, 0.32, EV.stehen - fahrt + 0.15);
au("sfx-start", "sfx/ruck.mp3", fahrt - 0.1, 0.35);
disp
  .filter(([tt]) => tt > fahrt && tt < m13)
  .forEach(([tt, lab], i) =>
    au(`sfx-tick${i}`, "sfx/tick.mp3", tt - 0.02, lab === "EG" ? 0 : 0.22),
  );
au("sfx-ding-eg", "sfx/ding.mp3", EV.eg, 0.45);
au("sfx-riser13", "sfx/gen-riser.mp3", m13 - 1.2, 0.4);
au("sfx-ding13", "sfx/ding-low.mp3", m13, 0.6);
au("sfx-boom13", "sfx/gen-boom.mp3", m13, 0.7);
au("sfx-stop", "sfx/ruck.mp3", EV.stehen, 0.8);
au("sfx-vib", "sfx/vibration.mp3", EV.vib - 0.1, 0.8);
au("sfx-msg", "sfx/nachricht.mp3", EV.msg, 0.5);
au("sfx-tuerauf", "sfx/tuer.mp3", C0("p17") + 0.05, 0.6);
au("sfx-tropfen", "sfx/tropfen.mp3", C0("p17"), 0.55, DUR - C0("p17"));
au("sfx-neon", "sfx/neon.mp3", C0("p18"), 0.12, DUR - C0("p18"));
au("sfx-herz2", "sfx/herz.mp3", C0("p19"), 0.6, DUR - C0("p19"));
au("sfx-tipp", "sfx/klick.mp3", C0("p19") + 0.3, 0.25);
au("sfx-pop-a", "sfx/klick.mp3", EV.wA, 0.5);
au("sfx-pop-b", "sfx/klick.mp3", EV.wB, 0.5);
au("sfx-riser-end", "sfx/gen-riser.mp3", C0("p23") - 0.3, 0.3);
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
    <title>Stockwerk 13 · Teil 2</title>
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
            <rect x="70" y="365" width="520" height="110" rx="55" fill="#0B1218" stroke="${P.cyan}" stroke-width="6"/>
            <circle cx="128" cy="420" r="38" fill="${P.cyan}"/>
            <text x="128" y="437" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="50" fill="#06121A">A</text>
            <text x="184" y="440" font-family="Montserrat" font-weight="900" font-size="50" fill="#fff">NOTAUSGANG</text>
          </g>
        </g>
        <g id="callB" style="opacity:0">
          <path id="callB-line" d="M 540 420 L 540 760" stroke="#FF4D4D" stroke-width="6" fill="none"/>
          <circle id="callB-dot" cx="540" cy="800" r="40" fill="none" stroke="#FF4D4D" stroke-width="6"/>
          <g id="callB-pill">
            <rect x="330" y="505" width="640" height="110" rx="55" fill="#180B0B" stroke="#FF4D4D" stroke-width="6"/>
            <circle cx="388" cy="560" r="38" fill="#FF4D4D"/>
            <text x="388" y="577" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="50" fill="#1A0505">B</text>
            <text x="444" y="579" font-family="Montserrat" font-weight="900" font-size="48" fill="#fff">ZURÜCKSCHREIBEN</text>
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
