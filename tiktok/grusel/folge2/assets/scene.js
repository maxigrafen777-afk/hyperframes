// Stockwerk 13 · Teil 2 · 3D-Szene (Three.js). Jedes Bild ist eine reine Funktion von t.
// Zeiten (Wortanker der Erzählung) kommen aus window.__STK (build.mjs).
import * as THREE from "./three/three.module.min.js";

const STK = window.__STK;
const EV = STK.ev;
const DUR = STK.dur;
const W = 1080;
const H = 1920;
const FIG_S = 0.9;

/* ---------------- Mathe ---------------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const ramp = (t, a, b) => clamp((t - a) / (b - a));
const smooth = (u) => u * u * (3 - 2 * u);
const eOut = (u) => 1 - Math.pow(1 - u, 3);
const eInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const hash = (i) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
// glattes 1D-Rauschen für Kamerawackeln
const noise = (x) => {
  const i = Math.floor(x);
  const f = x - i;
  return lerp(hash(i), hash(i + 1), smooth(f)) * 2 - 1;
};
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lerpV = (a, b, u) => a.clone().lerp(b, u);

/* ---------------- Renderer ---------------- */
const canvas = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x040506);
const camera = new THREE.PerspectiveCamera(60, W / H, 0.02, 60);

/* ---------------- Texturen (Canvas, deterministisch) ---------------- */
function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  const api = {
    tex,
    ctx,
    c,
    key: null,
    draw(k, state) {
      if (k === api.key) return;
      api.key = k;
      ctx.clearRect(0, 0, w, h);
      draw(ctx, w, h, state);
      tex.needsUpdate = true;
    },
  };
  api.draw("init", undefined);
  return api;
}
const FONT = (w, s) => `${w} ${s}px Montserrat, sans-serif`;

// gebürsteter Stahl mit Paneelfugen
const brushed = canvasTex(
  512,
  512,
  (g, w, h) => {
    g.fillStyle = "#7d8792";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const y = hash(i) * h;
      g.strokeStyle = `rgba(${hash(i + 7) > 0.5 ? "255,255,255" : "0,0,0"},${0.03 + hash(i + 3) * 0.05})`;
      g.lineWidth = 1 + hash(i + 9) * 1.5;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y + (hash(i + 5) - 0.5) * 6);
      g.stroke();
    }
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(0, 0, 5, h);
    g.fillRect(w - 5, 0, 5, h);
  },
  { repeat: [3, 1] },
);
const tiles = canvasTex(
  512,
  512,
  (g, w, h) => {
    g.fillStyle = "#2b3138";
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 4; x++) {
        const v = 40 + hash(x * 9 + y * 31) * 14;
        g.fillStyle = `rgb(${v},${v + 6},${v + 12})`;
        g.fillRect(x * 128 + 3, y * 64 + 3, 122, 58);
      }
  },
  { repeat: [6, 4] },
);
const wallpaper = canvasTex(
  256,
  512,
  (g, w, h) => {
    g.fillStyle = "#8a6c3c";
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) {
      g.fillStyle = "#6f5530";
      g.fillRect(x, 0, 22, h);
      g.fillStyle = "rgba(255,230,170,0.08)";
      g.fillRect(x + 34, 0, 6, h);
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(30,18,6,${hash(i) * 0.12})`;
      g.fillRect(hash(i + 1) * w, hash(i + 2) * h, 3 + hash(i + 3) * 18, 3 + hash(i + 4) * 30);
    }
  },
  { repeat: [10, 1] },
);
const carpet = canvasTex(
  256,
  256,
  (g, w, h) => {
    g.fillStyle = "#5a1712";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#7a2a1c";
    g.lineWidth = 6;
    for (let i = 0; i < 4; i++) {
      g.strokeRect(20 + i * 6, 20 + i * 6, w - 40 - i * 12, h - 40 - i * 12);
    }
  },
  { repeat: [1, 14] },
);
const floorRubber = canvasTex(
  256,
  256,
  (g, w, h) => {
    g.fillStyle = "#1c1f23";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#2a2e33";
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        g.save();
        g.translate(x * 32 + 16, y * 32 + 16);
        g.rotate(((x + y) % 2 ? 1 : -1) * 0.8);
        g.fillRect(-9, -2.5, 18, 5);
        g.restore();
      }
  },
  { repeat: [3, 3] },
);

/* ---- 7-Segment-Anzeige ---- */
function seg7(g, d, x, y, w, h, on, off) {
  const k = w * 0.17;
  const P = {
    a: [
      [x + k, y],
      [x + w - k, y],
      [x + w - k * 1.6, y + k],
      [x + k * 1.6, y + k],
    ],
    b: [
      [x + w, y + k],
      [x + w, y + h / 2 - k / 2],
      [x + w - k, y + h / 2 - k],
      [x + w - k, y + k * 1.6],
    ],
    c: [
      [x + w, y + h / 2 + k / 2],
      [x + w, y + h - k],
      [x + w - k, y + h - k * 1.6],
      [x + w - k, y + h / 2 + k],
    ],
    d: [
      [x + k, y + h],
      [x + w - k, y + h],
      [x + w - k * 1.6, y + h - k],
      [x + k * 1.6, y + h - k],
    ],
    e: [
      [x, y + h / 2 + k / 2],
      [x, y + h - k],
      [x + k, y + h - k * 1.6],
      [x + k, y + h / 2 + k],
    ],
    f: [
      [x, y + k],
      [x, y + h / 2 - k / 2],
      [x + k, y + h / 2 - k],
      [x + k, y + k * 1.6],
    ],
    g: [
      [x + k, y + h / 2],
      [x + k * 1.6, y + h / 2 - k / 2],
      [x + w - k * 1.6, y + h / 2 - k / 2],
      [x + w - k, y + h / 2],
      [x + w - k * 1.6, y + h / 2 + k / 2],
      [x + k * 1.6, y + h / 2 + k / 2],
    ],
  };
  const map = [
    "abcdef",
    "bc",
    "abdeg",
    "abcdg",
    "bcfg",
    "acdfg",
    "acdefg",
    "abc",
    "abcdefg",
    "abcdfg",
  ];
  const lit = d === null ? "" : d === "-" ? "g" : map[d];
  for (const [s, pts] of Object.entries(P)) {
    g.beginPath();
    pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.closePath();
    if (lit.includes(s)) {
      g.shadowColor = on;
      g.shadowBlur = 26;
      g.fillStyle = on;
    } else {
      g.shadowBlur = 0;
      g.fillStyle = off;
    }
    g.fill();
  }
  g.shadowBlur = 0;
}
function drawDisplay(g, w, h, k = "EG") {
  // k: "EG" | "12" | "-3" | "-13" | null (aus)
  g.fillStyle = "#060404";
  g.fillRect(0, 0, w, h);
  if (k === null) return;
  const red = k === "13" || k === "-13";
  const down = String(k).startsWith("-") || k === "EG";
  const on = red ? "#ff2a2a" : "#ffb23e";
  const off = red ? "#1d0606" : "#170e05";
  g.fillStyle = on;
  g.shadowColor = on;
  g.shadowBlur = 20;
  g.beginPath();
  if (down) {
    g.moveTo(40, 92);
    g.lineTo(80, 150);
    g.lineTo(120, 92);
  } else {
    g.moveTo(40, 150);
    g.lineTo(80, 92);
    g.lineTo(120, 150);
  }
  g.fill();
  g.shadowBlur = 0;
  if (k === "EG") {
    g.font = FONT(900, 210);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = on;
    g.shadowBlur = 24;
    g.fillText("EG", w / 2 + 40, h / 2 + 10);
    g.shadowBlur = 0;
    return;
  }
  const str = String(k);
  const chars = str.length > 2 ? str.split("") : str.padStart(2, " ").split("");
  const n = chars.length;
  const dw = n === 3 ? 100 : 150;
  const dh = n === 3 ? 230 : 270;
  const gap = n === 3 ? 22 : 40;
  const x0 = n === 3 ? 150 : 160;
  chars.forEach((c, i) =>
    seg7(
      g,
      c === " " ? null : c === "-" ? "-" : +c,
      x0 + i * (dw + gap),
      (h - dh) / 2,
      dw,
      dh,
      on,
      off,
    ),
  );
}
const dispIn = canvasTex(512, 380, drawDisplay);
const dispOut = canvasTex(512, 380, drawDisplay);

/* ---- Bedienfeld ---- */
const PANEL = { w: 0.24, h: 0.62, cw: 256, ch: 660 };
const BTN = {};
{
  const rows = 7;
  const yOf = (r) => 600 - r * 74;
  BTN.EG = [128, yOf(0)];
  for (let n = 1; n <= 12; n++) BTN[n] = [n % 2 ? 82 : 174, yOf(Math.ceil(n / 2))];
  BTN.rows = rows;
}
const panelTex = canvasTex(PANEL.cw, PANEL.ch, (g, w, h, k) => {
  const st = k || { lit: [], red: false, top: "EG" };
  g.fillStyle = "#3a4149";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(255,255,255,${hash(i) * 0.04})`;
    g.fillRect(0, hash(i + 1) * h, w, 1);
  }
  g.fillStyle = "#08090a";
  g.fillRect(28, 20, w - 56, 62);
  g.font = FONT(900, 46);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = st.red ? "#ff2a2a" : "#ffb23e";
  g.shadowColor = g.fillStyle;
  g.shadowBlur = 14;
  g.fillText(st.top, w / 2, 53);
  g.shadowBlur = 0;
  // zwei Schraubenlöcher, wo die 13 wäre
  g.fillStyle = "#1b1f24";
  g.beginPath();
  g.arc(90, 600 - 7 * 74, 7, 0, 7);
  g.arc(166, 600 - 7 * 74, 7, 0, 7);
  g.fill();
  for (const key of ["EG", ...Array.from({ length: 12 }, (_, i) => i + 1)]) {
    const [x, y] = BTN[key];
    g.fillStyle = "#15181c";
    g.beginPath();
    g.arc(x, y, 31, 0, 7);
    g.fill();
    const lit = st.lit.includes(key);
    g.fillStyle = "#b9c1ca";
    g.beginPath();
    g.arc(x, y, 24, 0, 7);
    g.fill();
    if (lit) {
      g.strokeStyle = key === "EG" ? "#4fd1ff" : "#ffb23e";
      g.lineWidth = 6;
      g.shadowColor = g.strokeStyle;
      g.shadowBlur = 16;
      g.beginPath();
      g.arc(x, y, 28, 0, 7);
      g.stroke();
      g.shadowBlur = 0;
    }
    g.fillStyle = "#101317";
    g.font = FONT(800, String(key).length > 1 ? 20 : 24);
    g.fillText(String(key), x, y + 1);
  }
});

/* ---- Zettel ---- */
const NOTE = { w: 0.17, h: 0.22, cw: 680, ch: 880 };
const NOTE_WORDS = [
  ["Hält", "der", "Aufzug", "im"],
  ["13.", "Stock,", "bleib"],
  ["auf", "keinen", "Fall"],
];
const noteTex = canvasTex(NOTE.cw, NOTE.ch, (g, w, h, k) => {
  const shown = k || 0;
  const torn = [];
  for (let i = 0; i <= 18; i++) torn.push([(i / 18) * w, 720 + (i % 2 ? 26 : -8) + hash(i) * 22]);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(w, 0);
  torn
    .slice()
    .reverse()
    .forEach(([x, y]) => g.lineTo(x, y));
  g.closePath();
  g.fillStyle = "#e8e1cd";
  g.fill();
  g.save();
  g.clip();
  for (let i = 0; i < 24; i++) {
    g.fillStyle = "rgba(120,110,90,0.12)";
    g.fillRect(0, 120 + i * 34, w, 2);
  }
  g.fillStyle = "#b3121b";
  g.font = FONT(900, 46);
  g.textBaseline = "alphabetic";
  g.fillText("HINWEIS DER", 50, 100);
  g.fillText("HAUSVERWALTUNG", 50, 152);
  g.fillRect(50, 172, 470, 7);
  g.fillStyle = "#1e1a14";
  g.font = FONT(700, 58);
  let n = 0;
  NOTE_WORDS.forEach((row, ri) => {
    let x = 50;
    row.forEach((wd) => {
      if (n < shown) g.fillText(wd, x, 300 + ri * 110);
      x += g.measureText(wd + " ").width;
      n++;
    });
  });
  // abgerissene Oberkanten der nächsten Zeile
  g.restore();
  // Klebestreifen
  g.fillStyle = "rgba(245,240,215,0.6)";
  g.save();
  g.translate(60, 10);
  g.rotate(-0.3);
  g.fillRect(-60, -20, 150, 46);
  g.restore();
  g.save();
  g.translate(w - 60, 10);
  g.rotate(0.3);
  g.fillRect(-90, -20, 150, 46);
  g.restore();
});
noteTex.tex.premultiplyAlpha = false;

/* ---- Handy ---- */
const phoneTex = canvasTex(540, 1140, (g, w, h, k) => {
  const st = k || { mode: "lock", bubble: 0, typing: 0, dot: 0 };
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, "#14203a");
  grd.addColorStop(1, "#05080e");
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#000";
  g.beginPath();
  g.roundRect(w / 2 - 60, 22, 120, 34, 17);
  g.fill();
  g.fillStyle = "#c9d3e0";
  g.font = FONT(700, 30);
  g.textAlign = "left";
  g.fillText("02:13", 44, 52);
  g.fillStyle = "#ff3b3b";
  g.fillText("2 %", 410, 52);
  if (st.mode === "lock") {
    g.textAlign = "center";
    g.fillStyle = "#eef3fa";
    g.font = FONT(800, 170);
    g.fillText("02:13", w / 2, 330);
    // Benachrichtigung
    g.fillStyle = "rgba(235,240,248,0.92)";
    g.beginPath();
    g.roundRect(30, 470, w - 60, 190, 34);
    g.fill();
    g.fillStyle = "#c8ccd2";
    g.beginPath();
    g.arc(100, 565, 44, 0, 7);
    g.fill();
    g.fillStyle = "#2a2f36";
    g.font = FONT(900, 46);
    g.textAlign = "left";
    g.fillText("Ich", 170, 545);
    g.font = FONT(600, 30);
    g.fillStyle = "#4b525c";
    g.fillText("Diese Nummer · jetzt", 170, 590);
    g.fillText("Neue Nachricht", 170, 632);
    return;
  }
  // Chat
  g.fillStyle = "#0e1522";
  g.fillRect(0, 80, w, 120);
  g.fillStyle = "#c8ccd2";
  g.beginPath();
  g.arc(90, 140, 38, 0, 7);
  g.fill();
  g.fillStyle = "#eef3fa";
  g.font = FONT(900, 42);
  g.textAlign = "left";
  g.fillText("Ich", 150, 135);
  g.fillStyle = "#8796aa";
  g.font = FONT(600, 26);
  g.fillText("Diese Nummer", 150, 172);
  if (st.bubble) {
    g.fillStyle = "#26303f";
    g.beginPath();
    g.roundRect(30, 300, 420, 200, 34);
    g.fill();
    g.fillStyle = "#eef3fa";
    g.font = FONT(700, 46);
    g.fillText("Warum bist du", 62, 380);
    g.fillText("weggelaufen?", 62, 442);
  }
  if (st.typing) {
    g.fillStyle = "#26303f";
    g.beginPath();
    g.roundRect(30, 540, 190, 100, 50);
    g.fill();
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i === st.dot ? "#eef3fa" : "#6b778a";
      g.beginPath();
      g.arc(80 + i * 45, 590, 13, 0, 7);
      g.fill();
    }
  }
  g.fillStyle = "#121a28";
  g.fillRect(0, h - 130, w, 130);
  g.fillStyle = "#26303f";
  g.beginPath();
  g.roundRect(30, h - 105, w - 60, 76, 38);
  g.fill();
  g.fillStyle = "#6b778a";
  g.font = FONT(600, 30);
  g.fillText("Nachricht …", 64, h - 56);
});

/* ---- Lobby-Uhr ---- */
const clockTex = canvasTex(400, 160, (g, w, h) => {
  g.fillStyle = "#070505";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#ff2a2a";
  g.shadowColor = "#ff2a2a";
  g.shadowBlur = 18;
  g.font = FONT(900, 110);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("02:07", w / 2, h / 2 + 6);
});

/* ---------------- Materialien ---------------- */
const M = {
  metal: new THREE.MeshStandardMaterial({
    color: 0xaab3bd,
    metalness: 0.55,
    roughness: 0.42,
    map: brushed.tex,
  }),
  metalDark: new THREE.MeshStandardMaterial({ color: 0x4a525c, metalness: 0.6, roughness: 0.5 }),
  leaf: new THREE.MeshStandardMaterial({
    color: 0xb8c0c9,
    metalness: 0.6,
    roughness: 0.38,
    map: brushed.tex,
  }),
  rubber: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, map: floorRubber.tex }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.9 }),
  tiles: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, map: tiles.tex }),
  lobbyFloor: new THREE.MeshStandardMaterial({ color: 0x14171a, roughness: 0.35, metalness: 0.1 }),
  wallpaper: new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    map: wallpaper.tex,
  }),
  wainscot: new THREE.MeshStandardMaterial({ color: 0x3a2814, roughness: 0.7 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.6 }),
  carpet: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, map: carpet.tex }),
  void: new THREE.MeshBasicMaterial({ color: 0x020202 }),
  doorWood: new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.6 }),
  body: new THREE.MeshStandardMaterial({ color: 0xe4e6ea, roughness: 0.42, metalness: 0.0 }),
  joint: new THREE.MeshStandardMaterial({ color: 0xc3c8ce, roughness: 0.5 }),
  ink: new THREE.MeshBasicMaterial({ color: 0x101216 }),
  eyeWhite: new THREE.MeshStandardMaterial({ color: 0xf6f7f9, roughness: 0.3, emissive: 0x222222 }),
  sweat: new THREE.MeshStandardMaterial({
    color: 0xcfe6ff,
    roughness: 0.1,
    transparent: true,
    opacity: 0.85,
  }),
  shadowBody: new THREE.MeshBasicMaterial({ color: 0x010101 }),
  glow: new THREE.MeshBasicMaterial({ color: 0xf6f9ff }),
  doorLight: new THREE.MeshBasicMaterial({ color: 0xffd99a }),
  lampGlow: new THREE.MeshBasicMaterial({ color: 0xfff1cf }),
  ceilPanel: new THREE.MeshBasicMaterial({ color: 0xe8f0ff }),
  dispIn: new THREE.MeshBasicMaterial({ map: dispIn.tex }),
  dispOut: new THREE.MeshBasicMaterial({ map: dispOut.tex }),
  panel: new THREE.MeshStandardMaterial({
    map: panelTex.tex,
    emissiveMap: panelTex.tex,
    emissive: 0xffffff,
    emissiveIntensity: 0.25,
    roughness: 0.5,
    metalness: 0.3,
  }),
  note: new THREE.MeshStandardMaterial({
    map: noteTex.tex,
    transparent: true,
    alphaTest: 0.5,
    roughness: 0.9,
    side: THREE.DoubleSide,
  }),
  phoneBody: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.35, metalness: 0.4 }),
  phoneScreen: new THREE.MeshBasicMaterial({ map: phoneTex.tex }),
  clock: new THREE.MeshBasicMaterial({ map: clockTex.tex }),
  callBtn: new THREE.MeshBasicMaterial({ color: 0xffb23e }),
};

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function plane(w, h, mat, x, y, z, ry, parent) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/* ---------------- Figur (Gliederpuppe) ---------------- */
function makeFigure(dark = false) {
  const body = dark ? M.shadowBody : M.body;
  const joint = dark ? M.shadowBody : M.joint;
  const root = new THREE.Group();
  const mesh = (geo, mat, x, y, z, parent = root) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const hips = new THREE.Group();
  root.add(hips);
  const pelvis = mesh(new THREE.SphereGeometry(0.15, 24, 16), body, 0, 0.98, 0, hips);
  pelvis.scale.set(1.05, 0.62, 0.72);
  mesh(new THREE.SphereGeometry(0.075, 16, 12), joint, 0, 1.1, 0, hips);
  const chest = new THREE.Group();
  chest.position.set(0, 1.1, 0);
  hips.add(chest);
  const torso = mesh(new THREE.CapsuleGeometry(0.15, 0.2, 8, 20), body, 0, 0.22, 0, chest);
  torso.scale.set(1.18, 1, 0.72);
  mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 14), joint, 0, 0.47, 0, chest);
  const head = new THREE.Group();
  head.position.set(0, 0.5, 0);
  chest.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.155, 40, 30), body, 0, 0.16, 0, head);
  skull.scale.set(1, 1.12, 1);
  const arms = {};
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(0.215 * s, 0.37, 0);
    chest.add(sh);
    mesh(new THREE.SphereGeometry(0.06, 16, 12), joint, 0, 0, 0, sh);
    mesh(new THREE.CapsuleGeometry(0.045, 0.2, 6, 14), body, 0, -0.16, 0, sh);
    const el = new THREE.Group();
    el.position.set(0, -0.31, 0);
    sh.add(el);
    mesh(new THREE.SphereGeometry(0.045, 14, 10), joint, 0, 0, 0, el);
    mesh(new THREE.CapsuleGeometry(0.04, 0.2, 6, 14), body, 0, -0.15, 0, el);
    const hand = mesh(new THREE.SphereGeometry(0.05, 16, 12), body, 0, -0.32, 0, el);
    hand.scale.set(0.85, 1.25, 0.6);
    arms[s] = { sh, el };
  }
  const legs = {};
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.085 * s, 0.92, 0);
    hips.add(hip);
    mesh(new THREE.CapsuleGeometry(0.062, 0.3, 6, 14), body, 0, -0.22, 0, hip);
    const kn = new THREE.Group();
    kn.position.set(0, -0.44, 0);
    hip.add(kn);
    mesh(new THREE.SphereGeometry(0.055, 14, 10), joint, 0, 0, 0, kn);
    mesh(new THREE.CapsuleGeometry(0.05, 0.3, 6, 14), body, 0, -0.21, 0, kn);
    const foot = mesh(new THREE.SphereGeometry(0.07, 14, 10), body, 0, -0.44, 0.04, kn);
    foot.scale.set(0.9, 0.45, 1.5);
    legs[s] = { hip, kn };
  }
  const face = new THREE.Group();
  face.position.set(0, 0.16, 0);
  head.add(face);
  const F = { pupils: [], brows: [], mouths: {}, eyes: [] };
  if (!dark) {
    for (const s of [-1, 1]) {
      const x = 0.058 * s;
      const y = 0.025;
      const z = Math.sqrt(0.155 * 0.155 - x * x - (y / 1.12) ** 2) + 0.004;
      const eye = new THREE.Group();
      eye.position.set(x, y, z);
      eye.lookAt(x * 3, y * 2, 1.5);
      face.add(eye);
      const white = new THREE.Mesh(new THREE.CircleGeometry(0.036, 32), M.eyeWhite);
      eye.add(white);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0075, 8, 32), M.ink);
      eye.add(ring);
      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.012, 20), M.ink);
      pupil.position.z = 0.003;
      eye.add(pupil);
      F.pupils.push(pupil);
      F.eyes.push(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.011, 0.01), M.ink);
      brow.position.set(x, 0.085, Math.sqrt(0.155 ** 2 - x * x - (0.085 / 1.12) ** 2) + 0.006);
      brow.rotation.y = Math.atan2(x, 0.15);
      face.add(brow);
      F.brows.push({ m: brow, s });
    }
    const mz = Math.sqrt(0.155 ** 2 - (0.075 / 1.12) ** 2) + 0.005;
    const neutral = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.008), M.ink);
    neutral.position.set(0, -0.075, mz);
    const worried = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0045, 6, 20, Math.PI), M.ink);
    worried.position.set(0, -0.09, mz - 0.003);
    const shock = new THREE.Mesh(new THREE.CircleGeometry(0.016, 20), M.ink);
    shock.scale.set(1, 1.35, 1);
    shock.position.set(0, -0.08, mz + 0.001);
    for (const m of [neutral, worried, shock]) face.add(m);
    F.mouths = { neutral, worried, shock };
    const sweat = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), M.sweat);
    sweat.scale.set(1, 1.6, 1);
    sweat.position.set(0.12, 0.07, 0.08);
    face.add(sweat);
    F.sweat = sweat;
  } else {
    const eyes = new THREE.Group();
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.CircleGeometry(0.026, 24), M.glow);
      e.scale.set(1.25, 0.8, 1);
      e.position.set(0.058 * s, 0.03, 0.152);
      e.rotation.y = 0.35 * s;
      eyes.add(e);
    }
    const sh = new THREE.Shape();
    sh.moveTo(-0.075, -0.05);
    sh.quadraticCurveTo(0, -0.115, 0.075, -0.05);
    const n = 9;
    for (let i = n; i >= 0; i--) {
      const x = -0.075 + (0.15 * i) / n;
      sh.lineTo(x, -0.06 - (i % 2 ? 0.0 : 0.02) - 0.03 * (1 - Math.abs(x / 0.075)));
    }
    const grin = new THREE.Mesh(new THREE.ShapeGeometry(sh), M.glow);
    grin.position.set(0, -0.0, 0.152);
    eyes.add(grin);
    eyes.visible = false;
    face.add(eyes);
    F.glow = eyes;
  }
  return { root, hips, chest, head, arms, legs, F };
}
function setExpr(fig, name, look = [0, 0]) {
  const F = fig.F;
  for (const [k, m] of Object.entries(F.mouths)) m.visible = k === name;
  const browRot = { neutral: 0.03, worried: 0.32, shock: 0.12 }[name];
  const browY = { neutral: 0.085, worried: 0.09, shock: 0.105 }[name];
  for (const b of F.brows) {
    b.m.rotation.z = -browRot * b.s;
    b.m.position.y = browY;
  }
  const ps = name === "shock" ? 0.7 : 1;
  for (const p of F.pupils) {
    p.position.x = look[0] * 0.016;
    p.position.y = look[1] * 0.016;
    p.scale.setScalar(ps);
  }
}

/* ---------------- Welt ---------------- */
const world = new THREE.Group();
scene.add(world);

// Kabine: x -0.9..0.9, z -1.6..0, y 0..2.4. Türöffnung x -0.5..0.5, y 0..2.1.
const cab = new THREE.Group();
world.add(cab);
plane(1.8, 1.6, M.rubber, 0, 0, -0.8, 0, cab).rotation.x = -Math.PI / 2;
plane(1.8, 2.4, M.metal, 0, 1.2, -1.6, 0, cab);
plane(1.6, 2.4, M.metal, -0.9, 1.2, -0.8, Math.PI / 2, cab);
plane(1.6, 2.4, M.metal, 0.9, 1.2, -0.8, -Math.PI / 2, cab);
const ceil = plane(1.8, 1.6, M.ceiling, 0, 2.4, -0.8, 0, cab);
ceil.rotation.x = Math.PI / 2;
const ceilPanel = plane(0.9, 0.5, M.ceilPanel, 0, 2.395, -0.8, 0, cab);
ceilPanel.rotation.x = Math.PI / 2;
// Handläufe
for (const [x, z, len, rotY] of [
  [0, -1.53, 1.5, 0],
  [-0.83, -0.85, 1.1, Math.PI / 2],
  [0.83, -1.05, 0.8, Math.PI / 2],
]) {
  const r = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, len, 12), M.metalDark);
  r.rotation.z = Math.PI / 2;
  r.rotation.y = rotY;
  r.position.set(x, 0.95, z);
  r.castShadow = true;
  cab.add(r);
}
// Front mit Türöffnung (beide Seiten sichtbar)
box(0.4, 2.4, 0.06, M.metal, -0.7, 1.2, 0, cab);
box(0.4, 2.4, 0.06, M.metal, 0.7, 1.2, 0, cab);
box(1.0, 0.3, 0.06, M.metal, 0, 2.25, 0, cab);
// Türflügel
const leafL = box(0.52, 2.1, 0.03, M.leaf, -0.25, 1.05, -0.05, cab);
const leafR = box(0.52, 2.1, 0.03, M.leaf, 0.25, 1.05, -0.05, cab);
// Anzeige innen über der Tür (zeigt in die Kabine)
plane(0.26, 0.19, M.dispIn, 0, 2.24, -0.035, Math.PI, cab);
// Bedienfeld rechts an der Wand (zeigt nach -x)
// Bedienfeld + Zettel an der Frontwand rechts neben der Tür (Blick in die Kabine: links)
const panelX = -0.7;
const panelY = 1.18;
const FZ = -0.034;
plane(PANEL.w, PANEL.h, M.panel, panelX, panelY, FZ, Math.PI, cab);
const noteX = -0.7;
const noteY = 1.7;
const note = plane(NOTE.w, NOTE.h, M.note, noteX, noteY, FZ - 0.001, Math.PI, cab);
note.rotation.z = 0.05;
const btnWorld = (key) => {
  const [u, v] = BTN[key];
  return V3(
    panelX + PANEL.w / 2 - (u / PANEL.cw) * PANEL.w,
    panelY + PANEL.h / 2 - (v / PANEL.ch) * PANEL.h,
    FZ - 0.004,
  );
};

// Licht in der Kabine
const cabLight = new THREE.PointLight(0xdfe9ff, 3.2, 6, 1.6);
cabLight.position.set(0, 2.25, -0.8);
cabLight.castShadow = true;
cabLight.shadow.mapSize.set(512, 512);
cabLight.shadow.bias = -0.002;
cab.add(cabLight);
const redLight = new THREE.PointLight(0xff1414, 0, 6, 1.4);
redLight.position.set(0.3, 2.2, -0.5);
cab.add(redLight);
const hemi = new THREE.HemisphereLight(0x8090a0, 0x101010, 0.22);
scene.add(hemi);

// Lobby (EG)
const lobby = new THREE.Group();
world.add(lobby);
const lf = plane(9, 7, M.lobbyFloor, 0, 0, 3.4, 0, lobby);
lf.rotation.x = -Math.PI / 2;
box(3.8, 3.4, 0.05, M.tiles, -2.43, 1.7, 0.06, lobby);
box(3.8, 3.4, 0.05, M.tiles, 2.43, 1.7, 0.06, lobby);
box(1.06, 1.0, 0.05, M.tiles, 0, 2.9, 0.06, lobby);
box(0.06, 2.4, 0.12, M.metalDark, -0.53, 1.2, 0.08, lobby);
box(0.06, 2.4, 0.12, M.metalDark, 0.53, 1.2, 0.08, lobby);
box(1.12, 0.08, 0.12, M.metalDark, 0, 2.16, 0.08, lobby);
plane(0.26, 0.19, M.dispOut, 0, 2.42, 0.09, 0, lobby);
const callPlate = box(0.1, 0.2, 0.02, M.metalDark, 0.72, 1.1, 0.09, lobby);
callPlate.castShadow = false;
const callBtn = new THREE.Mesh(new THREE.CircleGeometry(0.025, 20), M.callBtn);
callBtn.position.set(0.72, 1.12, 0.101);
lobby.add(callBtn);
plane(0.5, 0.2, M.clock, -1.55, 2.25, 0.09, 0, lobby);
const lobbyLight = new THREE.PointLight(0xcfe0ff, 6, 9, 1.5);
lobbyLight.position.set(0.3, 3.1, 2.2);
lobbyLight.castShadow = true;
lobbyLight.shadow.mapSize.set(512, 512);
lobby.add(lobbyLight);
const lobbyLamp = box(0.8, 0.04, 0.2, M.ceilPanel, 0.3, 3.35, 2.2, lobby);
lobbyLamp.castShadow = false;

// Flur im 13. Stock: x -1.1..1.1, z 0..14
const hall = new THREE.Group();
world.add(hall);
const HL = 14;
{
  const fl = plane(2.2, HL, M.wood, 0, 0, HL / 2, 0, hall);
  fl.rotation.x = -Math.PI / 2;
  const cp = plane(0.9, HL - 0.2, M.carpet, 0, 0.004, HL / 2, 0, hall);
  cp.rotation.x = -Math.PI / 2;
  const cl = plane(2.2, HL, M.ceiling, 0, 2.6, HL / 2, 0, hall);
  cl.rotation.x = Math.PI / 2;
  // Wände mit Türöffnungen: Segmente zwischen den Türen
  const doorsZ = [3.2, 6.6, 10.0];
  const segs = [];
  let z0 = 0.1;
  for (const dz of doorsZ) {
    segs.push([z0, dz - 0.45]);
    z0 = dz + 0.45;
  }
  segs.push([z0, HL]);
  for (const s of [-1, 1]) {
    for (const [a, b] of segs) {
      plane(b - a, 1.6, M.wallpaper, 1.1 * s, 1.8, (a + b) / 2, -s * (Math.PI / 2), hall);
      plane(b - a, 1.0, M.wainscot, 1.1 * s, 0.5, (a + b) / 2, -s * (Math.PI / 2), hall);
    }
    for (const dz of doorsZ) {
      plane(0.9, 0.55, M.wallpaper, 1.1 * s, 2.325, dz, -s * (Math.PI / 2), hall);
      // dunkle Öffnung
      box(0.05, 2.05, 0.9, M.void, 1.16 * s, 1.025, dz, hall);
      // offenes Türblatt
      const hinge = new THREE.Group();
      hinge.position.set(1.1 * s, 0, dz + 0.45);
      hall.add(hinge);
      const leaf = box(0.04, 2.0, 0.88, M.doorWood, -0.02 * s, 1.0, -0.44, hinge);
      leaf.castShadow = false;
      hinge.rotation.y = s * (1.2 + hash(dz) * 0.3);
      // Rahmen
      box(0.06, 2.1, 0.06, M.wood, 1.08 * s, 1.05, dz - 0.48, hall);
      box(0.06, 2.1, 0.06, M.wood, 1.08 * s, 1.05, dz + 0.48, hall);
    }
  }
  // Stirnwand mit Wohnungstür
  plane(0.65, 2.6, M.wallpaper, -0.775, 1.3, HL, Math.PI, hall);
  plane(0.65, 2.6, M.wallpaper, 0.775, 1.3, HL, Math.PI, hall);
  plane(0.9, 0.55, M.wallpaper, 0, 2.325, HL, Math.PI, hall);
}
// Licht hinter der Wohnungstür
plane(1.6, 2.6, M.doorLight, 0, 1.3, HL + 0.9, Math.PI, hall);
const flatRoom = new THREE.Group();
hall.add(flatRoom);
{
  const f = plane(1.6, 0.9, M.doorLight, 0, 0.001, HL + 0.45, 0, flatRoom);
  f.rotation.x = -Math.PI / 2;
}
const doorHinge = new THREE.Group();
doorHinge.position.set(-0.45, 0, HL);
hall.add(doorHinge);
box(0.88, 2.04, 0.04, M.doorWood, 0.44, 1.02, 0, doorHinge);
box(0.06, 2.1, 0.08, M.wood, -0.48, 1.05, HL - 0.02, hall);
box(0.06, 2.1, 0.08, M.wood, 0.48, 1.05, HL - 0.02, hall);
box(1.02, 0.06, 0.08, M.wood, 0, 2.08, HL - 0.02, hall);
const endLight = new THREE.PointLight(0xffb45a, 3, 9, 1.4);
endLight.position.set(0, 1.4, HL - 0.4);
hall.add(endLight);
const hallLights = [];
for (const z of [1.8, 5.0, 8.4, 11.8]) {
  const l = new THREE.PointLight(0xffc472, 4.5, 5.5, 1.4);
  l.position.set(0, 2.45, z);
  hall.add(l);
  hallLights.push(l);
  const g = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.05, 20), M.lampGlow);
  g.position.set(0, 2.57, z);
  hall.add(g);
}
// Silhouette in der Wohnungstür
const sil = makeFigure(true);
sil.root.position.set(0, 0, HL + 0.25);
sil.root.rotation.y = Math.PI;
sil.root.scale.setScalar(1.06);
hall.add(sil.root);
sil.head.rotation.z = 0.12;

// Die Hauptfigur ("du")
const fig = makeFigure(false);
fig.root.scale.setScalar(FIG_S);
world.add(fig.root);

// POV-Hand (Knopf drücken) und Handy
const povHand = new THREE.Group();
{
  const fa = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.3, 6, 14), M.body);
  fa.rotation.x = Math.PI / 2;
  fa.position.set(0, -0.01, -0.2);
  povHand.add(fa);
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), M.body);
  palm.scale.set(1.2, 0.9, 0.6);
  povHand.add(palm);
  const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.06, 4, 10), M.body);
  finger.rotation.x = Math.PI / 2;
  finger.position.set(0, 0.01, 0.075);
  povHand.add(finger);
}
povHand.scale.setScalar(0.6);
world.add(povHand);
const phone = new THREE.Group();
{
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.162, 0.009), M.phoneBody);
  phone.add(b);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.148), M.phoneScreen);
  s.position.z = 0.0047;
  phone.add(s);
  for (const [x, y, sx, sy] of [
    [-0.045, -0.02, 0.6, 1.6],
    [0.045, 0.01, 0.55, 1.1],
    [0.045, -0.035, 0.55, 1.1],
  ]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), M.body);
    f.scale.set(sx, sy, 0.8);
    f.position.set(x, y, 0.004);
    phone.add(f);
  }
  const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.25, 6, 14), M.body);
  hand.position.set(0, -0.2, -0.02);
  hand.rotation.x = 0.3;
  phone.add(hand);
}
world.add(phone);
const phoneLight = new THREE.PointLight(0x9fbfff, 0, 0.6, 2);
world.add(phoneLight);
const noteLight = new THREE.SpotLight(0xe8f0ff, 0, 2, 0.5, 0.6, 1.5);
noteLight.position.set(-0.6, 1.5, -0.6);
noteLight.target.position.set(-0.7, 1.6, 0);
world.add(noteLight, noteLight.target);

/* ---------------- Keller (−13) ---------------- */
const concrete = canvasTex(
  512,
  512,
  (g, w, h) => {
    g.fillStyle = "#4a4f4a";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const v = 50 + hash(i) * 40;
      g.fillStyle = `rgba(${v},${v + 4},${v},${0.12 + hash(i + 2) * 0.2})`;
      g.fillRect(hash(i + 3) * w, hash(i + 4) * h, 2 + hash(i + 5) * 10, 2 + hash(i + 6) * 10);
    }
    for (let i = 0; i < 14; i++) {
      const x = hash(i + 50) * w;
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, "rgba(20,24,18,0.5)");
      grd.addColorStop(1, "rgba(20,24,18,0)");
      g.fillStyle = grd;
      g.fillRect(x, 0, 6 + hash(i + 60) * 20, h * (0.3 + hash(i + 70) * 0.6));
    }
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, 254, w, 4);
  },
  { repeat: [6, 1] },
);
const signTex = canvasTex(600, 220, (g, w, h) => {
  g.fillStyle = "#0fa64a";
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#eafff0";
  g.font = FONT(900, 62);
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText("NOTAUSGANG", 140, h / 2 + 4, w - 160);
  // Läufer-Piktogramm
  g.strokeStyle = "#eafff0";
  g.lineWidth = 14;
  g.lineCap = "round";
  g.beginPath();
  g.arc(78, 50, 14, 0, 7);
  g.stroke();
  g.beginPath();
  g.moveTo(72, 74);
  g.lineTo(60, 128);
  g.moveTo(60, 128);
  g.lineTo(92, 168);
  g.moveTo(60, 128);
  g.lineTo(34, 172);
  g.moveTo(68, 88);
  g.lineTo(104, 108);
  g.moveTo(68, 88);
  g.lineTo(36, 104);
  g.stroke();
});
const MC = {
  concrete: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, map: concrete.tex }),
  wet: new THREE.MeshStandardMaterial({ color: 0x1b1f1b, roughness: 0.22, metalness: 0.2 }),
  pipe: new THREE.MeshStandardMaterial({ color: 0x3d3a32, roughness: 0.55, metalness: 0.5 }),
  sign: new THREE.MeshBasicMaterial({ map: signTex.tex }),
  steelDoor: new THREE.MeshStandardMaterial({ color: 0x2e3436, roughness: 0.5, metalness: 0.6 }),
  bulb: new THREE.MeshBasicMaterial({ color: 0xd8ffe0 }),
};
const CL = 12;
const cellar = new THREE.Group();
world.add(cellar);
{
  const f = plane(2.0, CL, MC.wet, 0, 0, CL / 2, 0, cellar);
  f.rotation.x = -Math.PI / 2;
  const c = plane(2.0, CL, MC.concrete, 0, 2.4, CL / 2, 0, cellar);
  c.rotation.x = Math.PI / 2;
  plane(CL, 2.4, MC.concrete, -1.0, 1.2, CL / 2, Math.PI / 2, cellar);
  plane(CL, 2.4, MC.concrete, 1.0, 1.2, CL / 2, -Math.PI / 2, cellar);
  plane(2.0, 2.4, MC.concrete, 0, 1.2, CL, Math.PI, cellar);
  box(0.9, 2.05, 0.06, MC.steelDoor, 0, 1.025, CL - 0.03, cellar);
  for (const x of [-0.62, -0.45, 0.6]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, CL, 12), MC.pipe);
    p.rotation.x = Math.PI / 2;
    p.position.set(x, 2.25 - (x === -0.45 ? 0.12 : 0), CL / 2);
    cellar.add(p);
  }
}
plane(0.9, 0.33, MC.sign, 0, 2.15, CL - 0.06, Math.PI, cellar);
const signLight = new THREE.PointLight(0x2bff7a, 4, 9, 1.3);
signLight.position.set(0, 2.0, CL - 0.5);
cellar.add(signLight);
const cellarLights = [];
for (const z of [2.2, 6.5]) {
  const l = new THREE.PointLight(0xc8ffd8, 1.6, 5, 1.5);
  l.position.set(0, 2.2, z);
  cellar.add(l);
  cellarLights.push(l);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), MC.bulb);
  b.position.set(0, 2.28, z);
  cellar.add(b);
}

// Handy in der Hand der Figur (für Wahl + Angst)
const handPhone = new THREE.Group();
{
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.162, 0.009), M.phoneBody);
  handPhone.add(b);
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.148), M.phoneScreen);
  sc.position.z = 0.0047;
  handPhone.add(sc);
}
world.add(handPhone);
const handLight = new THREE.PointLight(0x9fc4ff, 0, 1.2, 1.6);
world.add(handLight);
const faceFill = new THREE.PointLight(0xffe6d0, 0, 1.6, 1.8);
world.add(faceFill);

/* ---------------- Schnitte + Kameras ---------------- */
const HEAD_Y = FIG_S * 1.76;
const FZ_A = -0.75; // Figur steht seit Teil 1 einen Schritt vor
const CUTS = [
  [0, EV.p2, "shoulder", { push: 0.06 }],
  [EV.p2, EV.passiert, "follow"],
  [EV.passiert, EV.rw0, "scare"],
  [EV.rw0, EV.rw1, "rewind"],
  [EV.rw1, EV.p6, "panel", { key: "EG", d0: 0.42, d1: 0.36 }],
  [EV.p6, EV.p7, "gapTele"],
  [EV.p7, EV.p8, "shoulder", { push: 0.1 }],
  [EV.p8, EV.p9, "shoulder", { push: 0 }],
  [EV.p9, EV.p10, "disp", { from: 1.0, to: 0.86 }],
  [EV.p10, EV.p12, "face", { d0: 0.62, d1: 0.52 }],
  [EV.p12, EV.p13, "disp", { from: 0.95, to: 0.85 }],
  [EV.p13, EV.p14, "panelLow"],
  [EV.p14, EV.p15, "disp", { from: 0.92, to: 0.8 }],
  [EV.p15, EV.p17, "phone"],
  [EV.p17, EV.p18, "shoulder", { push: 0.12 }],
  [EV.p18, EV.p19, "cellar"],
  [EV.p19, EV.p20, "phone"],
  [EV.p20, EV.p23, "shoulderPhone"],
  [EV.p23, EV.p24, "face", { d0: 0.62, d1: 0.5 }],
  [EV.p24, DUR + 1, "end"],
];
const cutAt = (t) => CUTS.find((c) => t >= c[0] && t < c[1]) || CUTS[CUTS.length - 1];

// B-Weg: die Figur geht hinaus (Zeit -> z)
const figZB = (t) => lerp(FZ_A, 1.7, smooth(ramp(t, EV.p2 + 0.25, EV.passiert - 0.05)));

function cameraFor(t, shot, o, u) {
  let pos;
  let look;
  let fov = 55;
  switch (shot) {
    case "disp": {
      const d = lerp(o.from, o.to, eOut(u));
      pos = V3(0, 2.16, -0.035 - d);
      look = V3(0, 2.235, -0.035);
      fov =
        30 -
        4 *
          (t >= EV.m13 && t < EV.m13 + 0.09
            ? ramp(t, EV.m13, EV.m13 + 0.09)
            : t >= EV.m13 + 0.09 && t < EV.p15
              ? 1 - ramp(t, EV.m13 + 0.09, EV.m13 + 0.6)
              : 0);
      break;
    }
    case "panel": {
      const p = btnWorld(o.key);
      pos = V3(p.x + 0.04, p.y + 0.06, p.z - lerp(o.d0, o.d1, u));
      look = p.clone().add(V3(0, 0.04, 0));
      fov = 40;
      break;
    }
    case "panelLow": {
      const p = btnWorld("EG").add(V3(0, lerp(0.05, -0.1, eInOut(u)), 0));
      pos = V3(p.x + 0.02, p.y + 0.02, p.z - 0.34);
      look = p;
      fov = 40;
      break;
    }
    case "phone":
      pos = V3(0, 1.42, -0.32);
      look = V3(0, 1.4, -0.62);
      fov = 34;
      break;
    case "face": {
      const d = lerp(o.d0, o.d1, eOut(u));
      const hz = figZ(t);
      pos = V3(0.03, HEAD_Y + 0.02, hz + d);
      look = V3(0, HEAD_Y - 0.03, hz);
      fov = 46;
      break;
    }
    case "shoulder":
    case "shoulderPhone": {
      const z0 = figZ(t) - 0.75;
      pos = V3(-0.15, 1.62, lerp(z0, z0 + (o.push || 0), eOut(u)));
      look = V3(-0.45, 1.25, 3);
      fov = 72;
      if (shot === "shoulderPhone") {
        pos = V3(-0.2, 1.68, lerp(z0 + 0.02, z0 + 0.08, u));
        look = V3(-0.36, 1.0, 3);
        fov = 74;
      }
      break;
    }
    case "follow": {
      const z = figZB(t);
      pos = V3(-0.15, 1.62, z - 0.8);
      look = V3(-0.2, 1.35, z + 6);
      fov = 66;
      break;
    }
    case "scare": {
      const z = figZB(EV.passiert);
      const k = eOut(ramp(t, EV.passiert, EV.passiert + 0.18));
      pos = V3(lerp(-0.15, 0.03, k), lerp(1.62, 1.64, k), z - lerp(0.8, 0.2, k));
      look = V3(0, lerp(1.4, 1.78, k), z + 0.62);
      fov = lerp(66, 58, k);
      break;
    }
    case "gapTele":
      pos = V3(-0.1, 1.6, FZ_A - 0.7);
      look = V3(0, 1.45, 8);
      fov = lerp(30, 26, u);
      break;
    case "cellar": {
      const z = lerp(0.6, 9.0, eInOut(u));
      pos = V3(0, 1.6, z);
      look = V3(0, 1.95, CL);
      fov = 52;
      break;
    }
    case "end":
      pos = V3(0, 1.3, -1.2);
      look = V3(0, 1.2, 0);
      fov = 60;
      break;
  }
  let shake = 0.0015;
  const kick = (t0, a, k = 5) => (t > t0 ? a * Math.exp(-k * (t - t0)) : 0);
  shake +=
    kick(EV.passiert, 0.03) +
    kick(EV.closeT, 0.03) +
    kick(EV.schlag, 0.07, 4) +
    kick(EV.fahrt, 0.012, 6);
  shake += kick(EV.m13, 0.02) + kick(EV.stehen, 0.05, 4);
  if (t > EV.fahrt && t < EV.stehen) shake += 0.004;
  pos.x += noise(t * 9) * shake;
  pos.y += noise(t * 11 + 40) * shake;
  return { pos, look, fov };
}

/* ---------------- Zustand ---------------- */
function figZ(t) {
  if (t >= EV.p2 && t < EV.rw0) return figZB(t);
  return FZ_A;
}
function displayAt(t) {
  let k = "13";
  for (const [tt, lab] of STK.disp) if (t >= tt) k = lab;
  return k;
}
function doorOpen(t) {
  if (t < EV.p2) return 0.32;
  if (t < EV.rw0) return lerp(0.32, 1, eOut(ramp(t, EV.p2, EV.p2 + 0.5)));
  if (t < EV.p7) return 0.32 - 0.04 * ramp(t, EV.hammer, EV.p7);
  if (t < EV.p17) return lerp(0.28, 0, eInOut(ramp(t, EV.p7, EV.closeT)));
  return eInOut(ramp(t, EV.p17 + 0.15, EV.p17 + 1.35));
}
function silState(t) {
  // Rückgabe: { vis, z, glow, run }
  if (t >= EV.p2 && t < EV.rw0) {
    if (t < EV.passiert) return { vis: true, z: HL + 0.25, glow: false, run: 0 };
    return { vis: true, z: figZB(EV.passiert) + 0.62, glow: true, run: 0, close: true };
  }
  if (t < EV.run) return { vis: true, z: HL + 0.25, glow: t >= EV.p1 + 0.4, run: 0 };
  const k = ramp(t, EV.run, EV.closeT);
  return { vis: t < EV.closeT + 0.05, z: lerp(HL + 0.25, 0.42, k), glow: true, run: k < 1 ? 1 : 0 };
}

function update(t) {
  const [a, b, shot, o = {}] = cutAt(t);
  const u = clamp((t - a) / (b - a));
  const cam = cameraFor(t, shot, o, u);
  camera.position.copy(cam.pos);
  camera.fov = cam.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(cam.look);

  lobby.visible = false;
  hall.visible = t < EV.closeT + 0.1;
  cellar.visible = t >= EV.p17 - 0.01;
  scene.fog = hall.visible
    ? new THREE.FogExp2(0x0d0905, 0.05)
    : cellar.visible
      ? new THREE.FogExp2(0x040805, 0.07)
      : null;

  // Türen (+ Schlag)
  const op = doorOpen(t);
  const bang = t > EV.schlag ? Math.exp(-7 * (t - EV.schlag)) : 0;
  const thud = Math.sin((t - EV.schlag) * 60) * 0.012 * bang;
  leafL.position.x = -0.25 - 0.5 * op + thud;
  leafR.position.x = 0.25 + 0.5 * op - thud;
  leafL.position.z = leafR.position.z = -0.05 - 0.025 * bang;

  // Anzeigen
  const k = displayAt(t);
  dispIn.draw(k, k);
  dispOut.draw("EG", "EG");
  const lit = [7];
  const pressedEG = t >= EV.presses[0];
  if (pressedEG && t < EV.p17) lit.push("EG");
  const blink =
    t >= EV.presses[0] && t < EV.presses[3] + 0.3 && Math.floor((t - EV.presses[0]) * 8) % 2 === 1;
  const pst = { lit: blink ? [7] : lit, red: true, top: k };
  panelTex.draw(JSON.stringify(pst), pst);
  noteTex.draw("10", 10);
  const typing = t >= EV.p19;
  const pst2 = {
    mode: t < EV.msg ? "lock" : "chat",
    bubble: t >= EV.msg ? 1 : 0,
    typing: typing ? 1 : 0,
    dot: Math.floor(t * 6) % 3,
  };
  phoneTex.draw(JSON.stringify(pst2), pst2);

  // Licht
  const relief = t >= EV.eg && t < EV.p11 + 0.25;
  let cabI = relief ? 2.8 : 0.35;
  if (t >= EV.passiert && t < EV.rw0) cabI = 0.1;
  if (t > EV.p11 && t < EV.p11 + 0.45) cabI = Math.floor((t - EV.p11) * 18) % 3 === 0 ? 0 : 2.4;
  if (t > EV.stehen - 0.05 && t < EV.stehen + 0.5)
    cabI = Math.floor((t - EV.stehen) * 20) % 2 ? 0 : 1.5;
  if (t >= EV.p17) cabI = 0.15;
  cabLight.intensity = cabI;
  M.ceilPanel.color.setScalar(cabI > 0.4 ? 1 : 0.18);
  redLight.intensity = relief ? 0 : t >= EV.p17 ? 0.8 : 2.4;
  const dark = t >= EV.passiert && t < EV.rw0;
  hallLights.forEach((l) => (l.intensity = dark ? 0 : 4.5));
  endLight.intensity = dark ? 0 : 6;
  M.doorLight.color.setRGB(1, 0.85, 0.6).multiplyScalar(dark ? 0.05 : 1.1);
  doorHinge.rotation.y = -1.25;
  signLight.intensity =
    4 * eOut(ramp(t, EV.p17 + 0.3, EV.p17 + 1.0)) * (Math.floor(t * 13) % 17 === 0 ? 0.4 : 1);
  cellarLights.forEach(
    (l, i) => (l.intensity = 1.6 * (Math.floor(t * (7 + i * 3)) % 11 === 0 ? 0.15 : 1)),
  );
  phoneLight.intensity = shot === "phone" ? 0.25 : 0;
  noteLight.intensity = 0;
  faceFill.intensity = shot === "face" ? (relief ? 0.9 : 0.5) : 0;
  faceFill.position.set(0.15, HEAD_Y + 0.15, figZ(t) + 0.45);

  // Silhouette
  const S = silState(t);
  sil.root.visible = S.vis;
  sil.root.position.set(0, 0, S.z);
  sil.root.rotation.y = Math.PI;
  sil.F.glow.visible = S.glow;
  sil.head.rotation.z = S.close ? 0.3 : 0.37;
  const ph = (t - EV.run) * 2 * Math.PI * 2.6;
  for (const s of [-1, 1]) {
    sil.legs[s].hip.rotation.x = S.run ? Math.sin(ph) * 0.8 * s : 0;
    sil.legs[s].kn.rotation.x = S.run ? Math.max(0, Math.sin(ph) * s) * 1.2 : 0;
    sil.arms[s].sh.rotation.x = S.run ? -Math.sin(ph) * 0.9 * s : S.close ? -0.4 : 0;
  }
  sil.chest.rotation.x = S.run ? 0.25 : S.close ? 0.15 : 0;
  sil.hips.position.y = S.run ? Math.abs(Math.cos(ph)) * 0.05 : 0;

  // Figur
  const pov = shot === "phone" || shot === "panel" || shot === "panelLow";
  fig.root.visible =
    !pov &&
    shot !== "disp" &&
    shot !== "cellar" &&
    shot !== "gapTele" &&
    !(shot === "scare" && t > EV.passiert + 0.05);
  fig.root.position.set(0, 0, figZ(t));
  fig.root.rotation.y = 0;
  for (const s of [-1, 1]) {
    fig.legs[s].hip.rotation.x = 0;
    fig.legs[s].kn.rotation.x = 0;
    fig.arms[s].sh.rotation.set(0, 0, 0.08 * s);
    fig.arms[s].el.rotation.set(0, 0, 0);
  }
  fig.hips.position.y = 0;
  if (t >= EV.p2 && t < EV.passiert) {
    const wph = (t - EV.p2) * 2 * Math.PI * 0.85;
    const sw = 0.4 * (1 - ramp(t, EV.passiert - 0.3, EV.passiert));
    fig.legs[-1].hip.rotation.x = Math.sin(wph) * sw;
    fig.legs[1].hip.rotation.x = -Math.sin(wph) * sw;
    fig.legs[-1].kn.rotation.x = Math.max(0, -Math.sin(wph)) * sw;
    fig.legs[1].kn.rotation.x = Math.max(0, Math.sin(wph)) * sw;
    fig.arms[-1].sh.rotation.x = -Math.sin(wph) * sw * 0.6;
    fig.arms[1].sh.rotation.x = Math.sin(wph) * sw * 0.6;
  }
  // Handy in der rechten Hand (Figur-Rechte = −x)
  const holds = t >= EV.p20 && t < EV.p24;
  handPhone.visible = holds && shot !== "face";
  if (holds) {
    fig.arms[-1].sh.rotation.set(-1.0, 0, -0.35);
    fig.arms[-1].el.rotation.set(-1.0, 0, 0);
    fig.arms[-1].sh.rotation.set(-1.3, 0, -0.35);
    fig.arms[-1].el.rotation.set(-1.1, 0, 0);
    handPhone.position.set(-0.33, 1.47, figZ(t) + 0.2);
    handPhone.rotation.set(0.45, Math.PI + 0.35, 0);
    handLight.position.set(-0.3, 1.5, figZ(t) + 0.2);
  }
  handLight.intensity = holds ? 0.6 : 0;
  // Mimik
  let expr = "shock";
  let lk = [0, 0];
  if (t >= EV.p5 && t < EV.p8) expr = "worried";
  if (t >= EV.schlag) expr = "shock";
  if (t >= EV.p10 && t < EV.p11) {
    expr = "neutral";
    lk = [0, -0.4];
  }
  if (t >= EV.p11) {
    expr = "worried";
    lk = [0, 0.7];
  }
  if (t >= EV.p17) expr = "shock";
  if (t >= EV.p23) {
    expr = "worried";
    lk = [-0.6 * ramp(t, EV.machst - 0.2, EV.machst + 0.1), -0.5];
  }
  setExpr(fig, expr, lk);
  fig.head.rotation.set(t >= EV.p23 ? 0.12 : 0, 0, 0);
  const rk = t > EV.schlag ? Math.exp(-3 * (t - EV.schlag)) : 0;
  fig.chest.rotation.x = -0.15 * rk;
  fig.chest.rotation.z = Math.sin((t - EV.schlag) * 14) * 0.06 * rk;
  fig.F.sweat.visible = t >= EV.p11 && t < EV.p12 + 0.1;
  fig.F.sweat.position.y = 0.07 - 0.06 * clamp((t - EV.p11) / 1.2);
  fig.chest.position.y = 1.1 + Math.sin(t * 3.2) * 0.005;

  // POV-Hand hämmert auf EG
  povHand.visible = shot === "panel";
  if (povHand.visible) {
    const p = btnWorld("EG");
    let press = 0;
    for (const pt of EV.presses)
      press = Math.max(press, ramp(t, pt - 0.06, pt) - ramp(t, pt + 0.06, pt + 0.16));
    const tIn = ramp(t, EV.rw1, EV.rw1 + 0.25);
    const start = V3(p.x - 0.12, p.y - 0.34, p.z - 0.3);
    const at = V3(p.x - 0.01, p.y - 0.03, p.z - 0.1 + 0.035 * press);
    povHand.position.copy(lerpV(start, at, eOut(tIn)));
    povHand.lookAt(p);
  }
  // Handy (POV)
  phone.visible = shot === "phone";
  if (phone.visible) {
    const vib =
      t > EV.vib && t < EV.vib + 1.1 && (t - EV.vib) % 0.6 < 0.35 ? noise(t * 80) * 0.004 : 0;
    const kk = eOut(ramp(t, a, a + 0.4));
    phone.position.set(vib, lerp(1.1, 1.4, kk), -0.6);
    phone.rotation.set(-0.08, 0, lerp(0.2, -0.04, kk));
    phoneLight.position.set(0, 1.42, -0.5);
  }
}

/* ---------------- Etiketten (A/B) an 3D-Punkten ---------------- */
const callA = document.getElementById("callA");
const callB = document.getElementById("callB");
function project(v) {
  const p = v.clone().project(camera);
  return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H];
}
function placeCallouts(t) {
  const on = t >= EV.p20 && t < EV.p23;
  const pop = (t0) => {
    const k = clamp((t - t0) / 0.22);
    return [k, 0.9 + 0.1 * eOut(k)];
  };
  {
    const [k, s] = pop(EV.wA);
    callA.style.opacity = on && t >= EV.wA ? String(k) : "0";
    const [x, y] = project(V3(0, 2.15, CL - 0.06));
    document.getElementById("callA-dot").setAttribute("cx", x.toFixed(1));
    document.getElementById("callA-dot").setAttribute("cy", y.toFixed(1));
    document
      .getElementById("callA-line")
      .setAttribute(
        "d",
        `M 590 420 L ${x.toFixed(1)} 420 L ${x.toFixed(1)} ${(y - 36).toFixed(1)}`,
      );
    document
      .getElementById("callA-pill")
      .setAttribute("transform", `translate(330 420) scale(${s}) translate(-330 -420)`);
  }
  {
    const [k, s] = pop(EV.wB);
    callB.style.opacity = on && t >= EV.wB ? String(k) : "0";
    const [x, y] = project(handPhone.position);
    document.getElementById("callB-dot").setAttribute("cx", x.toFixed(1));
    document.getElementById("callB-dot").setAttribute("cy", y.toFixed(1));
    document
      .getElementById("callB-line")
      .setAttribute("d", `M ${x.toFixed(1)} 615 L ${x.toFixed(1)} ${(y - 42).toFixed(1)}`);
    document
      .getElementById("callB-pill")
      .setAttribute("transform", `translate(650 560) scale(${s}) translate(-650 -560)`);
  }
}

/* ---------------- Zeit-Umleitung: Zurückspulen ---------------- */
function sceneTime(t) {
  if (t >= EV.rw0 && t < EV.rw1) {
    const k = (t - EV.rw0) / (EV.rw1 - EV.rw0);
    return lerp(EV.rw0 - 0.01, 0.2, Math.pow(k, 0.8));
  }
  return t;
}

/* ---------------- Rendern ---------------- */
function renderAt(t) {
  t = clamp(t, 0, DUR);
  update(sceneTime(t));
  renderer.render(scene, camera);
  placeCallouts(t);
}
window.__stkRender = renderAt;

window.__hf = window.__hf || {};
window.__hf.buildReady = window.__hf.buildReady || {};
window.__hf.buildReady["stockwerk13"] = (async () => {
  try {
    await Promise.all(
      [
        "700 40px Montserrat",
        "800 40px Montserrat",
        "900 40px Montserrat",
        "600 40px Montserrat",
      ].map((f) => document.fonts.load(f)),
    );
  } catch {
    /* Fallback-Schrift */
  }
  for (const tx of [panelTex, noteTex, phoneTex, dispIn, dispOut]) tx.key = null;
  clockTex.key = null;
  clockTex.draw("c", null);
  for (const f of [0.02, 0.2, 0.45, 0.6, 0.75, 0.95]) renderAt(DUR * f);
  const tl = window.__timelines && window.__timelines.main;
  renderAt(tl ? tl.time() : 0);
  renderer.getContext().finish();
})();
renderAt(0);
