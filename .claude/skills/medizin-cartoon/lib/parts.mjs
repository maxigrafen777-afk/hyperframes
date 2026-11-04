// Medizin-Cartoon parts: flat 2D SVG pieces (thick ink outline, flat fills,
// big googly eyes). Every function returns an SVG string. Ids passed in must
// be unique across the whole assembled video (prefix them per character).

export const C = {
  ink: "#2A1E1E",
  tooth: "#F8F7F1",
  toothShade: "#E6E3D8",
  gum: "#E9A2A9",
  gumDark: "#D47F8B",
  bone: "#E9E7D8",
  boneShade: "#DAD8C6",
  mouth: "#8B2C3C",
  lowerPink: "#D9848F",
  blood: "#D0142A",
  clot: "#6E1420",
  pain: "#E8364A",
  metal: "#B8BDC3",
  metalHi: "#E8EBEE",
  metalDark: "#7F868D",
  mouthIn: "#5A1520",
  tongue: "#E46B7A",
  wall: "#B8C58E",
  wallLow: "#AAB97F",
  trim: "#7F7B57",
  floor: "#A0978A",
  floorLine: "#7E766B",
  coat: "#FBFBFA",
  scrubs: "#8FB6E0",
  sweater: "#3D79C9",
  chair: "#3F7FD0",
  chairDark: "#2F63A8",
  pants: "#2B2B2E",
  skinLight: "#F3CFAE",
  skinMid: "#E2AE86",
  hairDark: "#2B211C",
  hairBrown: "#4A2E1F",
};

export const W = 5; // outline width
export const S = (w = W) =>
  `stroke="${C.ink}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

/* ---------- Eyes ---------- */
// Lid: rect hinged at the top of the eye; GSAP scaleY 0 = open, 1 = closed.
// Squeeze: "> <" pain eyes, toggled with opacity.
export function eye(id, { r = 52, lidFill = C.tooth, side = "L", pupil = 0.3, sw = W } = {}) {
  const k = r + 8;
  const chev =
    side === "L"
      ? `M ${-r * 0.45} ${-r * 0.4} L ${r * 0.4} 0 L ${-r * 0.45} ${r * 0.4}`
      : `M ${r * 0.45} ${-r * 0.4} L ${-r * 0.4} 0 L ${r * 0.45} ${r * 0.4}`;
  return `
  <g id="${id}">
    <clipPath id="${id}-clip"><circle r="${r}"/></clipPath>
    <circle r="${r}" fill="#fff"/>
    <g id="${id}-pupil"><circle r="${r * pupil}" fill="${C.ink}"/>${pupil >= 0.28 ? `<circle cx="${-r * 0.1}" cy="${-r * 0.12}" r="${r * 0.09}" fill="#fff"/>` : ""}</g>
    <g clip-path="url(#${id}-clip)"><rect id="${id}-lid" x="${-k}" y="${-k}" width="${2 * k}" height="${2 * k}" fill="${lidFill}" ${S(sw)} vector-effect="non-scaling-stroke"/></g>
    <g id="${id}-sq" opacity="0"><circle r="${r}" fill="#fff"/><path d="${chev}" fill="none" ${S(sw + 2)}/></g>
    <circle r="${r}" fill="none" ${S(sw)}/>
  </g>`;
}

/* ---------- Mouth states ---------- */
// children: -flat -smile -frown -wavy -smirk -open (open flaps with scaleY)
export function mouth(id, { s = 1, initial = "flat" } = {}) {
  const st = (n) => (n === initial ? "1" : "0");
  return `
  <g id="${id}" transform="scale(${s})">
    <path id="${id}-flat" opacity="${st("flat")}" d="M -16 0 Q 0 3 16 0" fill="none" ${S()}/>
    <path id="${id}-smile" opacity="${st("smile")}" d="M -26 -6 Q 0 24 26 -6" fill="none" ${S()}/>
    <path id="${id}-frown" opacity="${st("frown")}" d="M -20 8 Q 0 -8 20 8" fill="none" ${S()}/>
    <path id="${id}-wavy" opacity="${st("wavy")}" d="M -24 2 q 6 -8 12 0 t 12 0 t 12 0 t 12 0" fill="none" ${S(4)}/>
    <path id="${id}-smirk" opacity="${st("smirk")}" d="M -18 4 Q 4 8 22 -8" fill="none" ${S()}/>
    <g id="${id}-open" opacity="${st("open")}">
      <path d="M -24 -6 Q 0 -12 24 -6 Q 22 26 0 28 Q -22 26 -24 -6 Z" fill="${C.mouthIn}" ${S()}/>
      <path d="M -12 20 Q 0 10 12 20 Q 0 27 -12 20 Z" fill="${C.tongue}"/>
    </g>
  </g>`;
}

/* ---------- Teeth ---------- */
// Local origin: crown top centre. Crown to ~y280 (gum line), roots to ~y600.
export const TOOTH_PATH =
  "M -165 140 C -172 60 -150 0 -100 -6 C -62 -10 -42 14 0 12 C 42 10 62 -12 100 -6 C 152 0 172 60 166 140 C 162 210 148 270 136 330 C 128 420 126 500 118 570 C 112 612 70 612 66 570 L 50 390 C 44 350 -44 350 -50 390 L -66 570 C -70 612 -112 612 -118 570 C -126 500 -128 420 -136 330 C -148 270 -162 210 -165 140 Z";
const CANAL = "M -92 575 C -94 470 -96 380 -80 300 C -40 268 40 268 80 300 C 96 380 94 470 92 575";

export function toothBody(id, { halo = true, gumLine = 270 } = {}) {
  return `
  <g id="${id}">
    ${
      halo
        ? `<clipPath id="${id}-hc"><rect x="-260" y="${gumLine}" width="520" height="460"/></clipPath>
    <path d="${TOOTH_PATH}" fill="${C.gum}" stroke="${C.gum}" stroke-width="40" stroke-linejoin="round" clip-path="url(#${id}-hc)"/>
    <path d="${TOOTH_PATH}" fill="none" ${S(4)} transform="scale(1.075 1.03) translate(0 -6)" clip-path="url(#${id}-hc)"/>`
        : ""
    }
    <path d="${TOOTH_PATH}" fill="${C.tooth}" ${S()}/>
    <path d="M -140 150 C -140 220 -128 270 -116 320" fill="none" stroke="${C.toothShade}" stroke-width="16" stroke-linecap="round"/>
    <path d="${CANAL}" fill="none" stroke="${C.gum}" stroke-width="7" stroke-linecap="round"/>
  </g>`;
}

// A tooth character: body + face. `face` = {x,y,rot,r,gap,mouthY,mouthS}
export function toothFace(
  id,
  {
    r = 52,
    gap = 62,
    mouthY = 92,
    mouthS = 1,
    mouthInit = "flat",
    lidFill = C.tooth,
    pupil = 0.3,
    sw = W,
  } = {},
) {
  return `
  <g id="${id}-face">
    <g transform="translate(${-gap} 0)">${eye(`${id}-eyeL`, { r, side: "L", lidFill, pupil, sw })}</g>
    <g transform="translate(${gap} 0)">${eye(`${id}-eyeR`, { r, side: "R", lidFill, pupil, sw })}</g>
    <g transform="translate(0 ${mouthY})">${mouth(`${id}-m`, { s: mouthS, initial: mouthInit })}</g>
  </g>`;
}

/* ---------- Instruments (tip at 0,0, pointing down, body upward) ---------- */
export function syringe(id) {
  return `
  <g id="${id}">
    <line x1="0" y1="0" x2="0" y2="-170" stroke="${C.metalDark}" stroke-width="6" stroke-linecap="round"/>
    <rect x="-14" y="-200" width="28" height="34" rx="4" fill="${C.metal}" ${S(4)}/>
    <rect x="-38" y="-520" width="76" height="322" rx="10" fill="#EEF6F9" ${S()}/>
    <rect x="-30" y="-330" width="60" height="126" rx="6" fill="#9FD3E8"/>
    <path d="M -38 -300 h 22 M -38 -360 h 22 M -38 -420 h 22 M -38 -480 h 22" ${S(3)}/>
    <rect id="${id}-plunger" x="-12" y="-660" width="24" height="150" fill="${C.metal}" ${S(4)}/>
    <rect x="-52" y="-680" width="104" height="22" rx="8" fill="${C.metal}" ${S(4)}/>
    <rect x="-56" y="-540" width="112" height="22" rx="8" fill="${C.metal}" ${S(4)}/>
  </g>`;
}

export function scalpel(id) {
  return `
  <g id="${id}">
    <path d="M 0 0 C 14 -34 30 -76 26 -118 L -8 -118 L -8 -24 Z" fill="${C.metalHi}" ${S(4)}/>
    <rect x="-14" y="-520" width="30" height="406" rx="8" fill="${C.metal}" ${S(4)}/>
    <path d="M -10 -470 h 22 M -10 -450 h 22 M -10 -430 h 22 M -10 -410 h 22" ${S(3)}/>
  </g>`;
}

export function elevator(id) {
  return `
  <g id="${id}">
    <path d="M -12 -90 L -18 -12 C -12 6 12 6 18 -12 L 12 -90 Z" fill="${C.metalHi}" ${S(4)}/>
    <rect x="-11" y="-640" width="22" height="552" fill="${C.metal}" ${S(4)}/>
    <rect x="-24" y="-1000" width="48" height="370" rx="12" fill="${C.metal}" ${S(4)}/>
    <path d="M -20 -940 h 40 M -20 -900 h 40 M -20 -860 h 40 M -20 -820 h 40 M -20 -780 h 40" ${S(3)}/>
  </g>`;
}

// Forceps: two arms around a pivot at (0,-230); rotate -armL/-armR to open.
export function forceps(id) {
  const arm = (sx) => `
    <path d="M ${sx * 6} -230 C ${sx * 10} -170 ${sx * 40} -90 ${sx * 34} -10 C ${sx * 32} 6 ${sx * 14} 8 ${sx * 10} -6 C ${sx * 8} -60 ${sx * 4} -150 ${sx * -2} -230 Z" fill="${C.metalHi}" ${S(4)}/>
    <path d="M ${sx * -4} -230 C ${sx * 30} -380 ${sx * 70} -560 ${sx * 62} -760 L ${sx * 30} -760 C ${sx * 36} -560 ${sx * 10} -400 ${sx * -16} -250 Z" fill="${C.metal}" ${S(4)}/>`;
  return `
  <g id="${id}">
    <g id="${id}-armL">${arm(-1)}</g>
    <g id="${id}-armR">${arm(1)}</g>
    <circle cy="-232" r="16" fill="${C.metal}" ${S(4)}/>
  </g>`;
}

/* ---------- Effects ---------- */
export function painStar(id, { r = 60 } = {}) {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 ? r * 0.55 : r;
    pts.push(`${(Math.cos(a) * rr).toFixed(1)} ${(Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<g id="${id}"><path d="M ${pts.join(" L ")} Z" fill="none" stroke="${C.pain}" stroke-width="8" stroke-linejoin="round" opacity="0.9"/><circle r="${r * 0.45}" fill="${C.pain}" opacity="0.25"/></g>`;
}

export function stitch(id, s = 1) {
  return `<g id="${id}" transform="scale(${s})"><path d="M -22 -22 L 22 22 M 22 -22 L -22 22" fill="none" stroke="${C.ink}" stroke-width="7" stroke-linecap="round"/></g>`;
}

/* ---------- Captions ---------- */
// Split each line's window across its words by length (until a real voice
// track gives word timestamps). Returns [{text,start,end}].
export function wordTimes(lines) {
  const out = [];
  for (const ln of lines) {
    const words = ln.text.split(/\s+/).filter(Boolean);
    const weight = words.map((w) => 1.2 + w.replace(/[^\p{L}\p{N}]/gu, "").length * 0.32);
    const total = weight.reduce((a, b) => a + b, 0);
    let t = ln.start;
    words.forEach((w, i) => {
      const d = ((ln.end - ln.start) * weight[i]) / total;
      out.push({ text: w, start: +t.toFixed(3), end: +(t + d).toFixed(3), speaker: ln.speaker });
      t += d;
    });
  }
  return out;
}

export const CAPTION_CSS = `
  .cap {
    position: absolute; left: 0; right: 0; top: var(--cap-y, 1270px);
    text-align: center; opacity: 0;
    font-family: "Montserrat", sans-serif; font-weight: 900;
    font-size: 84px; letter-spacing: 1px; line-height: 1;
    color: #fff; text-transform: uppercase;
    -webkit-text-stroke: 14px #1d1414; paint-order: stroke fill;
    text-shadow: 0 6px 0 rgba(0,0,0,0.35);
  }`;

/* ---------- More instruments ---------- */
// Dental handpiece with a round bur (tip at 0,0).
export function drill(id) {
  return `
  <g id="${id}">
    <rect x="-4" y="-70" width="8" height="64" fill="${C.metalDark}" ${S(3)}/>
    <circle r="11" fill="${C.metalHi}" ${S(4)}/>
    <rect x="-28" y="-128" width="56" height="62" rx="16" fill="${C.metal}" ${S(4)}/>
    <path d="M -22 -122 L -30 -700 L 30 -700 L 22 -122 Z" fill="${C.metal}" ${S(4)}/>
    <rect x="-34" y="-420" width="68" height="26" rx="6" fill="${C.metalDark}" ${S(4)}/>
    <path d="M -10 -680 L -12 -440 M 10 -680 L 12 -440" stroke="${C.metalHi}" stroke-width="6" stroke-linecap="round"/>
  </g>`;
}

// Needle holder: forceps body with a curved suture needle + thread at the tip.
export function needleHolder(id) {
  return `
  <g id="${id}">
    ${forceps(id + "-f")}
    <path d="M -2 4 A 30 30 0 0 1 52 -8" fill="none" stroke="${C.metalDark}" stroke-width="6" stroke-linecap="round"/>
    <path id="${id}-thread" d="M -2 4 C -40 40 -20 90 -70 120" fill="none" stroke="#1F2A44" stroke-width="4" stroke-linecap="round"/>
  </g>`;
}

export function drop(id, { s = 1, fill = "#BFE6F5" } = {}) {
  return `<path id="${id}" d="M 0 -18 C 8 -6 12 2 12 8 A 12 12 0 0 1 -12 8 C -12 2 -8 -6 0 -18 Z" fill="${fill}" ${S(3)} transform="scale(${s})"/>`;
}

export function chip(id, { s = 1 } = {}) {
  return `<path id="${id}" d="M -10 -6 L 4 -12 L 12 0 L 4 10 L -9 7 Z" fill="${C.bone}" ${S(3)} transform="scale(${s})"/>`;
}

// Nagelschere/Nagelspalter: Spitze bei (0,0), zeigt nach unten; Klingen -bladeL/-bladeR
// drehen um den Drehpunkt (0,-120) (svgOrigin "0 -120").
export function scissors(id) {
  const blade = (sx) => `
    <path d="M ${sx * 2} 0 C ${sx * 14} -40 ${sx * 20} -90 ${sx * 16} -120 L ${sx * -6} -120 C ${sx * -4} -80 ${sx * -2} -40 ${sx * 2} 0 Z" fill="${C.metalHi}" ${S(4)}/>
    <path d="M ${sx * 16} -120 C ${sx * 30} -200 ${sx * 50} -280 ${sx * 60} -330 L ${sx * 40} -336 C ${sx * 28} -280 ${sx * 8} -200 ${sx * -6} -120 Z" fill="${C.metal}" ${S(4)}/>
    <ellipse cx="${sx * 66}" cy="-390" rx="38" ry="56" fill="none" stroke="${C.ink}" stroke-width="22"/>
    <ellipse cx="${sx * 66}" cy="-390" rx="38" ry="56" fill="none" stroke="${C.metal}" stroke-width="12"/>`;
  return `
  <g id="${id}">
    <g id="${id}-bladeL">${blade(-1)}</g>
    <g id="${id}-bladeR">${blade(1)}</g>
    <circle cy="-120" r="11" fill="${C.metalDark}" ${S(3)}/>
  </g>`;
}

// Wattestäbchen / Applikator: Watte-Spitze bei (0,0), Stiel nach oben.
export function swab(id, { tip = "#F7F3E8" } = {}) {
  return `
  <g id="${id}">
    <rect x="-7" y="-640" width="14" height="620" rx="6" fill="#E9DCC4" ${S(4)}/>
    <ellipse id="${id}-tip" cx="0" cy="-20" rx="22" ry="34" fill="${tip}" ${S(4)}/>
  </g>`;
}

// Laparoskopie-Instrument: Spitze bei (0,0), langer Schaft nach oben.
// kind: "grasp" (Greifer, -jawL/-jawR um "0 -34"), "sci" (Schere, gleiche Backen-Ids),
// "clip" (Clip-Zange mit -clip), "scope" (Kamera mit Lichtkegel -beam).
export function lapTool(id, kind = "grasp") {
  const shaft = `<rect x="-11" y="-1600" width="22" height="1560" fill="${C.metal}" ${S(4)}/>
    <rect x="-15" y="-64" width="30" height="30" rx="6" fill="${C.metalDark}" ${S(3)}/>`;
  const jaws = (len, curve) => `
    <g id="${id}-jawL"><path d="M -3 -34 C ${-10 - curve} -20 ${-14 - curve} ${-len / 2} -12 ${-len + 34} L -2 ${-len + 30} C -4 -16 -1 -24 3 -34 Z" fill="${C.metalHi}" ${S(4)}/></g>
    <g id="${id}-jawR"><path d="M 3 -34 C ${10 + curve} -20 ${14 + curve} ${-len / 2} 12 ${-len + 34} L 2 ${-len + 30} C 4 -16 1 -24 -3 -34 Z" fill="${C.metalHi}" ${S(4)}/></g>`;
  let tip = "";
  if (kind === "grasp") tip = jaws(34, 4);
  if (kind === "sci") tip = jaws(34, 10);
  if (kind === "clip")
    tip = `${jaws(34, 2)}<g id="${id}-clip"><path d="M -10 -6 L -10 10 L 10 10 L 10 -6" fill="none" stroke="${C.ink}" stroke-width="11" stroke-linecap="round"/><path d="M -10 -6 L -10 10 L 10 10 L 10 -6" fill="none" stroke="#D9DDE1" stroke-width="6" stroke-linecap="round"/></g>`;
  if (kind === "scope")
    tip = `<path id="${id}-beam" d="M -12 0 L -190 460 C -60 520 60 520 190 460 L 12 0 Z" fill="#FFF6CF" opacity="0.32"/>
    <rect x="-16" y="-34" width="32" height="34" rx="8" fill="${C.metalDark}" ${S(4)}/><circle cy="-4" r="11" fill="#BFE8FF" ${S(3)}/>`;
  return `<g id="${id}">${shaft}${tip}</g>`;
}
