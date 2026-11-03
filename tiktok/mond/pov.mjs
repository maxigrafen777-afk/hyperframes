// POV-Version (v5): filmische 3D-Szenen aus der Sicht des Zuschauers.
// Liest assets/beats.json (node build.mjs) und schreibt compositions/pov.html.
// Three.js zeichnet jedes Bild aus der Timeline-Zeit (render(t)); GSAP steuert
// die HTML-Ebenen (Handy, Finsternis-Brille, Karten, Texte).
import { readFileSync, writeFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const { T, L, DUR, WOB } = JSON.parse(readFileSync(here("./assets/beats.json"), "utf8"));
const f = (n) => +n.toFixed(3);
const W = 1080, H = 1920;
const C = { ink: "#0A1020", accent: "#FFD23F", hot: "#D9480F", ice: "#EAF6FF", red: "#E8505B" };

const blob = (pts, cx, cy, r) => {
  const P = pts.map(([x, y]) => [cx + x * r, cy + y * r]);
  const n = P.length;
  let d = `M ${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + " Z";
};
const WOLF = [[80, 300], [60, 215], [76, 150], [98, 110], [92, 42], [132, 84], [156, 34], [172, 92], [206, 92], [256, 30], [282, 44], [238, 112], [208, 150], [196, 214], [214, 300]];
// Szenen-Fenster (Echtzeit).
const SC = {
  beach: [0, T.savanna],
  savanna: [T.savanna, f(T.rise + 0.42)],
  sun: [f(T.rise + 0.42), T.toEarth],
  earth: [T.toEarth, f(T.wolf)],
  wolf: [f(T.wolf), f(T.cta - 0.1)],
  end: [f(T.cta - 0.1), DUR],
};

const body = `
<canvas id="gl" width="${W}" height="${H}"></canvas>
<div id="ghost-wrap" class="layer"><svg width="${W}" height="${H}"><circle id="ghost" cx="540" cy="800" r="181" fill="none" stroke="#F3EBCF" stroke-width="6" stroke-dasharray="20 14" stroke-linecap="round"/></svg></div>

<div id="phone">
  <div class="ph-screen">
    <div class="ph-status"><span>21:47</span><span>●●● 5G ▮</span></div>
    <div class="ph-app">Kalender</div>
    <div class="ph-month">April</div>
    <div class="ph-grid">
      ${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => `<div class="ph-dh">${d}</div>`).join("")}
      ${Array.from({ length: 28 }, (_, i) => {
        const d = i + 1;
        const cls = d === 4 ? "ph-d ph-easter" : "ph-d";
        return `<div class="${cls}"${d === 4 ? ' id="ph-easter"' : ""}>${d}</div>`;
      }).join("")}
    </div>
    <div class="ph-event" id="ph-event"><b>Ostersonntag</b><span id="ph-ev-t">ganztägig</span></div>
    <div class="ph-note" id="ph-note"><b>Kalender</b>Ostern: Termin nicht gefunden 🌑</div>
  </div>
</div>

<div id="mail">
  <div class="ph-screen">
    <div class="ph-status"><span>23:58</span><span>●●● 5G ▮</span></div>
    <div class="ml-top">‹ Posteingang</div>
    <div class="ml-from"><div class="ml-av">AG</div><div><b>Arbeitgeber Nachtschicht GmbH</b><span>an: Herr Wolf</span></div></div>
    <div class="ml-subj">Kündigung</div>
    <div class="ml-body">Sehr geehrter Herr Wolf,<br><br>mangels Vollmond entfällt Ihre Stelle.</div>
  </div>
</div>

<div id="flash" class="layer"></div>
<div id="vig" class="layer"></div>
<div id="grain" class="layer"></div>

<div id="hook" class="ov"><div class="hk hk-s">HEUTE NACHT</div><div class="hk">VERSCHWINDET</div><div class="hk hk-y">DER MOND</div></div>
<div id="first" class="ov"><div class="stk">DAS PASSIERT ALS ERSTES ↓</div></div>
<div id="tagA" class="tag"><span>Ø</span> ×400</div>
<div id="tagB" class="tag"><span>⟷</span> ×400</div>
<div id="stamp" class="ov"><div class="stp">NIE WIEDER</div></div>
<div id="deg" class="ov"><div class="deg-n" id="deg-n">23,4°</div><div class="sub">Neigung der Erdachse</div></div>
<div id="years" class="ov"><div class="yr" id="yr">+1 MIO. JAHRE</div></div>
<div id="hot" class="ov"><div class="card card-hot">SOMMER <span>=</span> WÜSTE</div></div>
<div id="cold" class="ov"><div class="card card-cold">WINTER <span>=</span> ARKTIS</div></div>
<div id="jobless" class="ov"><div class="stp stp-red">ARBEITSLOS</div></div>
<div id="cta" class="ov"><div class="ct">WAS WÜRDEST DU AM MEISTEN</div><div class="ct ct-y">VERMISSEN?</div><div class="pill">Schreib's in die Kommentare ↓</div></div>
`;

const css = `
  #root { background: #000; }
  #gl { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
  .layer, .abs { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
  #ghost-wrap { opacity: 0; }
  #flash { background: #fff; opacity: 0; }
  #vig { background: radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%); }
  #grain { background-image: url("assets/grain.png"); background-size: ${W}px ${H}px; mix-blend-mode: overlay; opacity: 0.18; }
  .ov { position: absolute; left: 0; right: 0; text-align: center; opacity: 0; }
  .hk, .ct, .deg-n, .yr, .sub, .tz-k { font-family: "Montserrat", sans-serif; font-weight: 900; color: #fff;
    -webkit-text-stroke: 16px ${C.ink}; paint-order: stroke fill; line-height: 1.04; }
  #hook { top: 368px; opacity: 1; }
  .hk { font-size: 104px; } .hk-s { font-size: 64px; } .hk-y { color: ${C.accent}; font-size: 132px; }
  #first { top: 400px; }
  .stk { display: inline-block; padding: 22px 36px; border-radius: 26px; background: #fff; color: ${C.ink};
    font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 54px; border: 7px solid ${C.ink}; }

  #phone { position: absolute; left: 230px; top: 330px; width: 620px; height: 1240px; border-radius: 86px;
    background: #111; border: 14px solid #2A2D33; box-shadow: 0 40px 80px rgba(0,0,0,0.6); opacity: 0; }
  .ph-screen { position: absolute; inset: 10px; border-radius: 70px; background: #F7F7F9; overflow: hidden;
    font-family: "Inter", sans-serif; color: #111; }
  .ph-status { display: flex; justify-content: space-between; padding: 30px 54px 0; font-weight: 700; font-size: 30px; }
  .ph-app { padding: 26px 44px 0; color: ${C.red}; font-size: 34px; font-weight: 700; }
  .ph-month { padding: 4px 44px 18px; font-size: 76px; font-weight: 900; }
  .ph-grid { display: grid; grid-template-columns: repeat(7, 1fr); padding: 0 26px; row-gap: 14px; text-align: center; }
  .ph-dh { font-size: 26px; color: #888; font-weight: 700; }
  .ph-d { font-size: 38px; font-weight: 700; height: 70px; line-height: 70px; }
  .ph-easter { color: #fff; background: ${C.red}; border-radius: 35px; margin: 0 6px; }
  .ph-event { margin: 30px 32px 0; padding: 24px 28px; border-left: 10px solid ${C.red}; background: #fff; border-radius: 18px;
    font-size: 38px; display: flex; flex-direction: column; gap: 6px; box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
  .ph-event span { font-size: 28px; color: #777; }
  .ph-note { position: absolute; left: 24px; right: 24px; top: 70px; padding: 26px 30px; border-radius: 34px;
    background: rgba(240,240,244,0.97); box-shadow: 0 16px 40px rgba(0,0,0,0.25); font-size: 34px; opacity: 0;
    display: flex; flex-direction: column; gap: 4px; }
  .ph-note b { font-size: 26px; color: #777; text-transform: uppercase; letter-spacing: 1px; }

  #glasses { opacity: 0; background: #000; }
  #sunview { position: absolute; inset: 0; }
  #sun { position: absolute; left: 314px; top: 534px; width: 452px; height: 452px; border-radius: 50%;
    background: radial-gradient(circle at 50% 50%, #FFE7A8 0%, #FFB347 45%, #F07A1A 78%, #B9460A 100%); }
  .gl-print { font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 54px; fill: #6A5F4A; letter-spacing: 4px; }

  #mail { position: absolute; left: 230px; top: 330px; width: 620px; height: 1240px; border-radius: 86px;
    background: #111; border: 14px solid #2A2D33; box-shadow: 0 40px 80px rgba(0,0,0,0.6); opacity: 0; }
  .ml-top { padding: 26px 40px 10px; color: #2F7BF6; font-size: 34px; font-weight: 600; }
  .ml-from { display: flex; gap: 22px; align-items: center; padding: 20px 40px; border-bottom: 2px solid #E4E4E8; }
  .ml-from b { display: block; font-size: 32px; } .ml-from span { font-size: 28px; color: #777; }
  .ml-av { width: 84px; height: 84px; border-radius: 42px; background: #6B7A99; color: #fff; font-weight: 800; font-size: 32px;
    display: flex; align-items: center; justify-content: center; flex: none; }
  .ml-subj { padding: 28px 40px 8px; font-size: 52px; font-weight: 900; }
  .ml-body { padding: 10px 40px; font-size: 34px; line-height: 1.35; color: #222; }
  .tag { position: absolute; top: 1030px; font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 76px;
    color: ${C.ink}; background: ${C.accent}; padding: 6px 26px; border-radius: 18px; border: 6px solid ${C.ink}; opacity: 0; }
  .tag span { opacity: 0.7; }
  #tagA { left: 110px; } #tagB { right: 110px; }
  #stamp { top: 1030px; }
  .stp { display: inline-block; color: ${C.accent}; font-family: "Montserrat", sans-serif; font-weight: 900; font-size: 112px;
    padding: 6px 30px 12px; border: 10px solid ${C.accent}; border-radius: 18px; background: ${C.ink}; }
  .stp-red { color: #fff; background: ${C.red}; border-color: #fff; font-size: 96px; }
  #jobless { top: 1010px; }
  #deg { top: 380px; } .deg-n { color: ${C.accent}; font-size: 120px; }
  .sub { font-size: 46px; -webkit-text-stroke: 12px ${C.ink}; margin-top: 8px; font-weight: 800; }
  #years { top: 1390px; } .yr { font-size: 64px; }
  #hot, #cold { top: 390px; }
  .card { display: inline-block; padding: 20px 40px; border-radius: 24px; font-family: "Montserrat", sans-serif;
    font-weight: 900; font-size: 74px; border: 8px solid ${C.ink}; }
  .card span { opacity: 0.6; } .card-hot { background: ${C.hot}; color: #fff; } .card-cold { background: ${C.ice}; color: ${C.ink}; }
  #cta, #teaser { top: 372px; }
  .ct { font-size: 64px; } .ct-y { color: ${C.accent}; font-size: 112px; }
  .tz-k { display: inline-block; font-size: 56px; color: ${C.ink}; background: ${C.accent}; -webkit-text-stroke: 0;
    padding: 8px 26px; border-radius: 14px; margin-bottom: 14px; }
  .pill { display: inline-block; margin-top: 22px; padding: 16px 34px; border-radius: 40px; background: ${C.ink};
    color: #fff; font-family: "Montserrat", sans-serif; font-weight: 800; font-size: 44px; border: 4px solid #fff; }
`;

/* ================= Overlay-Timeline (GSAP) ================= */
const overlayJs = `
    gsap.set(".ov, .tag, #phone, #mail", { transformOrigin: "50% 50%" });
    // Hook
    tl.to("#hook", { opacity: 0, y: -30, duration: 0.22, ease: "power2.in" }, ${T.hookOut});
    tl.fromTo("#first", { opacity: 0, scale: 0.5, rotation: -10 }, { opacity: 1, scale: 1, rotation: -3, duration: 0.3, ease: "back.out(2.2)" }, ${T.first});
    tl.to("#first", { opacity: 0, scale: 0.8, duration: 0.18 }, ${T.ostern} - 0.2);
    tl.fromTo("#flash", { opacity: 0 }, { opacity: 0.5, duration: 0.05 }, ${f(T.vanish + 0.4)});
    tl.to("#flash", { opacity: 0, duration: 0.35 }, ${f(T.vanish + 0.45)});
    tl.to("#ghost-wrap", { opacity: 0.85, duration: 0.5 }, ${f(T.vanish + 0.45)});
    tl.to("#ghost-wrap", { opacity: 0, duration: 0.3 }, ${f(SC.beach[1] - 0.3)});

    // POV: dein Handy kommt hoch, Ostern verschwindet aus dem Kalender.
    tl.fromTo("#phone", { opacity: 1, y: 1700, rotation: 6 }, { opacity: 1, y: 0, rotation: -3, duration: 0.55, ease: "power3.out" }, ${T.ostern});
    tl.to("#phone", { y: 12, rotation: -2, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: 1 }, ${f(T.ostern + 0.55)});
    tl.to("#phone", { x: 14, duration: 0.06 }, ${T.witz}); tl.to("#phone", { x: -10, duration: 0.06 }, ${T.witz} + 0.06); tl.to("#phone", { x: 0, duration: 0.06 }, ${T.witz} + 0.12);
    tl.to("#ph-easter", { backgroundColor: "#F7F7F9", color: "#C9C9CF", duration: 0.25 }, ${f(T.vollmond - 0.4)});
    tl.to("#ph-event", { opacity: 0.35, duration: 0.25 }, ${f(T.vollmond - 0.4)});
    tl.set("#ph-ev-t", { textContent: "entfällt" }, ${f(T.vollmond - 0.4)});
    tl.fromTo("#ph-note", { opacity: 0, y: -120 }, { opacity: 1, y: 0, duration: 0.35, ease: "back.out(1.6)" }, ${f(T.vollmond - 0.4)} + 0.15);
    tl.to("#phone", { y: 1700, rotation: 8, duration: 0.45, ease: "power3.in" }, ${T.osternOut} - 0.15);
    tl.set("#phone", { opacity: 0 }, ${T.osternOut} + 0.32);

    // Finsternis: ×400 und NIE WIEDER (das Bild macht Three.js).
    tl.fromTo("#tagA", { opacity: 0, scale: 0.4, rotation: -10 }, { opacity: 1, scale: 1, rotation: -4, duration: 0.3, ease: "back.out(2.4)" }, ${T.bigger});
    tl.fromTo("#tagB", { opacity: 0, scale: 0.4, rotation: 10 }, { opacity: 1, scale: 1, rotation: 4, duration: 0.3, ease: "back.out(2.4)" }, ${T.farther});
    tl.to(["#tagA", "#tagB"], { opacity: 0, duration: 0.15 }, ${T.stamp} - 0.45);
    tl.fromTo("#stamp", { opacity: 0, scale: 1.8, rotation: -14 }, { opacity: 1, scale: 1, rotation: -7, duration: 0.18, ease: "power4.in" }, ${T.stamp});
    tl.to("#stamp", { opacity: 0, duration: 0.2 }, ${SC.sun[1]} - 0.1);
    tl.fromTo("#flash", { opacity: 0 }, { opacity: 0.6, duration: 0.06, immediateRender: false }, ${f(T.stamp - 0.4)});
    tl.to("#flash", { opacity: 0, duration: 0.5 }, ${f(T.stamp - 0.34)});

    // Erde: Gradzahl, Jahre, Deutschland.
    tl.fromTo("#deg", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2.2)" }, ${T.deg});
    tl.fromTo("#years", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.25 }, ${T.years});
    tl.to(["#years", "#deg"], { opacity: 0, duration: 0.2 }, ${T.pin} - 0.3);
    tl.fromTo("#hot", { opacity: 0, scale: 0.5, rotation: -8 }, { opacity: 1, scale: 1, rotation: -3, duration: 0.3, ease: "back.out(2.2)" }, ${T.hot});
    tl.to("#hot", { opacity: 0, duration: 0.15 }, ${T.cold} - 0.1);
    tl.fromTo("#cold", { opacity: 0, scale: 0.5, rotation: 8 }, { opacity: 1, scale: 1, rotation: 3, duration: 0.3, ease: "back.out(2.2)" }, ${T.cold});
    tl.to("#cold", { opacity: 0, duration: 0.15 }, ${SC.wolf[0]} - 0.1);

    // Werwolf: Kündigungs-Mail auf deinem Handy.
    tl.fromTo("#mail", { opacity: 1, y: 1700, rotation: 6 }, { opacity: 1, y: 0, rotation: -3, duration: 0.5, ease: "power3.out" }, ${SC.wolf[0]});
    tl.fromTo("#jobless", { opacity: 0, scale: 1.8, rotation: -16 }, { opacity: 1, scale: 1, rotation: -8, duration: 0.18, ease: "power4.in" }, ${T.jobless});
    tl.to("#mail", { y: 1700, rotation: 8, duration: 0.4, ease: "power3.in" }, ${SC.wolf[1]} - 0.35);
    tl.set("#mail", { opacity: 0 }, ${SC.wolf[1]} + 0.1);
    tl.to("#jobless", { opacity: 0, duration: 0.2 }, ${SC.wolf[1]} - 0.15);

    // Kommentar-Frage + Teaser
    tl.fromTo("#cta", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2.2)" }, ${T.cta});
`;

/* ================= 3D (Three.js) ================= */
const glJs = `
    const SC = ${JSON.stringify(SC)}, TT = ${JSON.stringify(T)}, WOB = ${JSON.stringify(WOB)};
    const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
    const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const ease3 = (x) => 1 - Math.pow(1 - clamp(x), 3);
    const rnd = (i) => { let x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const noise = (t, k) => Math.sin(t * 1.7 + k) * 0.6 + Math.sin(t * 3.1 + k * 2.3) * 0.3 + Math.sin(t * 7.3 + k * 4.1) * 0.1;

    const canvas = document.getElementById("gl");
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(${W}, ${H}, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    const loader = new THREE.TextureLoader();
    const load = (u) => new Promise((res, rej) => loader.load(u, (t) => res(t), undefined, rej));
    const cubeLoad = () => new Promise((res, rej) => new THREE.CubeTextureLoader().setPath("assets/tex/")
      .load(["dark-s_px.jpg", "dark-s_nx.jpg", "dark-s_py.jpg", "dark-s_ny.jpg", "dark-s_pz.jpg", "dark-s_nz.jpg"], res, undefined, rej));

    let ready = false, lastT = 0, S = {}, SUNV = null;
    const skyMat = (cube) => new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uCube: { value: cube }, uBright: { value: 0.7 }, uTint: { value: new THREE.Color(0x0b1a3a) }, uTintAmt: { value: 0.5 } },
      vertexShader: "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform samplerCube uCube; uniform float uBright; uniform vec3 uTint; uniform float uTintAmt; varying vec3 vDir;" +
        "void main(){ vec3 c = textureCube(uCube, normalize(vDir)).rgb; c = pow(c, vec3(1.6)) * uBright * 1.6;" +
        "float h = clamp(normalize(vDir).y * 3.0, 0.0, 1.0); c += uTint * uTintAmt * (1.0 - h); gl_FragColor = vec4(c, 1.0); }",
    });

    async function build() {
      const [moonTex, waterN, day, clouds, lights, cube] = await Promise.all([
        load("assets/tex/moon_1024.jpg"), load("assets/tex/waternormals.jpg"), load("assets/tex/earth_atmos_2048.jpg"),
        load("assets/tex/earth_clouds_1024.png"), load("assets/tex/earth_lights_2048.png"), cubeLoad(),
      ]);
      [moonTex, day, clouds, lights].forEach((t) => (t.encoding = THREE.sRGBEncoding));
      waterN.wrapS = waterN.wrapT = THREE.RepeatWrapping;

      /* ---------- Strand ---------- */
      const beach = new THREE.Scene();
      const bCam = new THREE.PerspectiveCamera(70, ${W / H}, 0.1, 2000);
      const bSky = new THREE.Mesh(new THREE.BoxGeometry(1500, 1500, 1500), skyMat(cube)); beach.add(bSky);
      const MOON = new THREE.Vector3(0, 21.6, -94);
      const moonMat = new THREE.MeshBasicMaterial({ map: moonTex, color: 0xfff6e0 });
      const moon = new THREE.Mesh(new THREE.SphereGeometry(13, 64, 48), moonMat);
      moon.position.copy(MOON); moon.rotation.y = -1.2; beach.add(moon);
      // Risse: Billboard mit gezeichneten Bruchlinien.
      const cc = document.createElement("canvas"); cc.width = cc.height = 512; const cx = cc.getContext("2d");
      cx.lineCap = "round"; cx.lineJoin = "round";
      const crackPath = (seed, w, col) => { cx.strokeStyle = col; cx.lineWidth = w;
        for (let k = 0; k < 7; k++) { let x = 256, y = 256, a = rnd(seed + k) * Math.PI * 2; cx.beginPath(); cx.moveTo(x, y);
          for (let s = 0; s < 9; s++) { a += (rnd(seed + k * 31 + s) - 0.5) * 1.2; const l = 22 + rnd(seed + k * 7 + s * 3) * 20; x += Math.cos(a) * l; y += Math.sin(a) * l; cx.lineTo(x, y); }
          cx.stroke(); } };
      crackPath(3, 16, "rgba(255,120,30,0.9)"); crackPath(3, 6, "rgba(255,240,200,1)");
      const crackTex = new THREE.CanvasTexture(cc);
      const crack = new THREE.Mesh(new THREE.CircleGeometry(13, 48), new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0, depthWrite: false }));
      crack.position.copy(MOON).add(new THREE.Vector3(0, -0.4, 13.2)); beach.add(crack);
      // Brocken (für die Implosion).
      const frags = []; const fragGeo = new THREE.IcosahedronGeometry(1.9, 0);
      for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(fragGeo, moonMat); const th = rnd(i) * Math.PI * 2, r = Math.sqrt(rnd(i + 99)) * 12;
        const dir = new THREE.Vector3(Math.cos(th) * r, Math.sin(th) * r, 4 + rnd(i + 7) * 6);
        m.userData = { dir, spin: new THREE.Vector3(rnd(i + 1), rnd(i + 2), rnd(i + 3)).multiplyScalar(6), s: 0.5 + rnd(i + 5) * 0.9 };
        m.visible = false; beach.add(m); frags.push(m); }
      // Meer mit Mond-Glitzerbahn.
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1200, 200, 200), new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uN: { value: waterN }, uMoon: { value: 1 }, uMoonPos: { value: MOON }, uCam: { value: new THREE.Vector3() }, uSkyB: { value: 0.7 } },
        vertexShader: "uniform float uT; varying vec3 vW; void main(){ vec3 p = position; float w = sin(p.x*0.05+uT*1.3)*0.25 + sin(p.y*0.08+uT*1.7)*0.18; p.z += w; vec4 wp = modelMatrix*vec4(p,1.0); vW = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }",
        fragmentShader: "uniform sampler2D uN; uniform float uT; uniform float uMoon; uniform vec3 uMoonPos; uniform vec3 uCam; uniform float uSkyB; varying vec3 vW;" +
          "void main(){ vec2 uv = vW.xz*0.035; vec3 n1 = texture2D(uN, uv + vec2(uT*0.02, uT*0.015)).rgb*2.0-1.0; vec3 n2 = texture2D(uN, uv*2.3 - vec2(uT*0.03, -uT*0.01)).rgb*2.0-1.0;" +
          "vec3 N = normalize(vec3(n1.x+n2.x, 7.0, n1.y+n2.y)); vec3 V = normalize(uCam - vW); vec3 L = normalize(uMoonPos - vW); vec3 Hh = normalize(L+V);" +
          "float spec = pow(max(dot(N,Hh),0.0), 260.0) * 9.0 + pow(max(dot(N,Hh),0.0), 40.0)*0.25; float fres = pow(1.0 - max(dot(N,V),0.0), 4.0);" +
          "vec3 deep = vec3(0.004,0.015,0.03); vec3 sky = vec3(0.03,0.07,0.16)*uSkyB; vec3 c = mix(deep, sky, fres) + vec3(1.0,0.93,0.8)*spec*uMoon;" +
          "float d = length(vW.xz - uCam.xz); c = mix(c, sky*0.45*uSkyB, smoothstep(200.0, 700.0, d)); gl_FragColor = vec4(pow(c, vec3(1.0/2.2)), 1.0); }",
      }));
      sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.2, -585); beach.add(sea);
      const moonLight = new THREE.DirectionalLight(0xcfd8ff, 0.9); moonLight.position.copy(MOON); beach.add(moonLight);
      const bAmb = new THREE.AmbientLight(0x223355, 0.35); beach.add(bAmb);
      S.beach = { scene: beach, cam: bCam, sky: bSky, moon, crack, frags, sea, moonLight, bAmb, MOON };

      /* ---------- Savanne ---------- */
      const sav = new THREE.Scene();
      const sCam = new THREE.PerspectiveCamera(68, ${W / H}, 0.05, 2000);
      const sSky = new THREE.Mesh(new THREE.BoxGeometry(1500, 1500, 1500), skyMat(cube)); sav.add(sSky);
      sSky.material.uniforms.uBright.value = 1.0; sSky.material.uniforms.uTintAmt.value = 0.15;
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShaderMaterial({
        uniforms: { uFlash: { value: 1 }, uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) } },
        vertexShader: "varying vec3 vW; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }",
        fragmentShader: "uniform float uFlash; uniform vec3 uCam; uniform vec3 uDir; varying vec3 vW; void main(){ vec3 d = normalize(vW-uCam); float cone = smoothstep(0.9, 0.985, dot(d, uDir)); float fall = 1.0/(1.0+0.02*dot(vW-uCam,vW-uCam));" +
          "vec3 c = vec3(0.012,0.012,0.008) + vec3(0.55,0.45,0.25)*cone*fall*uFlash*2.0; gl_FragColor = vec4(pow(c, vec3(1.0/2.2)), 1.0); }",
      }));
      ground.rotation.x = -Math.PI / 2; sav.add(ground);
      // Gras: viele Halme, schwanken im Wind, von der Taschenlampe beleuchtet.
      const blade = new THREE.BufferGeometry(); blade.setAttribute("position", new THREE.Float32BufferAttribute([-0.03, 0, 0, 0.03, 0, 0, 0, 1, 0], 3));
      const N = 9000; const grass = new THREE.InstancedMesh(blade, new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: { uT: { value: 0 }, uFlash: { value: 1 }, uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) } },
        vertexShader: "uniform float uT; varying vec3 vW; varying float vH; void main(){ vec3 p = position; vH = p.y; vec4 wp = modelMatrix*instanceMatrix*vec4(p,1.0);" +
          "wp.x += sin(uT*1.6 + wp.z*0.3 + wp.x*0.2)*0.12*vH; vW = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }",
        fragmentShader: "uniform float uFlash; uniform vec3 uCam; uniform vec3 uDir; varying vec3 vW; varying float vH; void main(){ vec3 d = normalize(vW-uCam); float cone = smoothstep(0.9, 0.985, dot(d, uDir)); float fall = 1.0/(1.0+0.02*dot(vW-uCam,vW-uCam));" +
          "vec3 c = vec3(0.01,0.012,0.008)*(0.5+vH) + vec3(0.75,0.62,0.3)*cone*fall*uFlash*1.6*(0.35+vH); gl_FragColor = vec4(pow(c, vec3(1.0/2.2)), 1.0); }",
      }), N);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
      for (let i = 0; i < N; i++) { ps.set((rnd(i) - 0.5) * 40, 0, -3 - rnd(i + 0.5) * 45); q.setFromEuler(new THREE.Euler((rnd(i + 2) - 0.5) * 0.5, rnd(i + 3) * 6.28, (rnd(i + 4) - 0.5) * 0.5));
        sc.set(1, 0.5 + rnd(i + 6) * 0.9, 1); m4.compose(ps, q, sc); grass.setMatrixAt(i, m4); }
      sav.add(grass);
      // Akazie als Silhouette.
      const black = new THREE.MeshBasicMaterial({ color: 0x010102 });
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 6, 8), black); trunk.position.y = 3; tree.add(trunk);
      [[-1.5, 5.4, 0.6], [1.6, 5.6, -0.7]].forEach(([x, y, r]) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 3.2, 6), black); b.position.set(x * 0.5, y - 1, 0); b.rotation.z = r; tree.add(b); });
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(4.6, 24, 12), black); canopy.scale.set(1.5, 0.28, 1.1); canopy.position.y = 6.3; tree.add(canopy);
      tree.position.set(9, 0, -38); sav.add(tree);
      // Augen (Lichtreflexion im Dunkeln).
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe8ff7a });
      const eyes = []; [[-1.6, 0.55, -7], [1.2, 0.6, -11], [-4.2, 0.5, -15], [3.6, 0.65, -9]].forEach(([x, y, z], i) => {
        const g = new THREE.Group(); [-0.11, 0.11].forEach((dx) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), eyeMat); e.scale.set(1.4, 0.8, 1); e.position.x = dx; g.add(e); });
        g.position.set(x, y, z); g.scale.setScalar(0.0001); sav.add(g); eyes.push(g); });
      S.sav = { scene: sav, cam: sCam, ground, grass, eyes, sky: sSky };


      /* ---------- Totale Sonnenfinsternis ---------- */
      const ecl = new THREE.Scene();
      const xCam = new THREE.PerspectiveCamera(50, ${W / H}, 0.1, 100);
      const eclSky = new THREE.Mesh(new THREE.BoxGeometry(80, 80, 80), skyMat(cube)); eclSky.material.uniforms.uTintAmt.value = 0; ecl.add(eclSky);
      const unit = 10 * Math.tan(25 * Math.PI / 180) / 960; // Welt-Einheiten pro Pixel in 10 m Abstand
      const SR = 230 * unit, SY = (960 - 760) * unit;
      const sunM = new THREE.Mesh(new THREE.PlaneGeometry(SR * 8, SR * 8), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uT: { value: 0 }, uGlare: { value: 0 } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader: "uniform float uT; uniform float uGlare; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5); }" +
          "float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }" +
          "void main(){ vec2 p = (vUv-0.5)*8.0; float r = length(p); float disk = smoothstep(1.0, 0.985, r); float mu = sqrt(max(0.0, 1.0-r*r));" +
          "float gran = n(p*22.0 + uT*0.3)*0.5 + n(p*45.0 - uT*0.2)*0.5; vec3 c = mix(vec3(1.0,0.45,0.08), vec3(1.0,0.95,0.78), pow(mu,0.45)) * (0.9 + 0.12*gran) * disk;" +
          "float halo = (r > 1.0) ? exp(-(r-1.0)*2.2)*0.9 + exp(-(r-1.0)*0.6)*0.25 : 0.0; c += vec3(1.0,0.75,0.45)*halo*uGlare; gl_FragColor = vec4(c, 1.0); }" }));
      sunM.position.set(0, SY, -10); ecl.add(sunM);
      const corona = new THREE.Mesh(new THREE.PlaneGeometry(SR * 8, SR * 8), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uOn: { value: 0 }, uT: { value: 0 } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader: "uniform float uOn; uniform float uT; varying vec2 vUv; void main(){ vec2 p = (vUv-0.5)*8.0; float r = length(p); float a = atan(p.y, p.x);" +
          "float streak = 0.55 + 0.25*sin(a*7.0+1.3) + 0.15*sin(a*13.0-0.7) + 0.1*sin(a*29.0+uT*0.2); float k = r > 1.0 ? pow(1.0/r, 5.0)*streak*2.4 + smoothstep(1.06, 1.0, r)*1.5 : 0.0;" +
          "vec3 c = vec3(0.85,0.9,1.0)*k + vec3(1.0,0.25,0.35)*smoothstep(1.04,1.0,r)*step(1.0,r)*1.4; gl_FragColor = vec4(c*uOn, 1.0); }" }));
      corona.position.set(0, SY, -9.9); ecl.add(corona);
      const moonDisk = new THREE.Mesh(new THREE.CircleGeometry(SR * 1.015, 96), new THREE.MeshBasicMaterial({ map: moonTex, color: 0x0b0b0e }));
      moonDisk.position.set(0, SY, -9.8); ecl.add(moonDisk);
      S.ecl = { scene: ecl, cam: xCam, sunM, corona, moonDisk, SR, SY };
      /* ---------- Erde ---------- */
      const es = new THREE.Scene();
      const eCam = new THREE.PerspectiveCamera(40, ${W / H}, 0.01, 2000);
      const eSky = new THREE.Mesh(new THREE.BoxGeometry(1500, 1500, 1500), skyMat(cube)); es.add(eSky);
      eSky.material.uniforms.uTintAmt.value = 0; eSky.material.uniforms.uBright.value = 0.55;
      const SUN = new THREE.Vector3(-0.55, 0.35, 1).normalize(); SUNV = SUN.clone();
      const earthMat = new THREE.ShaderMaterial({
        uniforms: { uDay: { value: day }, uNight: { value: lights }, uSun: { value: SUN.clone() }, uHot: { value: 0 }, uCold: { value: 0 } },
        vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vObj; void main(){ vUv = uv; vObj = position; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader: "uniform sampler2D uDay; uniform sampler2D uNight; uniform vec3 uSun; uniform float uHot; uniform float uCold; varying vec2 vUv; varying vec3 vN; varying vec3 vObj;" +
          "void main(){ vec3 d = texture2D(uDay, vUv).rgb; vec3 n = texture2D(uNight, vUv).rgb; float l = dot(normalize(vN), uSun); float dayAmt = smoothstep(-0.12, 0.2, l);" +
          "float land = smoothstep(-0.03, 0.04, (d.r + d.g)*0.5 - d.b); float north = smoothstep(0.35, 0.62, vObj.y);" +
          "d = mix(d, vec3(0.93,0.7,0.4), uHot*north*land*0.95); d = mix(d, vec3(0.95,0.97,1.0), uCold*north*(0.55+0.45*land));" +
          "vec3 c = d * (0.06 + 1.1*max(l, 0.0)) + n*vec3(1.0,0.8,0.45)*1.6*(1.0-dayAmt)*(1.0-uCold*north);" +
          "gl_FragColor = vec4(c, 1.0); }",
      });
      const earthSpin = new THREE.Group(), earthTilt = new THREE.Group();
      const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earthMat); earthSpin.add(earth);
      const cloudM = new THREE.Mesh(new THREE.SphereGeometry(1.012, 96, 64), new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
        uniforms: { uC: { value: clouds }, uSun: earthMat.uniforms.uSun, uCold: earthMat.uniforms.uCold },
        vertexShader: "varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader: "uniform sampler2D uC; uniform vec3 uSun; varying vec2 vUv; varying vec3 vN; void main(){ float a = texture2D(uC, vUv).a; float l = max(dot(normalize(vN), uSun), 0.0); gl_FragColor = vec4(vec3(0.05 + 1.05*l), a*0.7); }" }));
      earthSpin.add(cloudM);
      const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 2.7, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })); earthTilt.add(axis);
      earthTilt.add(earthSpin); es.add(earthTilt);
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 48), new THREE.ShaderMaterial({
        side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uSun: { value: SUN } },
        vertexShader: "varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }",
        fragmentShader: "uniform vec3 uSun; varying vec3 vN; varying vec3 vW; void main(){ vec3 V = normalize(cameraPosition - vW); float rim = pow(1.0 - abs(dot(vN, V)), 3.0); float lit = 0.3 + 0.7*smoothstep(-0.3, 0.5, dot(-vN, uSun)); gl_FragColor = vec4(vec3(0.3,0.55,1.0)*rim*lit*0.9, 1.0); }",
      })); es.add(atmo);
      es.add(new THREE.DirectionalLight(0xffffff, 1.2).translateOnAxis(SUN, 10)); es.add(new THREE.AmbientLight(0x404050, 0.25));
      // Mondbahn (gestrichelt) und Geister-Mond; am Ende zwei echte Monde.
      const ringPts = []; for (let i = 0; i <= 128; i++) { const a = (i / 128) * Math.PI * 2; ringPts.push(new THREE.Vector3(Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5)); }
      const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineDashedMaterial({ color: 0xf3ebcf, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity: 0 }));
      ring.computeLineDistances(); ring.rotation.x = 0.18; es.add(ring);
      const ghostPts = []; for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; ghostPts.push(new THREE.Vector3(Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0)); }
      const ghostM = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ghostPts), new THREE.LineDashedMaterial({ color: 0xf3ebcf, dashSize: 0.05, gapSize: 0.035, transparent: true, opacity: 0 }));
      ghostM.computeLineDistances(); es.add(ghostM);
      const mmat = new THREE.MeshStandardMaterial({ map: moonTex, roughness: 1 });
      const m2a = new THREE.Mesh(new THREE.SphereGeometry(0.27, 48, 32), mmat), m2b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 48, 32), mmat);
      m2a.visible = m2b.visible = false; es.add(m2a, m2b);
      // Blickrichtung Europa/Afrika und Deutschland (Lage auf der Kugel nach three.js-UV).
      const ll = (lon, lat) => { const ph = (lon + 180) * Math.PI / 180, th = (90 - lat) * Math.PI / 180; return new THREE.Vector3(-Math.cos(ph) * Math.sin(th), Math.cos(th), Math.sin(ph) * Math.sin(th)); };
      const pinM = new THREE.Group(); const gp = ll(10, 51);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd23f })); dot.position.copy(gp).multiplyScalar(1.004); pinM.add(dot);
      const rp = []; for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; rp.push(new THREE.Vector3(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0)); }
      const pring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rp), new THREE.LineBasicMaterial({ color: 0xffd23f, transparent: true }));
      pring.position.copy(gp).multiplyScalar(1.006); pring.lookAt(gp.clone().multiplyScalar(2)); pinM.add(pring); pinM.visible = false; earthSpin.add(pinM);
      const face = ll(15, 25); const spin0 = Math.atan2(-face.x, face.z);
      S.earth = { pinM, scene: es, cam: eCam, earthTilt, earthSpin, earth, axis, ring, ghostM, m2a, m2b, ger: ll(10, 51), spin0, earthMat };
      ready = true;
    }

    // Kamera-Wackeln wie aus der Hand.
    const hand = (cam, t, amt) => { cam.rotation.x += noise(t, 1) * 0.006 * amt; cam.rotation.y += noise(t, 5) * 0.006 * amt; cam.rotation.z += noise(t, 9) * 0.004 * amt; };
    const tiltAt = (t) => { let a = 23.4; for (let i = 1; i < WOB.length; i++) { const [t0, a0] = WOB[i - 1], [t1, a1] = WOB[i]; if (t >= t0) { const k = clamp((t - t0) / (t1 - t0)); a = a0 + (a1 - a0) * (0.5 - 0.5 * Math.cos(Math.PI * k)); } } return a; };
    const tmp = new THREE.Vector3();

    function render(t) {
      lastT = t; if (!ready) return;
      let scene, cam;
      if (t < SC.beach[1] || (t >= SC.wolf[0] && t < SC.wolf[1])) {
        const B = S.beach; scene = B.scene; cam = B.cam;
        const wolf = t >= SC.wolf[0];
        const dark = wolf ? 1 : ss(TT.dark, TT.dark + 1.2, t);
        cam.position.set(0, 1.2, 6); cam.rotation.set(0, 0, 0, "YXZ");
        // Hook: Push-in, Zittern beim Reißen, Schlag bei der Implosion.
        const push = 1 - ease3(t / 0.8) ; cam.fov = 70 - 0 * push; cam.position.z = 6 + push * 6;
        cam.rotation.x = (6 + dark * 2) * Math.PI / 180;
        hand(cam, t, 1 + (t > TT.crack && t < TT.vanish + 0.6 ? 6 : 0));
        if (wolf) { cam.rotation.x = 10 * Math.PI / 180; }
        cam.updateProjectionMatrix();
        const k = clamp((t - TT.crack) / (TT.vanish - TT.crack));
        const alive = t < TT.vanish && !wolf;
        B.moon.visible = alive; B.moon.scale.setScalar(1 + 0.06 * k + Math.sin(t * 60) * 0.004 * k);
        B.crack.visible = alive; B.crack.material.opacity = ss(0, 0.4, k); B.crack.scale.setScalar(0.4 + 0.6 * k);
        const ft = t - TT.vanish;
        B.frags.forEach((m) => { const u = m.userData; m.visible = !wolf && ft >= 0 && ft < 0.75;
          if (!m.visible) return; const out = ease3(ft / 0.22) * 1.0, inn = ss(0.22, 0.7, ft);
          m.position.copy(B.MOON).addScaledVector(u.dir, out * (1 - inn)); m.scale.setScalar(u.s * (1 - inn));
          m.rotation.set(u.spin.x * ft, u.spin.y * ft, u.spin.z * ft); });
        const moonOn = alive ? 1 : wolf ? 0 : 1 - ss(0, 0.4, ft);
        B.sea.material.uniforms.uMoon.value = moonOn; B.sea.material.uniforms.uT.value = t; B.sea.material.uniforms.uCam.value.copy(cam.position);
        B.sea.material.uniforms.uSkyB.value = 1 - dark * 0.95;
        B.moonLight.intensity = 0.9 * moonOn; B.bAmb.intensity = 0.35 * (1 - dark * 0.85);
        tmp.copy(B.MOON).project(cam); const gEl = document.getElementById("ghost"); gEl.setAttribute("cx", ((tmp.x + 1) / 2 * ${W}).toFixed(1)); gEl.setAttribute("cy", ((1 - tmp.y) / 2 * ${H}).toFixed(1));
        { const e2 = B.MOON.clone().add(new THREE.Vector3(13, 0, 0)).project(cam); gEl.setAttribute("r", (Math.abs(e2.x - tmp.x) / 2 * ${W}).toFixed(1)); }
        B.sky.material.uniforms.uBright.value = 0.55 + dark * 0.6; B.sky.material.uniforms.uTintAmt.value = 0.55 * moonOn + 0.05;
      } else if (t < SC.savanna[1]) {
        const V = S.sav; scene = V.scene; cam = V.cam; const lt = t - SC.savanna[0];
        cam.position.set(0, 1.35, 1.5 - lt * 0.15);
        const rise = ss(TT.rise, TT.rise + 0.42, t);
        cam.rotation.set((-4 + rise * 80) * Math.PI / 180, (12 - lt * 6) * Math.PI / 180, 0, "YXZ");
        hand(cam, t, 2.2);
        cam.updateProjectionMatrix();
        // Taschenlampe: an, flackert, aus.
        const fl = TT.lions - 0.45; let flash = 1;
        if (t > fl) flash = (Math.sin((t - fl) * 70) > 0.2 ? 0.8 : 0.1) * (1 - ss(fl + 0.25, fl + 0.32, t));
        const dir = new THREE.Vector3(0, 0, -1).applyEuler(cam.rotation);
        [V.ground, V.grass].forEach((m) => { m.material.uniforms.uFlash.value = flash; m.material.uniforms.uCam.value.copy(cam.position); m.material.uniforms.uDir.value.copy(dir); });
        V.grass.material.uniforms.uT.value = t;
        V.eyes.forEach((g, i) => { const on = ss(TT.lions + i * 0.18, TT.lions + i * 0.18 + 0.12, t); const blink = Math.abs(t - (TT.lions + 1.3 + i * 0.2)) < 0.06 ? 0.1 : 1; g.scale.set(on, on * blink, on); });
      } else if (t < SC.sun[1]) {
        const X = S.ecl; scene = X.scene; cam = X.cam; cam.position.set(0, 0, 0); cam.rotation.set(0, 0, 0); hand(cam, t, 1.2); cam.updateProjectionMatrix();
        const slide = 1 - ease3((t - SC.sun[0]) / (TT.ghostSun + 0.9 - SC.sun[0]));
        const gone = ss(TT.stamp - 0.45, TT.stamp - 0.3, t);
        X.moonDisk.position.x = slide * X.SR * 2.2; X.moonDisk.scale.setScalar(Math.max(0.001, 1 - gone));
        const total = 1 - Math.min(1, Math.abs(X.moonDisk.position.x) / (X.SR * 0.08));
        X.corona.material.uniforms.uOn.value = total * (1 - gone); X.corona.material.uniforms.uT.value = t;
        X.sunM.material.uniforms.uT.value = t; X.sunM.material.uniforms.uGlare.value = Math.max(0.15 * (1 - total), gone);
      } else {
        const E = S.earth; scene = E.scene; cam = E.cam;
        const end = t >= SC.end[0];
        const tilt = tiltAt(t) * Math.PI / 180;
        E.earthTilt.rotation.z = -tilt;
        E.earthSpin.rotation.y = E.spin0 + (t - SC.earth[0]) * 0.035;
        E.axis.material.opacity = ss(TT.axis, TT.axis + 0.3, t) * (1 - ss(TT.pin - 0.3, TT.pin, t)) + (end ? 0.8 : 0);
        // Kamera: Anflug, dann auf Deutschland zu.
        const arrive = ease3((t - SC.earth[0]) / 1.4);
        let dist = 13 - arrive * 4.5; const look = new THREE.Vector3(0, -0.18, 0); let pos = new THREE.Vector3(0, 0.15, dist);
        const zoom = ss(TT.pin, TT.pin + 0.9, t) * (end ? 0 : 1);
        if (zoom > 0) { E.earth.updateMatrixWorld(true); tmp.copy(E.ger).applyMatrix4(E.earth.matrixWorld).normalize();
          const near = tmp.clone().multiplyScalar(4.3).add(new THREE.Vector3(0, -0.25, 0)); pos.lerp(near, zoom); look.lerp(tmp.clone().multiplyScalar(0.9).add(new THREE.Vector3(0, 0.12, 0)), zoom); }
        if (end) { pos.set(0, 0.6, 9.5); look.set(0, 0.95, 0); }
        cam.position.copy(pos); cam.lookAt(look);
        const shake = t > TT.tip && t < TT.tip + 0.9 ? 3 : 0.4; hand(cam, t, shake);
        { const sd = SUNV.clone(); if (zoom > 0) { tmp.copy(E.ger).applyMatrix4(E.earth.matrixWorld).normalize(); sd.lerp(tmp.clone().add(new THREE.Vector3(-0.15, 0.15, 0)).normalize(), zoom).normalize(); } E.earthMat.uniforms.uSun.value.copy(sd); }
        E.pinM.visible = !end && t > TT.pin && t < SC.earth[1]; E.pinM.children[1].scale.setScalar(1 + 0.6 * Math.abs(Math.sin((t - TT.pin) * 3)));
        E.earthMat.uniforms.uHot.value = ss(TT.hot, TT.hot + 0.6, t) * (1 - ss(TT.cold, TT.cold + 0.4, t)) * (end ? 0 : 1);
        E.earthMat.uniforms.uCold.value = ss(TT.cold, TT.cold + 0.6, t) * (end ? 0 : 1);
        const ringOn = (t < TT.orbitOut ? 1 : 1 - ss(TT.orbitOut, TT.orbitOut + 0.4, t)) * (t < SC.earth[0] + 0.2 ? 0 : 1);
        E.ring.material.opacity = (end ? 0.75 : ringOn * 0.75); E.ghostM.material.opacity = end ? 0.9 : ringOn * 0.9;
        const ga = (t - SC.earth[0]) * 0.6 + 2.2; E.ghostM.position.set(Math.cos(ga) * 2.5, Math.sin(ga) * 2.5 * Math.sin(0.18), Math.sin(ga) * 2.5 * Math.cos(0.18)); E.ghostM.lookAt(cam.position);
        const two = false; E.m2a.visible = E.m2b.visible = two;
        if (two) { const p = ss(0, TT.twoMoons + 0.4, t), p2 = 0; const a = 0;
          E.m2a.position.set(Math.cos(a + 3.3) * 2.5, 0, Math.sin(a + 3.3) * 2.5).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.18); E.m2a.scale.setScalar(Math.max(0.001, p));
          E.m2b.position.set(Math.cos(a + 0.1) * 2.5, 0, Math.sin(a + 0.1) * 2.5).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.18); E.m2b.scale.setScalar(Math.max(0.001, p2)); }
        cam.updateProjectionMatrix();
        // Gradzahl und Jahre in den HTML-Ebenen.
        document.getElementById("deg-n").textContent = tiltAt(t).toFixed(1).replace(".", ",") + "°";
        const yv = 1 + 49 * Math.pow(clamp((t - TT.years) / (TT.pin - 0.3 - TT.years)), 2);
        document.getElementById("yr").textContent = "+" + Math.round(yv) + " MIO. JAHRE";
      }
      renderer.render(scene, cam);
    }

    window.__hf = window.__hf || {}; window.__hf.buildReady = window.__hf.buildReady || {};
    window.__hf.buildReady.pov = build().then(() => render(lastT));
    tl.eventCallback("onUpdate", () => render(tl.time()));
    window.addEventListener("hf-seek", (e) => { const d = e && e.detail; if (d && typeof d.time === "number") render(d.time); });
`;

const page = `<template>
  <style>
    #root { position: absolute; inset: 0; overflow: hidden; }
    ${css}
  </style>
  <div id="root" data-composition-id="pov" data-width="${W}" data-height="${H}" data-layout-allow-overflow data-layout-allow-overlap>
${body}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
${overlayJs}
${glJs}
    tl.set({}, {}, ${DUR});
    window.__timelines["pov"] = tl;
  </script>
</template>
`;
writeFileSync(here("./compositions/pov.html"), page);
console.log("pov.html geschrieben", JSON.stringify(SC));
