// Generates one ElevenLabs voice clip per dialogue line + exact word timings.
// Run: ELEVENLABS_API_KEY=... node voices.mjs [lineId ...]
//      node voices.mjs --retime   (only re-apply tempo to the raw takes, no API calls)
// Raw takes: assets/vo/raw/<id>.mp3 + raw/timings.json. Final clips (sped up by
// the speaker's "tempo" via ffmpeg atempo, pitch unchanged): assets/vo/<id>.mp3
// + assets/vo/timings.json; build.mjs picks them up.
// Lines may carry eleven_v3 audio tags ("[shouting] AUA!"); they steer the
// delivery and are dropped from the caption words.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const retimeOnly = process.argv.includes("--retime");
const key = process.env.ELEVENLABS_API_KEY;
if (!key && !retimeOnly) throw new Error("ELEVENLABS_API_KEY fehlt");
const here = (p) => new URL(p, import.meta.url);
const script = JSON.parse(readFileSync(here("./script.json"), "utf8"));
const voices = script.voices;
const model = script.voiceModel || "eleven_v3";
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
mkdirSync(here("./assets/vo/raw"), { recursive: true });
const rawFile = here("./assets/vo/raw/timings.json");
const raw = existsSync(rawFile) ? JSON.parse(readFileSync(rawFile, "utf8")) : {};
const probe = (f) =>
  +execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    f,
  ]).toString();

// Character-level alignment -> words, skipping [audio tags].
export function toWords(al) {
  const out = [];
  let cur = null;
  let inTag = false;
  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  al.characters.forEach((ch, i) => {
    if (ch === "[") {
      flush();
      inTag = true;
      return;
    }
    if (inTag) {
      if (ch === "]") inTag = false;
      return;
    }
    if (/\s/.test(ch)) return flush();
    if (!cur) cur = { text: "", start: al.character_start_times_seconds[i] };
    cur.text += ch;
    cur.end = al.character_end_times_seconds[i];
  });
  flush();
  return out
    .filter((w) => /[\p{L}\p{N}]/u.test(w.text))
    .map((w) => ({ text: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3) }));
}

// v3 versteht [Tags]; ältere Modelle (multilingual_v2) würden sie vorlesen.
const isV3 = model === "eleven_v3";
const spoken = (t) => (isV3 ? t : t.replace(/\[[^\]]*\]\s*/g, "").trim());
async function tts(line, take = 1) {
  const v = voices[line.speaker];
  // Gleichmäßiger Klang: fester Seed pro Figur, und (multilingual_v2) die
  // Nachbarsätze derselben Figur als Kontext.
  const same = script.lines.filter((l) => l.speaker === line.speaker && !l.reuse);
  const i = same.findIndex((l) => l.id === line.id);
  const body = {
    text: spoken(line.text),
    model_id: model,
    voice_settings: v.settings,
    seed: (v.seed ?? 4242) + take - 1,
  };
  if (isV3) body.language_code = "de";
  else {
    if (same[i - 1]) body.previous_text = spoken(same[i - 1].text);
    if (same[i + 1]) body.next_text = spoken(same[i + 1].text);
  }
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${v.voice_id}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(`${line.id}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

// Qualitätskontrolle: jeder Take wird per Spracherkennung (scribe) gegen den
// Soll-Text geprüft (Wortfehlerrate ohne Tags/Satzzeichen). Ist sie über
// qa.maxWer, wird neu erzeugt (bis qa.maxTakes); der beste Take gewinnt.
const QA = script.qa || { maxTakes: 1, maxWer: 1 };
const normWords = (s) =>
  s
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/-/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
function wer(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[a.length][b.length] / Math.max(1, a.length);
}
async function stt(buf) {
  const fd = new FormData();
  fd.append("model_id", "scribe_v1");
  fd.append("language_code", "deu");
  fd.append("file", new Blob([buf]), "take.mp3");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: fd,
  });
  if (!res.ok) throw new Error(`STT HTTP ${res.status} ${await res.text()}`);
  return (await res.json()).text || "";
}
if (!retimeOnly) {
  for (const line of script.lines) {
    if (!voices[line.speaker] || line.reuse || (only.length && !only.includes(line.id))) continue;
    let best = null;
    for (let take = 1; take <= QA.maxTakes; take++) {
      const data = await tts(line, take);
      const buf = Buffer.from(data.audio_base64, "base64");
      const heard = QA.maxTakes > 1 ? await stt(buf) : line.text;
      const score = wer(normWords(line.text), normWords(heard));
      console.log(`  ${line.id} Take ${take}: WER ${score.toFixed(2)}  "${heard}"`);
      if (!best || score < best.score) best = { data, buf, score, heard };
      if (score <= QA.maxWer) break;
    }
    const file = here(`./assets/vo/raw/${line.id}.mp3`).pathname;
    writeFileSync(file, best.buf);
    raw[line.id] = {
      text: line.text,
      heard: best.heard,
      wer: +best.score.toFixed(2),
      fileDuration: probe(file),
      words: toWords(best.data.alignment),
    };
    console.log(
      `${line.id} ${line.speaker} roh ${raw[line.id].fileDuration.toFixed(2)}s  WER ${best.score.toFixed(2)}`,
    );
    writeFileSync(rawFile, JSON.stringify(raw, null, 2));
  }
}

// Tempo pass: raw -> final clips and timings.
const timings = {};
for (const line of script.lines) {
  const r = raw[line.id];
  if (!voices[line.speaker] || !r) continue;
  const k = voices[line.speaker].tempo ?? 1;
  // Stille vor dem ersten Wort abschneiden (schnelles Hin und Her wie in den
  // Vorbildern), außer der Satz beginnt mit einem hörbaren Laut ([laughs] …).
  const audible = /^\s*\[(laughs|sighs|giggles|gasps|chuckles|screams)\]/i.test(line.text);
  const cut = audible ? 0 : Math.max(0, +(r.words[0].start - 0.15).toFixed(3));
  // Lange Kunstpausen im Satz (nach Punkt/Ausrufezeichen) auf maxPause kürzen,
  // damit es flüssig läuft; Wortzeiten werden mit verschoben.
  const maxPause = line.maxPause ?? script.maxPause ?? 0.3;
  const segs = [];
  let segStart = cut;
  for (let i = 0; i < r.words.length - 1; i++) {
    const gap = r.words[i + 1].start - r.words[i].end;
    if (gap > maxPause) {
      segs.push([segStart, r.words[i].end + maxPause / 2]);
      segStart = r.words[i + 1].start - maxPause / 2;
    }
  }
  segs.push([segStart, r.fileDuration]);
  const offs = [];
  let acc = 0;
  for (const [a, b] of segs) {
    offs.push(acc);
    acc += b - a;
  }
  const mapT = (t) => {
    let j = segs.findIndex(([a, b]) => t >= a - 1e-6 && t <= b + 1e-6);
    if (j < 0) j = segs.findIndex(([a]) => t < a); // in einer gekürzten Pause
    if (j < 0) j = segs.length - 1;
    const [a] = segs[j];
    return (offs[j] + Math.max(0, t - a)) / k;
  };
  const filter =
    segs
      .map(
        ([a, b], i) =>
          `[0:a]atrim=start=${a.toFixed(3)}:end=${b.toFixed(3)},asetpts=PTS-STARTPTS[s${i}]`,
      )
      .join(";") +
    `;${segs.map((_, i) => `[s${i}]`).join("")}concat=n=${segs.length}:v=0:a=1,atempo=${k}[out]`;
  const out = here(`./assets/vo/${line.id}.mp3`).pathname;
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    here(`./assets/vo/raw/${line.id}.mp3`).pathname,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-b:a",
    "160k",
    out,
  ]);
  const fileDur = probe(out);
  const words = r.words.map((w) => ({
    text: w.text,
    start: +mapT(w.start).toFixed(3),
    end: +mapT(w.end).toFixed(3),
  }));
  timings[line.id] = {
    duration: +Math.min(fileDur, words.at(-1).end + 0.15).toFixed(3),
    fileDuration: fileDur,
    tempo: k,
    words,
  };
  console.log(`${line.id} ${timings[line.id].duration.toFixed(2)}s (tempo ${k})`);
}
writeFileSync(here("./assets/vo/timings.json"), JSON.stringify(timings, null, 2));
console.log("fertig -> assets/vo/timings.json; jetzt: node build.mjs");
