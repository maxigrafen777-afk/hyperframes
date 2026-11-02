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

if (!retimeOnly) {
  for (const line of script.lines) {
    if (!voices[line.speaker] || (only.length && !only.includes(line.id))) continue;
    const data = await tts(line);
    const file = here(`./assets/vo/raw/${line.id}.mp3`).pathname;
    writeFileSync(file, Buffer.from(data.audio_base64, "base64"));
    raw[line.id] = { text: line.text, fileDuration: probe(file), words: toWords(data.alignment) };
    console.log(
      `${line.id} ${line.speaker} roh ${raw[line.id].fileDuration.toFixed(2)}s  ${raw[line.id].words.map((w) => w.text).join(" ")}`,
    );
  }
  writeFileSync(rawFile, JSON.stringify(raw, null, 2));
}

// Tempo pass: raw -> final clips and timings.
const timings = {};
for (const line of script.lines) {
  const r = raw[line.id];
  if (!voices[line.speaker] || !r) continue;
  const k = voices[line.speaker].tempo ?? 1;
  const out = here(`./assets/vo/${line.id}.mp3`).pathname;
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    here(`./assets/vo/raw/${line.id}.mp3`).pathname,
    "-filter:a",
    `atempo=${k}`,
    "-b:a",
    "160k",
    out,
  ]);
  const fileDur = probe(out);
  const words = r.words.map((w) => ({
    text: w.text,
    start: +(w.start / k).toFixed(3),
    end: +(w.end / k).toFixed(3),
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
