// Stockwerk 13 · 3D-Szene (Three.js). Jedes Bild ist eine reine Funktion von t.
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
  const lit = d === null ? "" : map[d];
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
  // k: "EG" | Zahl | null (aus)
  g.fillStyle = "#060404";
  g.fillRect(0, 0, w, h);
  if (k === null) return;
  const red = k === 13;
  const on = red ? "#ff2a2a" : "#ffb23e";
  const off = red ? "#1d0606" : "#170e05";
  g.fillStyle = on;
  g.shadowColor = on;
  g.shadowBlur = 20;
  g.beginPath();
  g.moveTo(40, 150);
  g.lineTo(80, 92);
  g.lineTo(120, 150);
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
  const s = String(k).padStart(2, " ");
  const dw = 150;
  const dh = 270;
  seg7(g, s[0] === " " ? null : +s[0], 160, (h - dh) / 2, dw, dh, on, off);
  seg7(g, +s[1], 160 + dw + 40, (h - dh) / 2, dw, dh, on, off);
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
  const st = k || { low: 1, netz: 0 };
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, "#1a2840");
  grd.addColorStop(1, "#070b12");
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#000";
  g.beginPath();
  g.roundRect(w / 2 - 60, 22, 120, 34, 17);
  g.fill();
  g.fillStyle = "#c9d3e0";
  g.font = FONT(700, 30);
  g.textAlign = "left";
  g.fillText("02:07", 44, 52);
  g.textAlign = "center";
  g.fillStyle = "#eef3fa";
  g.font = FONT(800, 170);
  g.fillText("02:07", w / 2, 330);
  g.fillStyle = "#9fb0c5";
  g.font = FONT(600, 36);
  g.fillText("Sonntag, 3. November", w / 2, 395);
  // Akku
  g.globalAlpha = st.low;
  g.strokeStyle = "#ff3b3b";
  g.lineWidth = 6;
  g.beginPath();
  g.roundRect(120, 520, 130, 70, 12);
  g.stroke();
  g.fillStyle = "#ff3b3b";
  g.fillRect(253, 540, 12, 30);
  g.fillRect(130, 530, 14, 50);
  g.font = FONT(900, 74);
  g.fillText("3 %", 360, 582);
  g.globalAlpha = 1;
  if (st.netz) {
    g.fillStyle = "#ff4d4d";
    g.font = FONT(900, 72);
    g.fillText("Kein Netz", w / 2, 760);
    g.fillStyle = "#8796aa";
    g.font = FONT(600, 36);
    g.fillText("Nur Notrufe", w / 2, 815);
  }
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

/* ---------------- Schnitte + Kameras ---------------- */
const FIG = V3(0, 0, -1.12);
const HEAD = V3(0, FIG_S * 1.76, -1.12);
const CUTS = [
  [0, EV.tease, "disp", { from: 1.0, to: 0.86, red: true }],
  [EV.tease, EV.n2, "lobby"],
  [EV.n2, EV.drueckst, "cab", { z0: -0.1, z1: -0.2 }],
  [EV.drueckst, EV.n3, "panel", { key: 7, d0: 0.42, d1: 0.36 }],
  [EV.n3, EV.n4, "phone"],
  [EV.n4, EV.n5, "cab", { z0: -0.15, z1: -0.25 }],
  [EV.n5, EV.n6, "disp", { from: 1.05, to: 0.95 }],
  [EV.n6, EV.n7, "face", { d0: 0.95, d1: 0.8 }],
  [EV.n7, EV.n8, "disp", { from: 1.0, to: 0.86 }],
  [EV.n8, EV.n9, "panelUp"],
  [EV.n9, EV.n10, "disp", { from: 0.92, to: 0.88 }],
  [EV.n10, EV.n11, "cab", { z0: -0.12, z1: -0.12 }],
  [EV.n11, EV.n12, "panelToNote"],
  [EV.n12, EV.n14, "note"],
  [EV.n14, EV.n15, "shoulder", { push: 0.15 }],
  [EV.n15, EV.n17, "flur"],
  [EV.n17, EV.n18, "face", { d0: 0.85, d1: 0.65 }],
  [EV.n18, EV.n19, "shadow"],
  [EV.n19, EV.n23, "shoulder", { push: 0.05 }],
  [EV.n23, EV.n24, "face", { d0: 0.8, d1: 0.66 }],
  [EV.n24, DUR + 1, "end"],
];
const cutAt = (t) => CUTS.find((c) => t >= c[0] && t < c[1]) || CUTS[CUTS.length - 1];

function cameraFor(t) {
  const [a, b, shot, o = {}] = cutAt(t);
  const u = clamp((t - a) / (b - a));
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
        (o.red ? 0 : 0) -
        (shot === "disp" && t >= EV.t13 && t < EV.t13 + 0.09
          ? 4 * ramp(t, EV.t13, EV.t13 + 0.09)
          : 0) -
        (t >= EV.t13 + 0.09 && t < EV.n10 ? 4 * (1 - ramp(t, EV.t13 + 0.09, EV.t13 + 0.6)) : 0);
      break;
    }
    case "lobby":
      pos = lerpV(V3(1.1, 1.5, 4.6), V3(0.8, 1.45, 3.9), u);
      look = V3(0, 1.3, 0);
      fov = 52;
      break;
    case "cab":
      pos = V3(0.18, 1.12, lerp(-0.08, -0.14, u));
      look = V3(0.03, 1.12, -1.2);
      fov = 90;
      break;
    case "panel": {
      const p = btnWorld(o.key);
      pos = V3(p.x + 0.04, p.y + 0.02, p.z - lerp(o.d0, o.d1, u));
      look = p.clone();
      fov = 40;
      break;
    }
    case "panelUp": {
      const p0 = btnWorld(3);
      const p1 = btnWorld(12).add(V3(0, 0.12, 0.04));
      const p = lerpV(p0, p1, eInOut(u));
      pos = V3(p.x + 0.02, p.y, p.z - 0.36);
      look = p;
      fov = 40;
      break;
    }
    case "panelToNote": {
      const p0 = V3(panelX, panelY, FZ);
      const p1 = V3(noteX, noteY, FZ);
      const k = eInOut(ramp(u, 0.15, 0.85));
      const p = lerpV(p0, p1, k);
      pos = V3(p.x + 0.02, p.y - 0.02, p.z - lerp(0.75, 0.55, k));
      look = p;
      fov = 42;
      break;
    }
    case "note": {
      const k = eInOut(ramp(t, EV.n13, EV.n13 + 0.8));
      look = V3(noteX, lerp(noteY + 0.03, noteY - 0.05, k), FZ);
      pos = V3(noteX + 0.01, look.y - 0.02, FZ - lerp(0.58, 0.46, k));
      fov = 34;
      break;
    }
    case "phone":
      pos = V3(0, 1.42, -0.32);
      look = V3(0, 1.4, -0.62);
      fov = 34;
      break;
    case "face": {
      const d = lerp(o.d0, o.d1, eOut(u));
      const hz = HEAD.z + (t >= EV.n14 ? 0.37 : 0);
      pos = V3(0.03, HEAD.y + 0.02, hz + d);
      look = V3(HEAD.x, HEAD.y, hz).add(V3(0, -0.03, 0));
      fov = 38;
      break;
    }
    case "shoulder":
      pos = V3(-0.15, 1.62, lerp(-1.5, -1.5 + o.push, eOut(u)));
      look = V3(-0.45, 1.25, 3);
      fov = 72;
      break;
    case "flur": {
      const k1 = ramp(t, EV.n15, EV.n16);
      const k2 = eInOut(ramp(t, EV.n16, EV.n16e));
      const z = lerp(0.6, 3.2, k1) + lerp(0, 7.4, k2);
      pos = V3(0, 1.62, z);
      look = V3(0, 1.35, HL);
      fov = 50;
      break;
    }
    case "shadow":
      pos = V3(0.12, 1.6, HL - 2.4 + 0.25 * u);
      look = V3(0, 1.55, HL);
      fov =
        40 -
        8 * ramp(t, EV.stimme, EV.stimme + 0.09) +
        6 * ramp(t, EV.stimme + 0.09, EV.stimme + 0.6);
      break;
    case "end":
      pos = V3(0, 1.3, -1.2);
      look = V3(0, 1.2, 0);
      fov = 60;
      break;
  }
  // Wackeln: Aufzug fährt an, Ruck
  let shake = 0.0015;
  shake += 0.012 * Math.exp(-6 * Math.max(0, t - EV.faehrt)) * (t > EV.faehrt ? 1 : 0);
  shake += 0.05 * Math.exp(-4 * Math.max(0, t - EV.ruck)) * (t > EV.ruck ? 1 : 0);
  shake += 0.02 * Math.exp(-5 * Math.max(0, t - EV.t13)) * (t > EV.t13 ? 1 : 0);
  shake += 0.025 * Math.exp(-5 * Math.max(0, t - EV.stimme)) * (t > EV.stimme ? 1 : 0);
  pos.x += noise(t * 9) * shake;
  pos.y += noise(t * 11 + 40) * shake;
  return { pos, look, fov, shot };
}

/* ---------------- Zustand ---------------- */
function floorAt(t) {
  if (t < EV.tease) return 13;
  if (t >= EV.t13) return 13;
  const F = STK.floors;
  if (t < EV.faehrt) return "EG";
  let n = 1 + Math.floor(clamp((t - EV.faehrt) / (F[5] - EV.faehrt)) * 4);
  for (let k = 5; k <= 12; k++) if (t >= F[k]) n = k;
  if (t > EV.n9 + 0.45 && t < EV.t13 - 0.3) n = Math.floor((t - EV.n9) * 14) % 3 ? 12 : null;
  return n;
}
function doorOpen(t) {
  const o1 = eInOut(ramp(t, EV.n14 + 0.15, EV.n14 + 1.45));
  if (t < EV.n19) return o1;
  const c = lerp(1, 0.32, eInOut(ramp(t, EV.n19 + 0.1, EV.n23)));
  if (t < EV.n24) return c;
  return 0.07;
}

function update(t) {
  const cam = cameraFor(t);
  const shot = cam.shot;
  camera.position.copy(cam.pos);
  camera.fov = cam.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(cam.look);

  // Sets
  lobby.visible = shot === "lobby";
  hall.visible = t >= EV.n14;
  scene.fog = t >= EV.n14 ? new THREE.FogExp2(0x0d0905, 0.05) : null;

  // Türen
  const o = shot === "lobby" ? 0 : doorOpen(t);
  leafL.position.x = -0.25 - 0.5 * o;
  leafR.position.x = 0.25 + 0.5 * o;

  // Anzeigen
  const fl = floorAt(t);
  dispIn.draw(String(fl), fl);
  dispOut.draw("EG", "EG");
  const flick13 = t < EV.tease && (Math.floor(t * 20) % 7 === 0 || (t > 0.5 && t < 0.62));
  M.dispIn.color.setScalar(flick13 ? 0.25 : 1);
  const lit = t >= EV.press ? [7] : [];
  if (t >= EV.erdgeschoss && t < EV.n23) lit.push("EG");
  const pst = {
    lit,
    red: t >= EV.t13,
    top: t >= EV.t13 ? "13" : typeof fl === "number" ? String(fl) : "EG",
  };
  panelTex.draw(JSON.stringify(pst), pst);
  const nShown = STK.noteTimes.filter((x) => t >= x).length;
  noteTex.draw(String(nShown), nShown);
  const low = t > EV.akku && t < EV.akku + 1.2 ? (Math.floor((t - EV.akku) * 4) % 2 ? 1 : 0.3) : 1;
  const phst = { low, netz: t >= EV.kein ? 1 : 0 };
  phoneTex.draw(JSON.stringify(phst), phst);

  // Licht
  const after13 = t >= EV.t13;
  let cabI = after13 ? 0.35 : 3.2;
  if (t < EV.tease) cabI = 0.5;
  const fr = EV.flackert;
  if (t > fr - 0.1 && t < fr + 0.8) cabI = Math.floor((t - fr) * 18) % 3 === 0 ? 0 : 2.8;
  if (t >= EV.n14) cabI = 0.25;
  cabLight.intensity = cabI;
  M.ceilPanel.color.setScalar(cabI > 0.4 ? 1 : 0.18);
  redLight.intensity = after13 || t < EV.tease ? (t >= EV.n14 && t < EV.n23 ? 1.2 : 2.6) : 0;
  lobbyLight.intensity =
    6 * (t > EV.tease + 1.0 && t < EV.tease + 1.25 && Math.floor(t * 30) % 2 ? 0.2 : 1);
  const lightOn = ramp(t, EV.licht - 0.3, EV.licht + 0.3);
  endLight.intensity = t >= EV.n14 ? 2.5 + 5 * lightOn + (shot === "shadow" ? 3 : 0) : 0;
  M.doorLight.color.setRGB(1, 0.85, 0.6).multiplyScalar(0.7 + 0.5 * lightOn);
  hallLights.forEach(
    (l, i) =>
      (l.intensity =
        4.5 * (shot === "shadow" && i === 3 && Math.floor(t * 25) % 4 === 0 ? 0.2 : 1)),
  );
  phoneLight.intensity = shot === "phone" ? 0.25 : 0;
  noteLight.intensity = shot === "note" || shot === "panelToNote" ? 2.2 : 0;

  // Wohnungstür
  doorHinge.rotation.y = -lerp(0.35, 1.25, eOut(ramp(t, EV.offen - 0.3, EV.offen + 0.4)));

  // Silhouette
  sil.root.visible = t >= EV.n18;
  sil.F.glow.visible = t >= EV.stimme;
  sil.head.rotation.z = 0.12 + 0.25 * eOut(ramp(t, EV.stimme, EV.stimme + 0.5));

  // Figur
  const pov =
    shot === "phone" ||
    shot === "panel" ||
    shot === "panelUp" ||
    shot === "panelToNote" ||
    shot === "note";
  fig.root.visible = !pov && shot !== "disp" && shot !== "flur" && shot !== "shadow";
  if (shot === "lobby") {
    const k = clamp((t - EV.tease) / (EV.n2 - EV.tease - 0.35));
    fig.root.position.set(lerp(-2.1, 0, eOut(k)), 0, lerp(2.4, 0.55, eOut(k)));
    fig.root.rotation.y = Math.PI + lerp(-0.7, 0, eOut(k));
    const ph = (t - EV.tease) * 2 * Math.PI * 1.25;
    const sw = (1 - smooth(ramp(k, 0.85, 1))) * 0.45;
    fig.legs[-1].hip.rotation.x = Math.sin(ph) * sw;
    fig.legs[1].hip.rotation.x = -Math.sin(ph) * sw;
    fig.legs[-1].kn.rotation.x = Math.max(0, -Math.sin(ph)) * sw * 1.2;
    fig.legs[1].kn.rotation.x = Math.max(0, Math.sin(ph)) * sw * 1.2;
    fig.arms[-1].sh.rotation.x = -Math.sin(ph) * sw * 0.7;
    fig.arms[1].sh.rotation.x = Math.sin(ph) * sw * 0.7;
    fig.hips.position.y = Math.abs(Math.cos(ph)) * 0.02 * (sw > 0.05 ? 1 : 0);
    fig.head.rotation.set(0, 0, 0);
    setExpr(fig, "neutral");
  } else {
    fig.root.position.copy(FIG);
    fig.root.position.z += 0.37 * eInOut(ramp(t, EV.n14 + 0.6, EV.n14 + 1.4));
    fig.root.rotation.y = 0;
    for (const s of [-1, 1]) {
      fig.legs[s].hip.rotation.x = 0;
      fig.legs[s].kn.rotation.x = 0;
      fig.arms[s].sh.rotation.set(0, 0, 0.08 * s);
      fig.arms[s].el.rotation.set(0, 0, 0);
    }
    fig.hips.position.y = 0;
    // Mimik + Blick
    let expr = "neutral";
    let look = [0, 0];
    let headYaw = 0;
    let headPitch = 0;
    if (t < EV.n4) {
      headYaw = -0.45;
      look = [-1, -0.2];
    } else if (t < EV.n6) {
      headPitch = -0.15;
      look = [0, 0.8];
    } else if (t < EV.n10) {
      expr = "worried";
      look = [0, 0.9];
      headPitch = -0.2;
    } else if (t < EV.n14) {
      expr = "shock";
      look = [0.3, 0.4];
    } else if (t < EV.namen) {
      expr = "worried";
      look = [0, 0];
    } else if (t < EV.n23) {
      expr = "shock";
      look = [0, 0];
    } else {
      expr = "worried";
      look = [-0.6 * ramp(t, EV.machst - 0.2, EV.machst + 0.1), 0.1];
    }
    setExpr(fig, expr, look);
    fig.head.rotation.set(headPitch, headYaw, 0);
    // Ruck: Figur taumelt
    const rk = t > EV.ruck ? Math.exp(-3 * (t - EV.ruck)) : 0;
    fig.chest.rotation.z = Math.sin((t - EV.ruck) * 14) * 0.12 * rk;
    fig.chest.rotation.x = 0.1 * rk;
    if (t > EV.ruck && t < EV.n14) {
      fig.arms[1].sh.rotation.z = 0.5 * rk + 0.08;
      fig.arms[-1].sh.rotation.z = -0.5 * rk - 0.08;
    }
    // Schweiß
    const sw = fig.F.sweat;
    const sOn = (t > EV.halt && t < EV.n7) || (t > EV.n23 && t < EV.n24);
    sw.visible = sOn;
    sw.position.y = 0.07 - 0.06 * clamp((t - (t > EV.n23 ? EV.n23 : EV.halt)) / 1.2);
    // Atmen
    fig.chest.position.y = 1.1 + Math.sin(t * 2.4) * 0.004;
  }

  // POV-Hand
  povHand.visible = shot === "panel";
  if (povHand.visible) {
    const p = btnWorld(7);
    const tIn = ramp(t, EV.drueckst, EV.drueckst + 0.32);
    const tPress =
      ramp(t, EV.press - 0.06, EV.press + 0.02) - ramp(t, EV.press + 0.12, EV.press + 0.25);
    const tOut = ramp(t, EV.press + 0.35, EV.press + 0.75);
    const start = V3(p.x - 0.12, p.y - 0.34, p.z - 0.3);
    const at = V3(p.x - 0.01, p.y - 0.03, p.z - 0.07 + 0.015 * tPress);
    povHand.position.copy(lerpV(lerpV(start, at, eOut(tIn)), start, eInOut(tOut)));
    povHand.lookAt(p);
  }
  // Handy
  phone.visible = shot === "phone";
  if (phone.visible) {
    const k = eOut(ramp(t, EV.n3, EV.n3 + 0.45));
    phone.position.set(0, lerp(1.1, 1.4, k), -0.6);
    phone.rotation.set(-0.08, 0, lerp(0.25, -0.04, k));
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
  const shot = cutAt(t)[2];
  const on = shot === "shoulder" && t >= EV.n19;
  const aOn = on && t >= EV.wA;
  const bOn = on && t >= EV.wB;
  const pop = (t0) => {
    const k = clamp((t - t0) / 0.22);
    return [k, 0.9 + 0.1 * eOut(k)];
  };
  if (callA) {
    const [k, s] = pop(EV.wA);
    callA.style.opacity = aOn ? String(k) : "0";
    const [x, y] = project(btnWorld("EG"));
    document.getElementById("callA-dot").setAttribute("cx", x.toFixed(1));
    document.getElementById("callA-dot").setAttribute("cy", y.toFixed(1));
    document
      .getElementById("callA-line")
      .setAttribute(
        "d",
        `M 700 1505 L ${Math.min(x, 1040).toFixed(1)} 1505 L ${x.toFixed(1)} ${(y + 34).toFixed(1)}`,
      );
    document
      .getElementById("callA-pill")
      .setAttribute("transform", `translate(500 1505) scale(${s}) translate(-500 -1505)`);
  }
  if (callB) {
    const [k, s] = pop(EV.wB);
    callB.style.opacity = bOn ? String(k) : "0";
    const [x, y] = project(V3(0, 1.3, HL));
    document.getElementById("callB-dot").setAttribute("cx", x.toFixed(1));
    document.getElementById("callB-dot").setAttribute("cy", y.toFixed(1));
    document
      .getElementById("callB-line")
      .setAttribute(
        "d",
        `M 540 420 L ${x.toFixed(1)} 420 L ${x.toFixed(1)} ${(y - 42).toFixed(1)}`,
      );
    document
      .getElementById("callB-pill")
      .setAttribute("transform", `translate(300 420) scale(${s}) translate(-300 -420)`);
  }
}

/* ---------------- Rendern ---------------- */
function renderAt(t) {
  t = clamp(t, 0, DUR);
  update(t);
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
