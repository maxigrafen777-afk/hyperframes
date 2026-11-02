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

async function tts(line) {
  const v = voices[line.speaker];
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${v.voice_id}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: line.text,
        model_id: model,
        language_code: "de",
        voice_settings: v.settings,
      }),
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
    if (!voices[line.speaker] || (only.length && !only.includes(line.id))) continue;
    let best = null;
    for (let take = 1; take <= QA.maxTakes; take++) {
      const data = await tts(line);
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
  const out = here(`./assets/vo/${line.id}.mp3`).pathname;
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    here(`./assets/vo/raw/${line.id}.mp3`).pathname,
    "-filter:a",
    `atrim=start=${cut},asetpts=PTS-STARTPTS,atempo=${k}`,
    "-b:a",
    "160k",
    out,
  ]);
  const fileDur = probe(out);
  const words = r.words.map((w) => ({
    text: w.text,
    start: +((w.start - cut) / k).toFixed(3),
    end: +((w.end - cut) / k).toFixed(3),
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
