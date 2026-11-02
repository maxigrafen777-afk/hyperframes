// Generates one ElevenLabs voice clip per dialogue line + exact word timings.
// Run: ELEVENLABS_API_KEY=... node voices.mjs [lineId ...]
// Writes assets/vo/<id>.mp3 and assets/vo/timings.json; build.mjs picks them up.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY fehlt");
const here = (p) => new URL(p, import.meta.url);
const script = JSON.parse(readFileSync(here("./script.json"), "utf8"));
const voices = script.voices;
const only = process.argv.slice(2);
mkdirSync(here("./assets/vo"), { recursive: true });
const timingsFile = here("./assets/vo/timings.json");
const timings = existsSync(timingsFile) ? JSON.parse(readFileSync(timingsFile, "utf8")) : {};

// Character-level alignment -> words (split on whitespace, like the caption text).
function toWords(al) {
  const out = [];
  let cur = null;
  al.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = { text: "", start: al.character_start_times_seconds[i] };
    cur.text += ch;
    cur.end = al.character_end_times_seconds[i];
  });
  if (cur) out.push(cur);
  return out.map((w) => ({ text: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3) }));
}

async function tts(line, speed) {
  const v = voices[line.speaker];
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${v.voice_id}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: line.text,
        model_id: script.voiceModel || "eleven_multilingual_v2",
        language_code: "de",
        voice_settings: { ...v.settings, speed },
      }),
    },
  );
  if (!res.ok) throw new Error(`${line.id}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

for (const line of script.lines) {
  if (!voices[line.speaker] || (only.length && !only.includes(line.id))) continue;
  const win = line.end - line.start;
  let speed = voices[line.speaker].settings?.speed ?? 1;
  let data, dur;
  // Up to two tries: if the take overruns its window, re-take a bit faster (max voiceMaxSpeed).
  // Longer takes are fine: build.mjs re-lays the lines around the real lengths.
  for (let attempt = 0; attempt < 2; attempt++) {
    data = await tts(line, speed);
    const al = data.normalized_alignment || data.alignment;
    dur = al.character_end_times_seconds.at(-1);
    const max = script.voiceMaxSpeed ?? 1.1;
    if (dur <= win + 0.25 || speed >= max) break;
    speed = Math.min(max, +(speed * Math.min(1.1, dur / win)).toFixed(2));
  }
  const mp3 = here(`./assets/vo/${line.id}.mp3`);
  writeFileSync(mp3, Buffer.from(data.audio_base64, "base64"));
  const fileDur = +execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    mp3.pathname,
  ]).toString();
  timings[line.id] = {
    duration: +dur.toFixed(3),
    fileDuration: fileDur,
    speed,
    words: toWords(data.alignment),
  };
  console.log(
    `${line.id} ${line.speaker} ${dur.toFixed(2)}s (Fenster ${win.toFixed(2)}s, speed ${speed})`,
  );
}
writeFileSync(timingsFile, JSON.stringify(timings, null, 2));
console.log("fertig -> assets/vo/timings.json; jetzt: node build.mjs");
