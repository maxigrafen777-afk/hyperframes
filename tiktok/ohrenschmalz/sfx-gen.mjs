// Generates the extra sound effects listed in script.json "genSfx" with
// ElevenLabs sound generation. Skips files that already exist (pass --force).
// Run: ELEVENLABS_API_KEY=... node sfx-gen.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error("ELEVENLABS_API_KEY fehlt");
const script = JSON.parse(readFileSync(new URL("./script.json", import.meta.url), "utf8"));
const force = process.argv.includes("--force");
for (const s of script.genSfx || []) {
  const out = new URL(`./assets/sfx/gen-${s.id}.mp3`, import.meta.url);
  if (existsSync(out) && !force) continue;
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text: s.prompt, duration_seconds: s.duration, prompt_influence: 0.5 }),
  });
  if (!res.ok) throw new Error(`${s.id}: HTTP ${res.status} ${await res.text()}`);
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`gen-${s.id}.mp3`);
}

// Musikbett: die ersten 19,5 s des generierten Loops mit 1-s-Überblendungen
// auf 150 s verlängern (build.mjs schneidet auf die Videolänge).
import { execFileSync } from "node:child_process";
const bed = new URL("./assets/sfx/gen-bed.mp3", import.meta.url).pathname;
const long = new URL("./assets/sfx/bed-long.mp3", import.meta.url).pathname;
if (existsSync(bed) && (!existsSync(long) || force)) {
  const n = 8;
  const inputs = Array.from({ length: n }, () => ["-t", "19.5", "-i", bed]).flat();
  let chain = "[0:a][1:a]acrossfade=d=1[a1]";
  for (let i = 2; i < n; i++) chain += `;[a${i - 1}][${i}:a]acrossfade=d=1[a${i}]`;
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    ...inputs,
    "-filter_complex",
    chain,
    "-map",
    `[a${n - 1}]`,
    "-b:a",
    "160k",
    long,
  ]);
  console.log("bed-long.mp3");
}
