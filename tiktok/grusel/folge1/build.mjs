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
const P = {
  ink: "#0E1116",
  body: "#D9DCE0",
  bodyShade: "#A9AFB7",
  steel: "#5B646F",
  steelDark: "#2E343C",
  steelHi: "#8C96A1",
  amber: "#FFB23E",
  red: "#FF2A2A",
  sodium: "#E9B65C",
  paper: "#E8E2D1",
  cyan: "#4FD1FF",
};

/* ================= Figur (Gliederpuppe) ================= */
// Ursprung: Mitte zwischen den Füßen. Kopf bei (0,-900). front/back.
function limb(x1, y1, x2, y2, w, col = P.body) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${P.ink}" stroke-width="${w + 12}" stroke-linecap="round"/>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
}
function joint(x, y, r, col = P.bodyShade) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" stroke="${P.ink}" stroke-width="6"/>`;
}
function figure(id, { view = "front", body = P.body, shade = P.bodyShade, dark = false } = {}) {
  const b = dark ? "#07080A" : body;
  const s = dark ? "#07080A" : shade;
  const ol = dark ? "#000" : P.ink;
  const leg = (side) => {
    const x = side * 52;
    return `<g id="${id}-leg${side < 0 ? "L" : "R"}">
      ${limb(x, -430, x + side * 4, -225, 58, b)}${joint(x + side * 4, -225, 30, s)}
      ${limb(x + side * 4, -225, x + side * 6, -40, 50, b)}
      <ellipse cx="${x + side * 14}" cy="-22" rx="46" ry="24" fill="${s}" stroke="${ol}" stroke-width="6"/></g>`;
  };
  const arm = (side) => {
    const x = side * 138;
    return `<g id="${id}-arm${side < 0 ? "L" : "R"}">
      ${joint(x, -742, 34, s)}
      ${limb(x, -742, x + side * 18, -575, 50, b)}${joint(x + side * 18, -575, 26, s)}
      ${limb(x + side * 18, -575, x + side * 22, -420, 44, b)}
      <ellipse cx="${x + side * 22}" cy="-382" rx="30" ry="40" fill="${b}" stroke="${ol}" stroke-width="6"/></g>`;
  };
  const torso = `<path d="M -128 -770 Q 0 -800 128 -770 Q 140 -700 112 -640 Q 82 -575 72 -540 L -72 -540 Q -82 -575 -112 -640 Q -140 -700 -128 -770 Z" fill="${b}" stroke="${ol}" stroke-width="7"/>
    ${dark ? "" : `<path d="M 60 -760 Q 110 -720 92 -630" stroke="${s}" stroke-width="16" fill="none" stroke-linecap="round" opacity="0.7"/>`}
    <ellipse cx="0" cy="-525" rx="58" ry="30" fill="${s}" stroke="${ol}" stroke-width="6"/>
    <path d="M -100 -505 Q 0 -530 100 -505 Q 112 -440 92 -415 L -92 -415 Q -112 -440 -100 -505 Z" fill="${b}" stroke="${ol}" stroke-width="7"/>`;
  const head = `<rect x="-26" y="-812" width="52" height="56" fill="${s}" stroke="${ol}" stroke-width="6"/>
    <ellipse id="${id}-head" cx="0" cy="-905" rx="102" ry="120" fill="${b}" stroke="${ol}" stroke-width="7"/>
    ${dark ? "" : `<ellipse cx="-38" cy="-975" rx="28" ry="16" fill="#fff" opacity="0.45"/><path d="M 70 -960 Q 95 -900 70 -830" stroke="${s}" stroke-width="16" fill="none" stroke-linecap="round" opacity="0.6"/>`}`;
  const face =
    view === "front" && !dark
      ? `<g id="${id}-face">
      <g id="${id}-eyes">
        <circle id="${id}-eL" cx="-40" cy="-905" r="27" fill="#F2F3F5" stroke="${P.ink}" stroke-width="8"/>
        <circle id="${id}-eR" cx="40" cy="-905" r="27" fill="#F2F3F5" stroke="${P.ink}" stroke-width="8"/>
        <g id="${id}-pupils"><circle id="${id}-pL" cx="-40" cy="-905" r="9" fill="${P.ink}"/><circle id="${id}-pR" cx="40" cy="-905" r="9" fill="${P.ink}"/></g>
      </g>
      <g class="${id}-x" data-x="neutral">
        <path d="M -66 -952 L -18 -950 M 18 -950 L 66 -952" stroke="${P.ink}" stroke-width="9" stroke-linecap="round"/>
        <path d="M -16 -842 L 16 -842" stroke="${P.ink}" stroke-width="8" stroke-linecap="round"/>
      </g>
      <g class="${id}-x" data-x="worried" opacity="0">
        <path d="M -68 -948 L -20 -962 M 20 -962 L 68 -948" stroke="${P.ink}" stroke-width="9" stroke-linecap="round"/>
        <path d="M -22 -836 Q 0 -852 22 -836" stroke="${P.ink}" stroke-width="8" fill="none" stroke-linecap="round"/>
      </g>
      <g class="${id}-x" data-x="shock" opacity="0">
        <path d="M -70 -968 Q -44 -984 -18 -972 M 18 -972 Q 44 -984 70 -968" stroke="${P.ink}" stroke-width="9" fill="none" stroke-linecap="round"/>
        <ellipse cx="0" cy="-838" rx="13" ry="17" fill="${P.ink}"/>
      </g>
      <path id="${id}-sweat" d="M 92 -955 Q 104 -930 98 -918 Q 90 -906 82 -918 Q 78 -930 92 -955 Z" fill="#CFE6FF" stroke="${P.ink}" stroke-width="5" opacity="0"/>
    </g>`
      : "";
  // Rückansicht: Arme hinter? Nein: bei "back" liegen die Arme vor dem Rumpf außen,
  // die Reihenfolge bleibt gleich, nur ohne Gesicht.
  return `<g id="${id}">${leg(-1)}${leg(1)}${arm(-1)}${arm(1)}<g>${torso}</g>${head}${face}</g>`;
}

/* ================= 7-Segment ================= */
function digitSVG(d, x, y, w, h, on, off, glowId) {
  const k = 26; // Stärke
  const segs = {
    a: `M ${x + k} ${y} L ${x + w - k} ${y} L ${x + w - k * 1.6} ${y + k} L ${x + k * 1.6} ${y + k} Z`,
    b: `M ${x + w} ${y + k} L ${x + w} ${y + h / 2 - k / 2} L ${x + w - k} ${y + h / 2 - k} L ${x + w - k} ${y + k * 1.6} Z`,
    c: `M ${x + w} ${y + h / 2 + k / 2} L ${x + w} ${y + h - k} L ${x + w - k} ${y + h - k * 1.6} L ${x + w - k} ${y + h / 2 + k} Z`,
    d: `M ${x + k} ${y + h} L ${x + w - k} ${y + h} L ${x + w - k * 1.6} ${y + h - k} L ${x + k * 1.6} ${y + h - k} Z`,
    e: `M ${x} ${y + h / 2 + k / 2} L ${x} ${y + h - k} L ${x + k} ${y + h - k * 1.6} L ${x + k} ${y + h / 2 + k} Z`,
    f: `M ${x} ${y + k} L ${x} ${y + h / 2 - k / 2} L ${x + k} ${y + h / 2 - k} L ${x + k} ${y + k * 1.6} Z`,
    g: `M ${x + k} ${y + h / 2} L ${x + k * 1.6} ${y + h / 2 - k / 2} L ${x + w - k * 1.6} ${y + h / 2 - k / 2} L ${x + w - k} ${y + h / 2} L ${x + w - k * 1.6} ${y + h / 2 + k / 2} L ${x + k * 1.6} ${y + h / 2 + k / 2} Z`,
  };
  const map = {
    0: "abcdef",
    1: "bc",
    2: "abdeg",
    3: "abcdg",
    4: "bcfg",
    5: "acdfg",
    6: "acdefg",
    7: "abc",
    8: "abcdefg",
    9: "abcdfg",
  };
  const lit = d === null ? "" : map[d];
  return Object.entries(segs)
    .map(([s, p]) =>
      lit.includes(s)
        ? `<path d="${p}" fill="${on}" filter="url(#${glowId})"/>`
        : `<path d="${p}" fill="${off}"/>`,
    )
    .join("");
}
function numSVG(n, cx, cy, col, offCol, glowId) {
  const w = 170;
  const h = 300;
  const gap = 46;
  const s = String(n).padStart(2, " ");
  const x0 = cx - w - gap / 2;
  const x1 = cx + gap / 2;
  const d0 = s[0] === " " ? null : +s[0];
  return (
    digitSVG(d0, x0, cy - h / 2, w, h, col, offCol, glowId) +
    digitSVG(+s[1], x1, cy - h / 2, w, h, col, offCol, glowId)
  );
}

/* ================= Gemeinsame Defs ================= */
const DEFS = `<defs>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="glowS" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>
  <linearGradient id="steelV" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3B434C"/><stop offset="0.45" stop-color="#6D7783"/><stop offset="0.55" stop-color="#5F6873"/><stop offset="1" stop-color="#343B43"/></linearGradient>
  <linearGradient id="steelD" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4A535D"/><stop offset="1" stop-color="#232930"/></linearGradient>
  <linearGradient id="wallFlur" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2A2114"/><stop offset="1" stop-color="#6A5432"/></linearGradient>
  <linearGradient id="wallFlurR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#2A2114"/><stop offset="1" stop-color="#6A5432"/></linearGradient>
  <radialGradient id="doorLight" cx="0.5" cy="0.55" r="0.6"><stop offset="0" stop-color="#FFF1C9"/><stop offset="0.6" stop-color="#F5C46E"/><stop offset="1" stop-color="#B57A2C"/></radialGradient>
  <radialGradient id="pool" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#FFD58A" stop-opacity="0.55"/><stop offset="1" stop-color="#FFD58A" stop-opacity="0"/></radialGradient>
  <radialGradient id="vig" cx="0.5" cy="0.45" r="0.75"><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.85"/></radialGradient>
  <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#172338"/><stop offset="1" stop-color="#0A0F18"/></linearGradient>
</defs>`;
const svg = (body, extra = "") =>
  `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" ${extra}>${body}</svg>`;

/* ================= Flur (Zentralperspektive) ================= */
const VP = { x: 540, y: 905 };
const END = { l: 405, r: 675, t: 770, b: 1060 }; // Stirnwand
function flur(p, { silhouette = true } = {}) {
  const lerp = (a, b, z) => a + (b - a) * z;
  let stripes = "";
  for (let i = 0; i < 26; i++) {
    const z = 1 - 1 / (1 + i * 0.22);
    const xl = lerp(0, END.l, z);
    const xr = lerp(W, END.r, z);
    stripes += `<line x1="${xl}" y1="${lerp(0, END.t, z)}" x2="${xl}" y2="${lerp(H, END.b, z)}" stroke="#000" stroke-opacity="0.18" stroke-width="${10 * (1 - z) + 2}"/>`;
    stripes += `<line x1="${xr}" y1="${lerp(0, END.t, z)}" x2="${xr}" y2="${lerp(H, END.b, z)}" stroke="#000" stroke-opacity="0.18" stroke-width="${10 * (1 - z) + 2}"/>`;
  }
  // Seitentüren (offen, dunkel) links und rechts
  let doors = "";
  const pairs = [
    [0.3, 0.42],
    [0.58, 0.66],
    [0.74, 0.79],
  ];
  for (const [z1, z2] of pairs) {
    for (const side of [-1, 1]) {
      const X = (z) => (side < 0 ? lerp(0, END.l, z) : lerp(W, END.r, z));
      const top = (z) => lerp(0, END.t, z) + (lerp(H, END.b, z) - lerp(0, END.t, z)) * 0.3;
      const bot = (z) => lerp(H, END.b, z);
      doors += `<path d="M ${X(z1)} ${top(z1)} L ${X(z2)} ${top(z2)} L ${X(z2)} ${bot(z2)} L ${X(z1)} ${bot(z1)} Z" fill="#050403" stroke="#1B140B" stroke-width="${8 * (1 - z1) + 2}"/>`;
      // offenes Türblatt in den Flur hinein
      const zx = z1 - (z2 - z1) * 0.55;
      doors += `<path d="M ${X(z1)} ${top(z1)} L ${X(zx) + side * -60 * (1 - z1)} ${top(zx) - 10} L ${X(zx) + side * -60 * (1 - z1)} ${bot(zx) + 10} L ${X(z1)} ${bot(z1)} Z" fill="#4A3820" stroke="#1B140B" stroke-width="4" opacity="0.95"/>`;
    }
  }
  // Deckenlampen
  let lamps = "";
  for (const z of [0.12, 0.42, 0.64, 0.78]) {
    const y = lerp(0, END.t, z) + 6;
    const w = 150 * (1 - z) + 18;
    lamps += `<ellipse cx="${VP.x}" cy="${y + 20 * (1 - z)}" rx="${w}" ry="${w * 0.18}" fill="#FFE7B0" filter="url(#glowS)"/>
      <ellipse cx="${VP.x}" cy="${lerp(H, END.b, z) - 40}" rx="${w * 2.6}" ry="${w * 0.7}" fill="url(#pool)"/>`;
  }
  return `<g id="${p}">
    <rect width="${W}" height="${H}" fill="#120D07"/>
    <path d="M 0 0 L ${END.l} ${END.t} L ${END.l} ${END.b} L 0 ${H} Z" fill="url(#wallFlur)"/>
    <path d="M ${W} 0 L ${END.r} ${END.t} L ${END.r} ${END.b} L ${W} ${H} Z" fill="url(#wallFlurR)"/>
    <path d="M 0 0 L ${W} 0 L ${END.r} ${END.t} L ${END.l} ${END.t} Z" fill="#1A140C"/>
    <path d="M 0 ${H} L ${W} ${H} L ${END.r} ${END.b} L ${END.l} ${END.b} Z" fill="#2B1A12"/>
    <path d="M 300 ${H} L 780 ${H} L ${VP.x + 50} ${END.b} L ${VP.x - 50} ${END.b} Z" fill="#4A1E18" opacity="0.85"/>
    ${stripes}
    <path d="M 0 ${H * 0.62} L ${END.l} ${END.t + (END.b - END.t) * 0.62} M ${W} ${H * 0.62} L ${END.r} ${END.t + (END.b - END.t) * 0.62}" stroke="#2A1C0E" stroke-width="10" opacity="0.6"/>
    ${doors}
    <rect x="${END.l}" y="${END.t}" width="${END.r - END.l}" height="${END.b - END.t}" fill="#5A4628"/>
    <g id="${p}-end">
      <rect x="472" y="842" width="136" height="218" fill="url(#doorLight)"/>
      <path id="${p}-spill" d="M 472 1060 L 608 1060 L 760 ${H} L 320 ${H} Z" fill="#FFD58A" opacity="0.10"/>
      ${
        silhouette
          ? `<g id="${p}-sil" opacity="0" transform="translate(540 1058) scale(0.19)">${figure(p + "-silf", { dark: true })}
          <g id="${p}-silEyes" opacity="0"><ellipse cx="-38" cy="-905" rx="20" ry="16" fill="#F4F7FF" filter="url(#glowS)"/><ellipse cx="38" cy="-905" rx="20" ry="16" fill="#F4F7FF" filter="url(#glowS)"/></g></g>`
          : ""
      }
      <path id="${p}-leaf" d="M 472 842 L 520 852 L 520 1052 L 472 1060 Z" fill="#3B2A16" stroke="#120C05" stroke-width="3"/>
      <rect x="466" y="836" width="148" height="226" fill="none" stroke="#1F160B" stroke-width="10"/>
    </g>
    ${lamps}
    <rect width="${W}" height="${H}" fill="url(#vig)"/>
  </g>`;
}

/* ================= Shots ================= */
const shots = {};

// 1) Anzeige (Etagenanzeige, Nahaufnahme)
{
  let nums = "";
  for (let n = 4; n <= 12; n++)
    nums += `<g class="num" id="num-${n}" opacity="0">${numSVG(n, 540, 830, P.amber, "#140C05", "glow")}</g>`;
  nums += `<g class="num" id="num-13" opacity="0">${numSVG(13, 540, 830, P.red, "#160505", "glow")}</g>`;
  shots.anzeige = svg(`${DEFS}
    <rect width="${W}" height="${H}" fill="url(#steelD)"/>
    ${Array.from({ length: 60 }, (_, i) => `<line x1="0" y1="${i * 33}" x2="${W}" y2="${i * 33 + 6}" stroke="#fff" stroke-opacity="0.025" stroke-width="2"/>`).join("")}
    <rect x="120" y="520" width="840" height="620" rx="26" fill="#1A1E23" stroke="#11151A" stroke-width="10"/>
    <rect x="160" y="560" width="760" height="540" rx="12" fill="#070505"/>
    <g id="anz-arrow" opacity="0.9"><path d="M 220 700 L 270 630 L 320 700 Z" fill="${P.amber}" filter="url(#glowS)"/></g>
    <g id="anz-arrow13" opacity="0"><path d="M 220 700 L 270 630 L 320 700 Z" fill="${P.red}" filter="url(#glowS)"/></g>
    <g id="anz-nums" transform="translate(40 0)">${nums}</g>
    <rect id="anz-flash" x="160" y="560" width="760" height="540" fill="${P.red}" opacity="0"/>
    <text x="540" y="1250" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="40" letter-spacing="14" fill="#8E98A3" opacity="0.7">ETAGE</text>
    ${[
      [170, 470],
      [910, 470],
      [170, 1190],
      [910, 1190],
    ]
      .map(
        ([x, y]) =>
          `<circle cx="${x}" cy="${y}" r="16" fill="#252B32" stroke="#11151A" stroke-width="5"/><path d="M ${x - 9} ${y} L ${x + 9} ${y}" stroke="#11151A" stroke-width="5"/>`,
      )
      .join("")}
    <rect id="anz-red" width="${W}" height="${H}" fill="#3A0000" opacity="0"/>
    <rect width="${W}" height="${H}" fill="url(#vig)"/>`);
}

// 2) Lobby (Erdgeschoss, Figur geht zum Aufzug)
shots.lobby = svg(`${DEFS}
  <rect width="${W}" height="${H}" fill="#10151C"/>
  ${Array.from({ length: 22 }, (_, i) => `<line x1="0" y1="${120 + i * 66}" x2="${W}" y2="${120 + i * 66}" stroke="#000" stroke-opacity="0.25" stroke-width="3"/>`).join("")}
  ${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 98}" y1="0" x2="${i * 98}" y2="1520" stroke="#000" stroke-opacity="0.15" stroke-width="3"/>`).join("")}
  <path d="M 0 1520 L ${W} 1520 L ${W} ${H} L 0 ${H} Z" fill="#0A0C0F"/>
  <path d="M 300 1520 L 780 1520 L 900 ${H} L 180 ${H} Z" fill="#9AA6B3" opacity="0.06"/>
  <g id="lob-lamp"><rect x="380" y="150" width="320" height="26" rx="8" fill="#DDEBFF" filter="url(#glowS)"/><ellipse cx="540" cy="420" rx="520" ry="300" fill="#BFD4FF" opacity="0.06"/></g>
  <rect x="280" y="560" width="520" height="970" fill="#1E242B" stroke="#0B0E12" stroke-width="10"/>
  <rect x="300" y="590" width="240" height="930" fill="url(#steelV)"/>
  <rect x="540" y="590" width="240" height="930" fill="url(#steelV)"/>
  <line x1="540" y1="590" x2="540" y2="1520" stroke="#15191E" stroke-width="6"/>
  <rect x="460" y="465" width="160" height="72" rx="8" fill="#070505" stroke="#11151A" stroke-width="5"/>
  <text x="540" y="519" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="48" fill="${P.amber}" filter="url(#glowS)">EG</text>
  <rect x="850" y="960" width="70" height="140" rx="10" fill="#2A3038" stroke="#0B0E12" stroke-width="5"/>
  <circle cx="885" cy="1030" r="20" fill="${P.amber}" filter="url(#glowS)"/>
  <rect x="110" y="300" width="230" height="110" rx="10" fill="#070505" stroke="#1E242B" stroke-width="6"/>
  <text x="225" y="378" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="64" fill="${P.red}" filter="url(#glowS)" letter-spacing="4">02:07</text>
  <g id="lob-fig" transform="translate(-260 1830) scale(1.08)">${figure("lf", { view: "back" })}</g>
  <rect id="lob-dark" width="${W}" height="${H}" fill="#000" opacity="0"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>`);

// 3) Kabine (von vorn, Figur schaut zum Bedienfeld)
shots.kabine = svg(`${DEFS}
  <rect width="${W}" height="${H}" fill="#14181D"/>
  <path d="M 0 0 L ${W} 0 L 930 250 L 150 250 Z" fill="#0F1216"/>
  <rect id="kab-light" x="330" y="70" width="420" height="80" rx="12" fill="#E8F0FF" filter="url(#glowS)"/>
  <rect x="150" y="250" width="780" height="1350" fill="url(#steelV)"/>
  <line x1="410" y1="250" x2="410" y2="1600" stroke="#2A3037" stroke-width="6"/>
  <line x1="670" y1="250" x2="670" y2="1600" stroke="#2A3037" stroke-width="6"/>
  <rect x="150" y="1060" width="780" height="22" rx="10" fill="#9EA8B3" stroke="#20262D" stroke-width="5"/>
  <path d="M 0 0 L 150 250 L 150 1600 L 0 ${H} Z" fill="#363D45"/>
  <path d="M ${W} 0 L 930 250 L 930 1600 L ${W} ${H} Z" fill="#30373F"/>
  <path d="M 958 800 L 1050 770 L 1050 1170 L 958 1150 Z" fill="#20262D" stroke="#11151A" stroke-width="5"/>
  ${Array.from({ length: 7 }, (_, i) => `<circle cx="985" cy="${1110 - i * 45}" r="9" fill="#8E98A3"/><circle cx="1022" cy="${1105 - i * 47}" r="9" fill="#8E98A3"/>`).join("")}
  <circle id="kab-btn7" cx="985" cy="${1110 - 4 * 45}" r="11" fill="${P.amber}" filter="url(#glowS)" opacity="0"/>
  <path d="M 150 1600 L 930 1600 L ${W} ${H} L 0 ${H} Z" fill="#1C2026"/>
  ${Array.from({ length: 6 }, (_, i) => `<line x1="${150 + i * 156}" y1="1600" x2="${(i * W) / 5}" y2="${H}" stroke="#000" stroke-opacity="0.35" stroke-width="4"/>`).join("")}
  <g id="kab-fig" transform="translate(540 1760) scale(1.0)">${figure("kf")}</g>
  <rect id="kab-tint" width="${W}" height="${H}" fill="#5A0000" opacity="0" style="mix-blend-mode:multiply"/>
  <rect id="kab-red" width="${W}" height="${H}" fill="#FF1010" opacity="0"/>
  <rect id="kab-dark" width="${W}" height="${H}" fill="#000" opacity="0"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>`);

// 4) Knöpfe (Bedienfeld-Nahaufnahme + Zettel)
{
  const BX = [330, 560];
  const BY = (row) => 1600 - row * 172;
  const btn = (label, x, y, id) => `<g id="${id}">
    <circle cx="${x}" cy="${y}" r="64" fill="#1B1F24" stroke="#0E1115" stroke-width="6"/>
    <circle cx="${x}" cy="${y}" r="50" fill="#AEB6BF"/><circle cx="${x - 10}" cy="${y - 12}" r="30" fill="#A9B2BC" opacity="0.6"/>
    <circle id="${id}-ring" cx="${x}" cy="${y}" r="57" fill="none" stroke="${P.amber}" stroke-width="9" opacity="0" filter="url(#glowS)"/>
    <text x="${x}" y="${y + 16}" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="${label.length > 1 ? 40 : 46}" fill="#0B0E12">${label}</text></g>`;
  let btns = btn("EG", 445, BY(0), "b-eg");
  for (let n = 1; n <= 12; n++) {
    const row = Math.ceil(n / 2);
    btns += btn(String(n), BX[(n + 1) % 2], BY(row), "b-" + n);
  }
  const noteLines = Array.from(
    { length: 7 },
    (_, i) =>
      `<rect x="${730}" y="${905 + i * 34}" width="${[230, 250, 190, 240, 210, 120, 0][i]}" height="12" rx="4" fill="#3A3428" opacity="0.55"/>`,
  ).join("");
  shots.knoepfe = svg(`${DEFS}
    <rect width="${W}" height="${H}" fill="url(#steelD)"/>
    ${Array.from({ length: 70 }, (_, i) => `<line x1="0" y1="${i * 28}" x2="${W}" y2="${i * 28 + 5}" stroke="#fff" stroke-opacity="0.025" stroke-width="2"/>`).join("")}
    <rect x="200" y="260" width="490" height="1480" rx="24" fill="#2F363E" stroke="#151A1F" stroke-width="8"/>
    <rect x="235" y="300" width="420" height="120" rx="10" fill="#0A0A0A"/>
    <text x="445" y="385" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="64" fill="${P.amber}" opacity="0.85" filter="url(#glowS)" id="knp-disp">7</text>
    <g opacity="0.5"><circle cx="400" cy="${BY(7)}" r="10" fill="#151A1F"/><circle cx="490" cy="${BY(7)}" r="10" fill="#151A1F"/></g>
    ${btns}
    <g id="note" transform="rotate(-4 860 1000)">
      <path d="M 700 790 L 1020 790 L 1020 1150 L 990 1162 L 960 1146 L 930 1166 L 896 1150 L 860 1170 L 826 1148 L 790 1166 L 754 1150 L 722 1164 L 700 1150 Z" fill="${P.paper}" stroke="#9C9480" stroke-width="3"/>
      <text x="735" y="860" font-family="Montserrat" font-weight="900" font-size="34" fill="#B3121B">WICHTIG!</text>
      <rect x="735" y="872" width="160" height="5" fill="#B3121B"/>
      ${noteLines}
      <rect x="690" y="772" width="90" height="34" fill="#F3EFD8" opacity="0.6" transform="rotate(-18 735 789)"/>
      <rect x="950" y="772" width="90" height="34" fill="#F3EFD8" opacity="0.6" transform="rotate(16 995 789)"/>
    </g>
    <g id="hand" transform="translate(1300 1900)">
      ${limb(0, 0, 230, 260, 120, P.body)}
      <ellipse cx="-10" cy="-8" rx="70" ry="58" fill="${P.body}" stroke="${P.ink}" stroke-width="7"/>
      ${limb(-40, -30, -96, -84, 34, P.body)}
    </g>
    <rect id="knp-tint" width="${W}" height="${H}" fill="#5A0000" opacity="0" style="mix-blend-mode:multiply"/>
    <rect width="${W}" height="${H}" fill="url(#vig)"/>`);
}

// 5) Handy
shots.handy = svg(`${DEFS}
  <rect width="${W}" height="${H}" fill="#0B0E12"/>
  <ellipse cx="540" cy="960" rx="600" ry="800" fill="#1F2833" opacity="0.6" filter="url(#soft)"/>
  <g id="phone" transform="translate(0 0)">
    <rect x="270" y="380" width="540" height="1120" rx="70" fill="#07080A" stroke="#2C323A" stroke-width="8"/>
    <rect x="292" y="402" width="496" height="1076" rx="54" fill="url(#screen)"/>
    <rect x="490" y="420" width="100" height="26" rx="13" fill="#000"/>
    <text x="330" y="490" font-family="Montserrat" font-weight="700" font-size="30" fill="#C9D3E0">02:07</text>
    <g id="ph-bars" opacity="0.6"><rect x="640" y="474" width="8" height="12" fill="#C9D3E0"/><rect x="652" y="468" width="8" height="18" fill="#556070"/><rect x="664" y="462" width="8" height="24" fill="#556070"/><path d="M 636 492 L 676 456" stroke="#FF4D4D" stroke-width="4"/></g>
    <g id="ph-batt"><rect x="700" y="466" width="56" height="26" rx="6" fill="none" stroke="#C9D3E0" stroke-width="3"/><rect x="758" y="474" width="5" height="10" fill="#C9D3E0"/><rect x="704" y="470" width="6" height="18" fill="#FF3B3B"/></g>
    <text x="540" y="760" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="190" fill="#EEF3FA" letter-spacing="-4">02:07</text>
    <text x="540" y="830" text-anchor="middle" font-family="Montserrat" font-weight="600" font-size="38" fill="#9FB0C5">Sonntag, 3. November</text>
    <g id="ph-low">
      <rect x="370" y="960" width="340" height="150" rx="24" fill="#1A1416" stroke="#FF3B3B" stroke-width="4"/>
      <rect x="400" y="1000" width="110" height="64" rx="10" fill="none" stroke="#FF3B3B" stroke-width="6"/><rect x="512" y="1018" width="10" height="28" fill="#FF3B3B"/><rect x="408" y="1008" width="12" height="48" fill="#FF3B3B"/>
      <text x="625" y="1056" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="64" fill="#FF3B3B">3 %</text>
    </g>
    <g id="ph-netz" opacity="0">
      <text x="540" y="1220" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="64" fill="#FF4D4D">Kein Netz</text>
      <text x="540" y="1276" text-anchor="middle" font-family="Montserrat" font-weight="600" font-size="34" fill="#8796AA">Nur Notrufe</text>
    </g>
  </g>
  <g id="ph-hand">
    <ellipse cx="282" cy="1150" rx="46" ry="110" fill="${P.body}" stroke="${P.ink}" stroke-width="7"/>
    <ellipse cx="798" cy="1060" rx="40" ry="70" fill="${P.body}" stroke="${P.ink}" stroke-width="7"/>
    <ellipse cx="800" cy="1210" rx="40" ry="70" fill="${P.body}" stroke="${P.ink}" stroke-width="7"/>
    ${limb(540, 1640, 540, 2100, 330, P.body)}
    <path d="M 300 1480 Q 540 1580 780 1480 L 780 1560 Q 540 1700 300 1560 Z" fill="${P.body}" stroke="${P.ink}" stroke-width="7"/>
  </g>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>`);

// 6) Gesicht (Nahaufnahme, verschiedene Lichtstimmungen)
shots.gesicht = svg(`${DEFS}
  <rect id="ges-bg-kab" width="${W}" height="${H}" fill="#2B323A"/>
  <rect id="ges-bg-flur" width="${W}" height="${H}" fill="#3A2A14" opacity="0"/>
  <rect id="ges-bg-red" width="${W}" height="${H}" fill="#2A0707" opacity="0"/>
  <g opacity="0.5">${Array.from({ length: 4 }, (_, i) => `<line x1="${120 + i * 280}" y1="0" x2="${120 + i * 280}" y2="${H}" stroke="#000" stroke-opacity="0.35" stroke-width="8"/>`).join("")}</g>
  <g id="ges-fig" transform="translate(540 3240) scale(2.6)">${figure("gf")}</g>
  <rect id="ges-warm" width="${W}" height="${H}" fill="#FFB347" opacity="0" style="mix-blend-mode:soft-light"/>
  <rect id="ges-tint" width="${W}" height="${H}" fill="#7A0000" opacity="0" style="mix-blend-mode:multiply"/>
  <rect id="ges-dark" width="${W}" height="${H}" fill="#000" opacity="0"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>`);

// 7) Zettel (Nahaufnahme, Text tippt mit)
{
  const rows = [
    ["Hält", "der", "Aufzug", "im"],
    ["13.", "Stock,", "bleib"],
    ["auf", "keinen", "Fall"],
  ];
  const keys = [
    ["hält", "der", "aufzug", "im"],
    ["dreizehnten", "stock", "bleib"],
    ["auf", "keinen", "fall"],
  ];
  let txt = "";
  rows.forEach((r, ri) => {
    let x = 170;
    r.forEach((w, wi) => {
      txt += `<text class="zw" data-key="${keys[ri][wi]}" id="zw-${ri}-${wi}" x="${x}" y="${820 + ri * 130}" font-family="Space Mono" font-weight="400" font-size="68" fill="#1E1A14" opacity="0">${w}</text>`;
      x += w.length * 41 + 41;
    });
  });
  const torn =
    "M 110 360 L 980 340 L 990 1200 L 950 1226 L 905 1196 L 860 1236 L 812 1204 L 770 1240 L 720 1206 L 668 1238 L 622 1200 L 570 1232 L 520 1198 L 470 1240 L 420 1206 L 372 1234 L 322 1200 L 270 1236 L 220 1204 L 170 1232 L 120 1210 Z";
  shots.zettel = svg(`${DEFS}
    <rect width="${W}" height="${H}" fill="url(#steelD)"/>
    <rect width="${W}" height="${H}" fill="#3A0000" opacity="0.35"/>
    <clipPath id="zclip"><path d="${torn}"/></clipPath>
    <g transform="rotate(-2 540 800)">
      <path d="${torn}" fill="${P.paper}" stroke="#8F8670" stroke-width="4"/>
      ${Array.from({ length: 24 }, (_, i) => `<line x1="110" y1="${400 + i * 36}" x2="990" y2="${396 + i * 36}" stroke="#8F8670" stroke-opacity="0.12" stroke-width="2"/>`).join("")}
      <text x="170" y="500" font-family="Montserrat" font-weight="900" font-size="50" fill="#B3121B" letter-spacing="2">HINWEIS DER</text>
      <text x="170" y="562" font-family="Montserrat" font-weight="900" font-size="50" fill="#B3121B" letter-spacing="2">HAUSVERWALTUNG</text>
      <rect x="170" y="590" width="560" height="8" fill="#B3121B"/>
      ${txt}
      <g clip-path="url(#zclip)"><text x="170" y="1262" font-family="Space Mono" font-weight="400" font-size="68" fill="#1E1A14">dl4bt3!f lk</text></g>
      <rect x="80" y="320" width="200" height="66" fill="#F3EFD8" opacity="0.55" transform="rotate(-14 180 353)"/>
      <rect x="820" y="310" width="200" height="66" fill="#F3EFD8" opacity="0.55" transform="rotate(12 920 343)"/>
    </g>
    <rect id="zet-flick" width="${W}" height="${H}" fill="#000" opacity="0"/>
    <rect width="${W}" height="${H}" fill="url(#vig)"/>`);
}

// 8) Türen: Blick aus der Kabine (Figur von hinten), Türen öffnen/schließen, Flur dahinter
const DOOR = { l: 190, r: 890, t: 330, b: 1580 };
shots.tueren = svg(`${DEFS}
  <rect width="${W}" height="${H}" fill="#0C0F13"/>
  <clipPath id="dclip"><rect x="${DOOR.l}" y="${DOOR.t}" width="${DOOR.r - DOOR.l}" height="${DOOR.b - DOOR.t}"/></clipPath>
  <g clip-path="url(#dclip)">
    <svg x="${DOOR.l}" y="${DOOR.t}" width="${DOOR.r - DOOR.l}" height="${DOOR.b - DOOR.t}" viewBox="${540 - 470} ${905 - 840} 940 1680" preserveAspectRatio="xMidYMid slice">${flur("tf")}</svg>
    <rect id="tue-lightIn" x="${DOOR.l}" y="${DOOR.t}" width="${DOOR.r - DOOR.l}" height="${DOOR.b - DOOR.t}" fill="#000" opacity="0"/>
    <g id="leafL"><rect x="${DOOR.l}" y="${DOOR.t}" width="${(DOOR.r - DOOR.l) / 2}" height="${DOOR.b - DOOR.t}" fill="url(#steelV)"/><line x1="${DOOR.l + (DOOR.r - DOOR.l) / 2 - 3}" y1="${DOOR.t}" x2="${DOOR.l + (DOOR.r - DOOR.l) / 2 - 3}" y2="${DOOR.b}" stroke="#15191E" stroke-width="6"/><rect x="${DOOR.l + (DOOR.r - DOOR.l) / 2 - 10}" y="${DOOR.t}" width="10" height="${DOOR.b - DOOR.t}" fill="#FFD58A" opacity="0.8"/></g>
    <g id="leafR"><rect x="${DOOR.l + (DOOR.r - DOOR.l) / 2}" y="${DOOR.t}" width="${(DOOR.r - DOOR.l) / 2}" height="${DOOR.b - DOOR.t}" fill="url(#steelV)"/><rect x="${DOOR.l + (DOOR.r - DOOR.l) / 2}" y="${DOOR.t}" width="10" height="${DOOR.b - DOOR.t}" fill="#FFD58A" opacity="0.8"/></g>
  </g>
  <rect x="${DOOR.l - 20}" y="${DOOR.t - 20}" width="${DOOR.r - DOOR.l + 40}" height="${DOOR.b - DOOR.t + 40}" fill="none" stroke="#2A3038" stroke-width="40"/>
  <path d="M 0 0 L ${W} 0 L ${W} 180 L 0 180 Z" fill="#090B0E"/>
  <path d="M 0 180 L ${DOOR.l - 40} 290 L ${DOOR.l - 40} 1620 L 0 ${H} Z" fill="#2B3138"/>
  <path d="M ${W} 180 L ${DOOR.r + 40} 290 L ${DOOR.r + 40} 1620 L ${W} ${H} Z" fill="#262C33"/>
  <path d="M ${DOOR.r + 60} 900 L 1060 860 L 1060 1340 L ${DOOR.r + 60} 1300 Z" fill="#1A1F25" stroke="#0E1115" stroke-width="5"/>
  ${Array.from({ length: 6 }, (_, i) => `<circle cx="${DOOR.r + 100}" cy="${1240 - i * 62}" r="13" fill="#7E8892"/><circle cx="${DOOR.r + 150}" cy="${1234 - i * 64}" r="13" fill="#7E8892"/>`).join("")}
  <circle id="tue-eg" cx="${DOOR.r + 125}" cy="1290" r="17" fill="#7E8892"/>
  <circle id="tue-egLit" cx="${DOOR.r + 125}" cy="1290" r="20" fill="${P.cyan}" filter="url(#glow)" opacity="0"/>
  <path d="M 0 1620 L ${W} 1620 L ${W} ${H} L 0 ${H} Z" fill="#14171B"/>
  <path id="tue-spill" d="M ${DOOR.l} 1600 L ${DOOR.r} 1600 L ${W} ${H} L 0 ${H} Z" fill="#FFCF7A" opacity="0"/>
  <g id="tue-fig" transform="translate(250 2190) scale(1.45)">${figure("tb", { view: "back" })}</g>
  <rect id="tue-tint" width="${W}" height="${H}" fill="#5A0000" opacity="0" style="mix-blend-mode:multiply"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  <g id="callA" opacity="0">
    <path id="callA-line" d="M 700 1505 L ${DOOR.r + 110} 1505 L ${DOOR.r + 125} 1310" stroke="${P.cyan}" stroke-width="6" fill="none"/>
    <circle cx="${DOOR.r + 125}" cy="1290" r="34" fill="none" stroke="${P.cyan}" stroke-width="6"/>
    <rect x="300" y="1450" width="400" height="110" rx="55" fill="#0B1218" stroke="${P.cyan}" stroke-width="6"/>
    <circle cx="358" cy="1505" r="38" fill="${P.cyan}"/>
    <text x="358" y="1522" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="50" fill="#06121A">A</text>
    <text x="414" y="1525" font-family="Montserrat" font-weight="900" font-size="54" fill="#fff">BLEIBEN</text>
  </g>
  <g id="callB" opacity="0">
    <path id="callB-line" d="M 300 420 L 540 420 L 540 760" stroke="#FF4D4D" stroke-width="6" fill="none"/>
    <circle cx="540" cy="800" r="40" fill="none" stroke="#FF4D4D" stroke-width="6"/>
    <rect x="70" y="365" width="470" height="110" rx="55" fill="#180B0B" stroke="#FF4D4D" stroke-width="6"/>
    <circle cx="128" cy="420" r="38" fill="#FF4D4D"/>
    <text x="128" y="437" text-anchor="middle" font-family="Montserrat" font-weight="900" font-size="50" fill="#1A0505">B</text>
    <text x="184" y="440" font-family="Montserrat" font-weight="900" font-size="54" fill="#fff">AUSSTEIGEN</text>
  </g>`);

// 9) Flur (Vollbild)
shots.flur = svg(`${DEFS}${flur("ff")}`);

// 10) Schatten in der Wohnungstür
shots.schatten = svg(`${DEFS}
  <rect width="${W}" height="${H}" fill="#2A1F10"/>
  ${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 96}" y1="0" x2="${i * 96}" y2="${H}" stroke="#000" stroke-opacity="0.2" stroke-width="10"/>`).join("")}
  <path d="M 0 1650 L ${W} 1650 L ${W} ${H} L 0 ${H} Z" fill="#1D120B"/>
  <rect x="250" y="300" width="580" height="1350" fill="url(#doorLight)"/>
  <rect id="sch-flick" x="250" y="300" width="580" height="1350" fill="#000" opacity="0"/>
  <path d="M 250 1650 L 830 1650 L 1080 ${H} L 0 ${H} Z" fill="#FFD58A" opacity="0.28"/>
  <g id="sch-sil" transform="translate(540 1652) scale(1.22)">
    <g id="sch-silBody" transform="rotate(-4 0 -900)">${figure("sf", { dark: true })}</g>
    <g id="sch-face" opacity="0" transform="rotate(-4 0 -900)">
      <ellipse cx="-40" cy="-912" rx="22" ry="17" fill="#F7FAFF" filter="url(#glow)"/>
      <ellipse cx="40" cy="-912" rx="22" ry="17" fill="#F7FAFF" filter="url(#glow)"/>
      <path d="M -62 -858 Q 0 -812 62 -858 L 52 -846 L 40 -860 L 28 -840 L 14 -858 L 0 -836 L -14 -858 L -28 -840 L -40 -860 L -52 -846 Z" fill="#F7FAFF" filter="url(#glowS)"/>
    </g>
  </g>
  <path d="M 250 300 L 120 250 L 120 1720 L 250 1650 Z" fill="#3B2A16" stroke="#120C05" stroke-width="6"/>
  <rect x="236" y="286" width="608" height="1378" fill="none" stroke="#1F160B" stroke-width="28"/>
  <rect id="sch-red" width="${W}" height="${H}" fill="#FF0000" opacity="0" style="mix-blend-mode:multiply"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>`);

// 11) Endkarte
shots.ende = svg(`${DEFS}
  <rect width="${W}" height="${H}" fill="#07090C"/>
  <rect x="0" y="0" width="520" height="${H}" fill="url(#steelV)" opacity="0.35"/>
  <rect x="560" y="0" width="520" height="${H}" fill="url(#steelV)" opacity="0.35"/>
  <rect id="end-gap" x="520" y="0" width="40" height="${H}" fill="#FFCF7A" opacity="0.55" filter="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="#000" opacity="0.55"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>`);

/* ================= Film-Timeline ================= */
const CUTS = [];
const cut = (shot, a, b, cam = {}) => CUTS.push({ shot, a: r3(a), b: r3(b), cam });
const T_TEASE = 1.3;
cut("anzeige", 0, T_TEASE, { from: [1.12, 0, 0], to: [1.0, 0, 0] });
cut("lobby", T_TEASE, C0("n2"), { from: [1.0, 0, 0], to: [1.06, 0, -20] });
cut("kabine", C0("n2"), W_("n2", "drückst") - 0.05, { from: [1.08, 0, 0], to: [1.14, 0, -10] });
cut("knoepfe", W_("n2", "drückst") - 0.05, C0("n3"), {
  from: [1.5, 230, -40],
  to: [1.62, 250, -60],
});
cut("handy", C0("n3"), C0("n4"), { from: [1.0, 0, 0], to: [1.08, 0, -30] });
cut("kabine", C0("n4"), C0("n5"), { from: [1.0, 0, 40], to: [1.1, 0, 20] });
cut("anzeige", C0("n5"), C0("n6"), { from: [1.0, 0, 0], to: [1.06, 0, 0] });
cut("gesicht", C0("n6"), C0("n7"), { from: [1.0, 0, 0], to: [1.1, 0, 40] });
cut("anzeige", C0("n7"), C0("n8"), { from: [1.06, 0, 0], to: [1.16, 0, 0] });
cut("knoepfe", C0("n8"), C0("n9"), { from: [1.45, 120, -330], to: [1.45, 120, 620] });
cut("anzeige", C0("n9"), C0("n10"), { from: [1.2, 0, 0], to: [1.2, 0, 0] });
cut("kabine", C0("n10"), C0("n11"), { from: [1.12, 0, 0], to: [1.12, 0, 0] });
cut("knoepfe", C0("n11"), C0("n12"), { from: [1.0, 0, 0], to: [1.9, -600, -60] });
cut("zettel", C0("n12"), C0("n14"), { from: [1.0, 0, 120], to: [1.0, 0, 120] });
cut("tueren", C0("n14"), C0("n15"), { from: [1.0, 0, 0], to: [1.05, 0, 0] });
cut("flur", C0("n15"), C0("n17"), { from: [1.0, 0, 0], to: [1.0, 0, 0] });
cut("gesicht", C0("n17"), C0("n18"), { from: [1.08, 0, 30], to: [1.22, 0, 80] });
cut("schatten", C0("n18"), C0("n19"), { from: [1.04, 0, 60], to: [1.04, 0, 60] });
cut("tueren", C0("n19"), C0("n23"), { from: [1.05, 0, 0], to: [1.05, 0, 0] });
cut("gesicht", C0("n23"), C0("n24"), { from: [1.18, 0, 60], to: [1.3, 0, 110] });
cut("ende", C0("n24"), DUR, { from: [1.0, 0, 0], to: [1.0, 0, 0] });

const js = [];
const J = (s) => js.push(s);
const T = (x) => r3(x);
for (const c of CUTS) {
  J(`cut("${c.shot}", ${c.a}, ${c.b}, [${c.cam.from}], [${c.cam.to}]);`);
}

/* ---- Anzeige ---- */
J(`num(13, 0); flick13(0.02); flick13(0.55);`);
J(
  `tl.set("#anz-red", {opacity: 0.25}, 0); tl.set("#anz-arrow", {opacity: 0}, 0); tl.set("#anz-arrow13", {opacity: 1}, 0);`,
);
J(
  `tl.set("#anz-red", {opacity: 0}, ${T_TEASE}); tl.set("#anz-arrow", {opacity: 0.9}, ${T_TEASE}); tl.set("#anz-arrow13", {opacity: 0}, ${T_TEASE});`,
);
J(`num(4, ${T_TEASE});`);
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
for (const [id, w, n] of floors) J(`num(${n}, ${T(W_(id, w) - 0.04)});`);
const T13 = T(W_("n9", "dreizehn") - 0.03);
J(
  `tl.set("#num-12", {opacity: 0.25}, ${T(LS("n9") + 0.5)}); tl.set("#num-12", {opacity: 1}, ${T(LS("n9") + 0.6)}); tl.set("#num-12", {opacity: 0}, ${T(T13 - 0.35)});`,
);
J(
  `num(13, ${T13}); tl.set("#anz-arrow", {opacity: 0}, ${T13}); tl.set("#anz-arrow13", {opacity: 1}, ${T13});`,
);
J(
  `tl.fromTo("#anz-flash", {opacity: 0.85}, {opacity: 0, duration: 0.5, ease: "power2.out", immediateRender: false}, ${T13});`,
);
J(`tl.set("#anz-red", {opacity: 0.25}, ${T13}); punch("#cam-anzeige", ${T13}, 1.2, 1.38);`);

/* ---- Lobby ---- */
const lobA = T_TEASE;
const lobB = C0("n2");
J(
  `tl.fromTo("#lob-fig", {x: -260}, {x: 540, duration: ${T(lobB - lobA - 0.4)}, ease: "power1.out", immediateRender: false}, ${lobA});`,
);
J(`walk("lf", ${lobA}, ${T(lobB - 0.4)});`);
J(`flicker("#lob-lamp", ${T(lobA + 1.1)});`);

/* ---- Kabine ---- */
J(`look("kf", 12, 2, ${C0("n2")}, 0.2); expr("kf", "neutral", 0);`);
J(`tl.set("#kab-btn7", {opacity: 1}, ${W_("n2", "sieben")});`);
// n4: Aufzug fährt los, leichter Ruck
J(`shake("#kab-shakeWrap", ${T(W_("n4", "fährt"))}, 0.35, 8);`);
J(`look("kf", 0, -8, ${T(W_("n4", "fährt"))}, 0.3); expr("kf", "neutral", ${C0("n4")});`);
// n10: Ruck + Flackern, danach Notlicht rot
J(
  `shake("#kab-shakeWrap", ${T(W_("n10", "ruck") - 0.05)}, 0.6, 26); expr("kf", "shock", ${T(W_("n10", "ruck"))}); look("kf", 0, -6, ${T(W_("n10", "ruck"))}, 0.1);`,
);
const fl = W_("n10", "flackert");
J(
  `[0, 0.09, 0.2, 0.26, 0.42, 0.5, 0.71].forEach((d, i) => tl.set("#kab-dark", {opacity: i % 2 ? 0 : 0.92}, ${T(fl - 0.1)} + d)); tl.set("#kab-dark", {opacity: 0}, ${T(fl + 0.8)});`,
);
J(
  `tl.set("#kab-light", {opacity: 0.15}, ${T(fl + 0.8)}); tl.set("#kab-tint", {opacity: 0.85}, ${T(fl + 0.8)}); tl.set("#kab-red", {opacity: 0.08}, ${T(fl + 0.8)});`,
);
J(
  `tl.set("#kab-tint", {opacity: 0.85}, ${C0("n10")}); tl.set("#kab-light", {opacity: 0.5}, ${C0("n10")});`,
);
J(
  `tl.set("#kab-tint", {opacity: 0}, ${C0("n4")}); tl.set("#kab-light", {opacity: 1}, ${C0("n4")});`,
);

/* ---- Knöpfe ---- */
const press = W_("n2", "sieben");
J(`tl.set("#hand", {x: 1300, y: 1900}, ${T(W_("n2", "drückst") - 0.05)});`);
J(
  `tl.to("#hand", {x: 410, y: ${1600 - 4 * 172 + 100}, duration: 0.32, ease: "power3.out"}, ${T(W_("n2", "drückst"))});`,
);
J(
  `tl.to("#hand", {x: 398, y: ${1600 - 4 * 172 + 92}, duration: 0.08, ease: "power2.in"}, ${T(press - 0.04)});`,
);
J(`tl.set("#b-7-ring", {opacity: 1}, ${T(press + 0.04)});`);
J(`tl.to("#hand", {x: 900, y: 1700, duration: 0.4, ease: "power2.in"}, ${T(press + 0.35)});`);
J(`tl.set("#hand", {x: 1300, y: 1900}, ${C0("n8")});`);
// n8: Kamera fährt die Knopfreihen hoch bis zur leeren Stelle, 12 blinkt
J(
  `tl.set("#b-12-ring", {opacity: 0, stroke: "#FFFFFF"}, 0); tl.to("#b-12-ring", {opacity: 1, duration: 0.12}, ${T(W_("n8", "zwölf"))}); tl.to("#b-12-ring", {opacity: 0, duration: 0.3}, ${T(W_("n8", "zwölf") + 0.45)});`,
);
J(
  `tl.set("#knp-tint", {opacity: 0.85}, ${C0("n11")}); tl.set("#knp-disp", {textContent: "13", fill: "${P.red}"}, ${T13});`,
);

/* ---- Handy ---- */
J(
  `tl.fromTo("#phone", {y: 520, rotation: 6, transformOrigin: "540px 960px"}, {y: 0, rotation: -2, duration: 0.45, ease: "power3.out", immediateRender: false}, ${C0("n3")});`,
);
J(
  `tl.fromTo("#ph-hand", {y: 520}, {y: 0, duration: 0.45, ease: "power3.out", immediateRender: false}, ${C0("n3")});`,
);
J(
  `[0, 0.25, 0.5, 0.75].forEach((d, i) => tl.set("#ph-low", {opacity: i % 2 ? 1 : 0.35}, ${T(W_("n3", "akku"))} + d));`,
);
J(
  `tl.set("#ph-netz", {opacity: 1}, ${T(W_("n3", "kein") - 0.05)}); tl.fromTo("#ph-netz", {scale: 0.85, transformOrigin: "540px 1240px"}, {scale: 1, duration: 0.18, ease: "back.out(3)", immediateRender: false}, ${T(W_("n3", "kein") - 0.05)});`,
);

/* ---- Gesicht ---- */
J(
  `expr("gf", "worried", ${C0("n6")}); look("gf", 0, -12, ${C0("n6")}, 0.01); tl.set("#gf-sweat", {opacity: 0}, ${C0("n6")});`,
);
J(
  `tl.fromTo("#gf-sweat", {opacity: 1, y: -10}, {y: 26, duration: 1.2, ease: "power1.in", immediateRender: false}, ${T(W_("n6", "hält"))});`,
);
J(`light("kab", ${C0("n6")});`);
J(
  `light("flur", ${C0("n17")}); expr("gf", "worried", ${C0("n17")}); look("gf", 0, 0, ${C0("n17")}, 0.01); tl.set("#gf-sweat", {opacity: 0}, ${C0("n17")});`,
);
J(
  `expr("gf", "shock", ${T(W_("n17", "namen") - 0.05)}); tl.fromTo("#gf-pupils", {scale: 1, transformOrigin: "0px -905px"}, {scale: 0.55, duration: 0.25, immediateRender: false}, ${T(W_("n17", "namen") - 0.05)});`,
);
J(
  `light("red", ${C0("n23")}); expr("gf", "worried", ${C0("n23")}); tl.set("#gf-pupils", {scale: 1}, ${C0("n23")}); look("gf", 0, 4, ${C0("n23")}, 0.01); tl.set("#gf-sweat", {opacity: 1, y: -10}, ${C0("n23")}); tl.to("#gf-sweat", {y: 30, duration: 1.4, ease: "power1.in"}, ${T(C0("n23") + 0.2)});`,
);
J(`look("gf", -10, 2, ${T(W_("n23", "machst") - 0.2)}, 0.25);`);

/* ---- Zettel ---- */
// Wörter tippen synchron zur Erzählung
const zMap = [
  ["hält", "zw-0-0"],
  ["der", "zw-0-1"],
  ["aufzug", "zw-0-2"],
  ["im", "zw-0-3"],
  ["dreizehnten", "zw-1-0"],
  ["stock", "zw-1-1"],
  ["bleib", "zw-1-2"],
  ["auf", "zw-2-0"],
  ["keinen", "zw-2-1"],
  ["fall", "zw-2-2"],
];
for (const [w, el] of zMap) J(`tl.set("#${el}", {opacity: 1}, ${T(W_("n12", w) - 0.02)});`);
J(
  `tl.to("#cam-zettel", {y: -260, scale: 1.25, duration: 0.7, ease: "power2.inOut"}, ${T(C0("n13"))});`,
);
J(
  `tl.set("#zet-flick", {opacity: 0.6}, ${T(LE("n13") + 0.05)}); tl.set("#zet-flick", {opacity: 0}, ${T(LE("n13") + 0.12)});`,
);

/* ---- Türen / Wahl ---- */
const OPEN = (DOOR.r - DOOR.l) / 2 - 40;
J(`tl.set("#leafL", {x: 0}, ${C0("n14")}); tl.set("#leafR", {x: 0}, ${C0("n14")});`);
J(
  `tl.to("#leafL", {x: -${OPEN}, duration: 1.3, ease: "power2.inOut"}, ${T(C0("n14") + 0.15)}); tl.to("#leafR", {x: ${OPEN}, duration: 1.3, ease: "power2.inOut"}, ${T(C0("n14") + 0.15)});`,
);
J(
  `tl.fromTo("#tue-spill", {opacity: 0}, {opacity: 0.12, duration: 1.3, immediateRender: false}, ${T(C0("n14") + 0.15)});`,
);
J(`tl.set("#tue-tint", {opacity: 0.45}, ${C0("n14")});`);
// Schließen ab n19 bis zum Ende der Wahl (bleibt einen Spalt offen)
J(
  `tl.set("#leafL", {x: -${OPEN}}, ${C0("n19")}); tl.set("#leafR", {x: ${OPEN}}, ${C0("n19")}); tl.set("#tue-spill", {opacity: 0.12}, ${C0("n19")});`,
);
J(
  `tl.to("#leafL", {x: -${OPEN * 0.3}, duration: ${T(C0("n23") - C0("n19") - 0.2)}, ease: "power1.inOut"}, ${T(C0("n19") + 0.1)}); tl.to("#leafR", {x: ${OPEN * 0.3}, duration: ${T(C0("n23") - C0("n19") - 0.2)}, ease: "power1.inOut"}, ${T(C0("n19") + 0.1)});`,
);
J(
  `tl.set("#tf-sil", {opacity: 1}, ${C0("n19")}); tl.set("#tf-silEyes", {opacity: 1}, ${C0("n19")});`,
);
J(`tl.set("#callA", {opacity: 0}, ${C0("n19")}); tl.set("#callB", {opacity: 0}, ${C0("n19")});`);
J(
  `callout("#callA", ${T(W_("n21", "a") - 0.05)}); tl.set("#tue-egLit", {opacity: 1}, ${T(W_("n21", "erdgeschoss"))});`,
);
J(`callout("#callB", ${T(W_("n22", "b") - 0.05)});`);
J(`tl.set("#tue-egLit", {opacity: 0}, ${C0("n14")});`);

/* ---- Flur ---- */
J(`tl.set("#cam-flur", {scale: 1, transformOrigin: "540px 905px"}, ${C0("n15")});`);
J(
  `tl.to("#cam-flur", {scale: 1.25, duration: ${T(C0("n16") - C0("n15"))}, ease: "none"}, ${C0("n15")});`,
);
J(
  `tl.to("#cam-flur", {scale: 3.0, duration: ${T(LE("n16") - LS("n16"))}, ease: "power1.inOut"}, ${LS("n16")});`,
);
J(
  `tl.set("#ff-leaf", {scaleX: 1, transformOrigin: "472px 950px"}, 0); tl.to("#ff-leaf", {scaleX: 0.25, duration: 0.6, ease: "power2.out"}, ${T(W_("n16", "offen") - 0.3)});`,
);
J(`tl.to("#ff-spill", {opacity: 0.35, duration: 0.5}, ${T(W_("n16", "licht") - 0.3)});`);
J(
  `tl.set("#tf-leaf", {scaleX: 0.25, transformOrigin: "472px 950px"}, 0); tl.set("#tf-spill", {opacity: 0.35}, 0);`,
);

/* ---- Schatten ---- */
const ST = W_("n18", "stimme");
J(`tl.set("#sch-face", {opacity: 0}, ${C0("n18")});`);
J(
  `[0, 0.06, 0.14, 0.2].forEach((d, i) => tl.set("#sch-flick", {opacity: i % 2 ? 0 : 0.7}, ${T(ST - 0.25)} + d));`,
);
J(
  `tl.set("#sch-face", {opacity: 1}, ${T(ST - 0.02)}); punch("#cam-schatten", ${T(ST - 0.02)}, 1.04, 1.2); tl.set("#sch-red", {opacity: 0.35}, ${T(ST - 0.02)});`,
);
J(
  `tl.to("#sch-silBody", {rotation: 6, svgOrigin: "0 -900", duration: 0.5, ease: "power2.out"}, ${T(ST)}); tl.to("#sch-face", {rotation: 6, svgOrigin: "0 -900", duration: 0.5, ease: "power2.out"}, ${T(ST)});`,
);

/* ================= Runtime-Helfer im Film ================= */
const HELPERS = `
  function cut(id, a, b, f, to) {
    tl.set("#s-" + id, { opacity: 1 }, a);
    tl.set("#s-" + id, { opacity: 0 }, b);
    tl.set("#cam-" + id, { scale: f[0], x: f[1], y: f[2] }, a);
    if (f.join() !== to.join()) tl.to("#cam-" + id, { scale: to[0], x: to[1], y: to[2], duration: b - a, ease: "none" }, a);
  }
  function num(n, t) { tl.set(".num", { opacity: 0 }, t); tl.set("#num-" + n, { opacity: 1 }, t); }
  function flick13(t) { [0, 0.05, 0.11, 0.16].forEach((d, i) => tl.set("#num-13", { opacity: i % 2 ? 1 : 0.15 }, t + d)); }
  function punch(sel, t, from, to) {
    tl.to(sel, { scale: to, duration: 0.09, ease: "power3.out" }, t);
    tl.to(sel, { scale: from, duration: 0.5, ease: "power2.out" }, t + 0.09);
  }
  function shake(sel, t, d, amp) {
    const n = Math.round(d / 0.04);
    for (let i = 0; i < n; i++) {
      const k = 1 - i / n;
      const sx = ((i * 7919) % 13) / 6.5 - 1;
      const sy = ((i * 104729) % 11) / 5.5 - 1;
      tl.to(sel, { x: sx * amp * k, y: sy * amp * k, duration: 0.04, ease: "none" }, t + i * 0.04);
    }
    tl.to(sel, { x: 0, y: 0, duration: 0.06 }, t + n * 0.04);
  }
  function flicker(sel, t) { [0, 0.05, 0.12, 0.17, 0.3].forEach((d, i) => tl.set(sel, { opacity: i % 2 ? 1 : 0.2 }, t + d)); }
  function expr(p, name, t) {
    tl.set("." + p + "-x", { opacity: 0 }, t);
    tl.set("." + p + "-x[data-x=" + name + "]", { opacity: 1 }, t);
  }
  function look(p, dx, dy, t, d) { tl.to("#" + p + "-pupils", { x: dx, y: dy, duration: d, ease: "power2.out" }, t); }
  function walk(p, a, b) {
    const step = 0.42;
    let i = 0;
    for (let t = a; t < b - step / 2; t += step, i++) {
      const s = i % 2 ? 1 : -1;
      tl.to("#" + p + "-legL", { rotation: 9 * s, svgOrigin: "-52 -430", duration: step, ease: "sine.inOut" }, t);
      tl.to("#" + p + "-legR", { rotation: -9 * s, svgOrigin: "52 -430", duration: step, ease: "sine.inOut" }, t);
      tl.to("#" + p + "-armL", { rotation: -6 * s, svgOrigin: "-138 -742", duration: step, ease: "sine.inOut" }, t);
      tl.to("#" + p + "-armR", { rotation: 6 * s, svgOrigin: "138 -742", duration: step, ease: "sine.inOut" }, t);
    }
    ["legL", "legR", "armL", "armR"].forEach((k) => tl.to("#" + p + "-" + k, { rotation: 0, duration: 0.3, ease: "sine.out" }, b));
  }
  function light(k, t) {
    tl.set("#ges-bg-flur", { opacity: k === "flur" ? 1 : 0 }, t);
    tl.set("#ges-bg-red", { opacity: k === "red" ? 1 : 0 }, t);
    tl.set("#ges-warm", { opacity: k === "flur" ? 0.55 : 0 }, t);
    tl.set("#ges-tint", { opacity: k === "red" ? 0.7 : 0 }, t);
  }
  function callout(sel, t) {
    tl.fromTo(sel, { opacity: 0, scale: 0.9, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.22, ease: "back.out(2.5)", immediateRender: false }, t);
  }
`;

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

const ORDERED = [
  "lobby",
  "kabine",
  "knoepfe",
  "handy",
  "anzeige",
  "gesicht",
  "zettel",
  "tueren",
  "flur",
  "schatten",
  "ende",
];
const filmBody = ORDERED.map(
  (k) =>
    `    <div class="shot" id="s-${k}"><div class="cam" id="cam-${k}">${
      k === "kabine" ? `<div id="kab-shakeWrap" class="fill">${shots[k]}</div>` : shots[k]
    }</div></div>`,
).join("\n");
const grain = `    <svg id="grain" class="fill" viewBox="0 0 540 960" preserveAspectRatio="none"><filter id="gn"><feTurbulence id="gn-t" type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="1"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.2 -0.35"/></filter><rect width="540" height="960" filter="url(#gn)"/></svg>`;
const film = page(
  "film",
  `${filmBody}\n${grain}`,
  `.shot { position: absolute; inset: 0; opacity: 0; }
    .cam { position: absolute; inset: 0; transform-origin: 50% 50%; }
    .fill { position: absolute; inset: 0; }
    .shot svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    #grain { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.09; mix-blend-mode: screen; pointer-events: none; }`,
  `${HELPERS}
    const grainState = { s: 0 };
    tl.to(grainState, { s: ${Math.round(DUR * 12)}, duration: ${DUR}, ease: "none", onUpdate: () => document.getElementById("gn-t").setAttribute("seed", String(1 + Math.floor(grainState.s))) }, 0);
    ${js.join("\n    ")}`,
);

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
  `    <div id="chip"><span class="dot"></span>STOCKWERK 13 · TEIL 1</div>
    <div id="endcard">
      <div class="q">WAS MACHST DU?</div>
      <div class="opt a" id="optA"><div class="badge">A</div><div><div class="t">IM AUFZUG BLEIBEN</div><div class="s">Erdgeschoss drücken</div></div></div>
      <div class="opt b" id="optB"><div class="badge">B</div><div><div class="t">AUSSTEIGEN</div><div class="s">Zur Wohnung gehen</div></div></div>
      <div class="cta" id="cta">Schreib <b>A</b> oder <b>B</b> in die Kommentare <span id="arrow">↓</span></div>
      <div class="sub" id="sub">Die Mehrheit entscheidet Teil 2</div>
    </div>`,
  `#root { background: transparent; }
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
    tl.set("#endcard", { opacity: 1 }, ${E0});
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
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}">
${host("film", 1, "graphics", 1)}
${host("overlay", 2, "graphics", 3)}
${host("captions", 3, "captions", 4)}
${A.join("\n")}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;

mkdirSync(new URL("./compositions/", import.meta.url), { recursive: true });
const out = (f, s) => writeFileSync(new URL(f, import.meta.url), s);
out("./index.html", index);
out("./compositions/film.html", film);
out("./compositions/captions.html", captions);
out("./compositions/overlay.html", overlay);
console.log(
  `Dauer ${DUR}s · ${caps.length} Untertitel · ${CUTS.length} Schnitte · VO ${Object.keys(VO).length}/${lines.length}`,
);
