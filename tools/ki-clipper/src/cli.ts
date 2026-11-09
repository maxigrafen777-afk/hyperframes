#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { maxClipsFor, resolveClips, slugify, type ClipCandidate, type ClipPlan } from "./clips.ts";
import { DEFAULT_MODEL, findHighlights } from "./highlights.ts";
import {
  cutVertical,
  downloadVideo,
  extractAudio,
  importLocalVideo,
  isUrl,
  probeVideo,
} from "./media.ts";
import { checkProject, renderProject, writeClipProject } from "./project.ts";
import { hyperframes } from "./run.ts";
import { buildSentences, formatTime, loadTranscript, type Sentence } from "./transcript.ts";

const HELP = `ki-clipper – macht aus einem langen Video TikTok-Clips (9:16, deutsche Untertitel, Hook-Titel, MP4)

Aufruf:
  bun src/cli.ts <youtube-url | video.mp4> --rights-confirmed [Optionen]

Optionen:
  --rights-confirmed     Pflicht: bestätigt, dass die Nutzungsrechte für das Video vorliegen
  --out <ordner>         Arbeitsordner (Standard: ./clips/<videoname>)
  --clips <n>            Anzahl Clips (Standard: 10)
  --min <s> / --max <s>  Länge pro Clip in Sekunden (Standard: 30 / 60)
  --language <code>      Sprache der Transkription (Standard: de)
  --engine <name>        Transkription: auto, parakeet, whisper, heygen (Standard: auto)
  --model <id>           Claude-Modell für die Auswahl (Standard: ${DEFAULT_MODEL})
  --cookies <datei>      cookies.txt für yt-dlp, wenn YouTube eine Anmeldung verlangt
  --plan-only            Nur analysieren und clips.json schreiben, nichts rendern
  --replan               clips.json neu von der KI erstellen lassen, auch wenn sie existiert
  --only <n,n>           Nur diese Clips (Rang) bauen und rendern
  --skip-check           hyperframes lint/check überspringen
  -h, --help             Diese Hilfe

Ablauf und Wiederaufnahme: Jeder Schritt schreibt sein Ergebnis in den Arbeitsordner
(source/, transcript/, clips.json, projects/, renders/). Ein erneuter Aufruf überspringt
fertige Schritte. clips.json darf von Hand bearbeitet werden (Start, Ende, hookTitle, cropX)
und wird beim nächsten Aufruf so verwendet.`;

function log(message: string): void {
  console.error(`▸ ${message}`);
}

function num(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} muss eine positive Zahl sein.`);
  return n;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isClipPlan(value: unknown): value is ClipPlan {
  return (
    isRecord(value) &&
    typeof value.rank === "number" &&
    typeof value.slug === "string" &&
    typeof value.start === "number" &&
    typeof value.end === "number" &&
    typeof value.hookTitle === "string"
  );
}

async function readPlan(path: string): Promise<ClipPlan[]> {
  const data: unknown = JSON.parse(await readFile(path, "utf8"));
  const list = isRecord(data) && Array.isArray(data.clips) ? data.clips : [];
  return list.filter(isClipPlan).map((clip) => ({
    ...clip,
    // Hand edits may change start/end; keep duration and crop consistent with them.
    duration: Math.round((clip.end - clip.start) * 1000) / 1000,
    cropX: typeof clip.cropX === "number" ? clip.cropX : 0,
  }));
}

async function transcribe(
  source: string,
  dir: string,
  language: string,
  engine: string,
): Promise<string> {
  const transcriptPath = join(dir, "transcript.json");
  if (existsSync(transcriptPath)) return transcriptPath;
  await mkdir(dir, { recursive: true });
  const audio = join(dir, "audio.wav");
  log("Extrahiere Audio …");
  await extractAudio(source, audio);
  log(`Transkribiere (${language}, Engine: ${engine}) – das dauert je nach Länge einige Minuten …`);
  const args = ["transcribe", "audio.wav", "--language", language, "--json"];
  if (engine !== "auto") args.push("--engine", engine);
  // whisper's default model is English-only; pick the multilingual one for other languages.
  if (engine === "whisper" && language !== "en") args.push("--model", "small");
  const result = await hyperframes(args, { cwd: dir });
  if (result.code !== 0 || !existsSync(transcriptPath)) {
    const tail = (result.stdout + result.stderr).trim().split("\n").slice(-8).join("\n");
    throw new Error(
      `Transkription fehlgeschlagen. Für Deutsch lokal: \`hyperframes models install parakeet\`.\n${tail}`,
    );
  }
  return transcriptPath;
}

async function planClips(opts: {
  sentences: Sentence[];
  count: number;
  minSec: number;
  maxSec: number;
  videoDuration: number;
  videoTitle: string | null;
  model: string;
}): Promise<{ clips: ClipPlan[]; issues: string[]; candidates: ClipCandidate[] }> {
  const resolveOpts = {
    count: opts.count,
    minSec: opts.minSec,
    maxSec: opts.maxSec,
    videoDuration: opts.videoDuration,
  };
  log(`Lasse ${opts.model} die besten ${opts.count} Momente auswählen …`);
  // Ask for a few spares: some proposals drop out on length or overlap.
  const candidates = await findHighlights({
    sentences: opts.sentences,
    count: opts.count + 3,
    minSec: opts.minSec,
    maxSec: opts.maxSec,
    videoTitle: opts.videoTitle,
    model: opts.model,
  });
  let result = resolveClips(candidates, opts.sentences, resolveOpts);
  if (result.clips.length < opts.count) {
    log(`Nur ${result.clips.length} gültige Clips – frage nach weiteren …`);
    const more = await findHighlights({
      sentences: opts.sentences,
      count: opts.count - result.clips.length + 2,
      minSec: opts.minSec,
      maxSec: opts.maxSec,
      videoTitle: opts.videoTitle,
      model: opts.model,
      exclude: result.clips,
    });
    candidates.push(...more);
    result = resolveClips(candidates, opts.sentences, resolveOpts);
  }
  return { ...result, candidates };
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "rights-confirmed": { type: "boolean", default: false },
      out: { type: "string" },
      clips: { type: "string" },
      min: { type: "string" },
      max: { type: "string" },
      language: { type: "string", default: "de" },
      engine: { type: "string", default: "auto" },
      model: { type: "string", default: DEFAULT_MODEL },
      cookies: { type: "string" },
      "plan-only": { type: "boolean", default: false },
      replan: { type: "boolean", default: false },
      only: { type: "string" },
      "skip-check": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const input = positionals[0];
  if (values.help || !input) {
    console.log(HELP);
    process.exit(input || values.help ? 0 : 1);
  }
  if (!values["rights-confirmed"]) {
    throw new Error(
      "Bitte nur Videos verarbeiten, für die du die Nutzungsrechte hast, und das mit --rights-confirmed bestätigen.",
    );
  }
  const count = Math.round(num(values.clips, 10, "clips"));
  const minSec = num(values.min, 30, "min");
  const maxSec = num(values.max, 60, "max");
  if (minSec > maxSec) throw new Error("--min darf nicht größer als --max sein.");

  const name = isUrl(input)
    ? `yt-${slugify(new URL(input).pathname.split("/").pop() || "video")}`
    : slugify(basename(input).replace(/\.[^.]+$/, ""));
  const work = resolve(values.out ?? join("clips", name));
  await mkdir(work, { recursive: true });
  log(`Arbeitsordner: ${work}`);

  // 1. Source
  let source: string;
  let title: string | null = null;
  let channel: string | null = null;
  if (isUrl(input)) {
    log("Lade Video herunter …");
    const dl = await downloadVideo(input, join(work, "source"), { cookies: values.cookies });
    source = dl.path;
    title = dl.title;
    channel = dl.channel;
  } else {
    source = await importLocalVideo(resolve(input), join(work, "source"));
    title = basename(input);
  }
  const info = await probeVideo(source);
  log(
    `Quelle: ${title ?? basename(source)} · ${formatTime(info.duration)} · ${info.width}×${info.height}`,
  );
  await writeFile(
    join(work, "rights.json"),
    `${JSON.stringify({ input, title, channel, rightsConfirmed: true, confirmedAt: new Date().toISOString() }, null, 2)}\n`,
  );

  // 2. Transcript
  const transcriptPath = await transcribe(
    source,
    join(work, "transcript"),
    values.language,
    values.engine,
  );
  const words = await loadTranscript(transcriptPath);
  if (words.length === 0) throw new Error("Das Transkript ist leer – enthält das Video Sprache?");
  const sentences = buildSentences(words);
  await writeFile(
    join(work, "transcript", "sentences.json"),
    `${JSON.stringify(sentences, null, 2)}\n`,
  );
  log(`Transkript: ${words.length} Wörter, ${sentences.length} Sätze`);

  // 3. Clip plan
  const planPath = join(work, "clips.json");
  let clips: ClipPlan[];
  if (existsSync(planPath) && !values.replan) {
    clips = await readPlan(planPath);
    log(`Verwende vorhandene clips.json (${clips.length} Clips). Neu planen: --replan`);
  } else {
    const fit = maxClipsFor(info.duration, minSec);
    const target = Math.min(count, fit);
    if (target < count)
      log(`Das Video ist zu kurz für ${count} Clips à ≥${minSec} s – plane ${target}.`);
    if (target === 0) throw new Error(`Das Video ist kürzer als ${minSec} s.`);
    const plan = await planClips({
      sentences,
      count: target,
      minSec,
      maxSec,
      videoDuration: info.duration,
      videoTitle: title,
      model: values.model,
    });
    clips = plan.clips;
    for (const issue of plan.issues) log(`Hinweis: ${issue}`);
    await writeFile(
      planPath,
      `${JSON.stringify({ source: input, title, model: values.model, minSec, maxSec, clips, rejected: plan.issues }, null, 2)}\n`,
    );
  }
  if (clips.length === 0) throw new Error("Keine gültigen Clips gefunden.");
  for (const c of clips) {
    log(
      `#${c.rank} ${formatTime(c.start)}–${formatTime(c.end)} (${c.duration.toFixed(1)} s) „${c.hookTitle}“`,
    );
  }
  if (values["plan-only"]) {
    log(`Plan gespeichert: ${planPath}`);
    return;
  }

  // 4–6. Per clip: reframe, composition, check, render
  const only = values.only ? new Set(values.only.split(",").map((s) => Number(s.trim()))) : null;
  const renders = join(work, "renders");
  await mkdir(renders, { recursive: true });
  const indexPath = join(renders, "index.json");
  // Keep entries of clips this run does not touch (e.g. with --only).
  const previous: unknown = existsSync(indexPath)
    ? JSON.parse(await readFile(indexPath, "utf8"))
    : [];
  const index: Array<Record<string, unknown>> = (Array.isArray(previous) ? previous : []).filter(
    (entry): entry is Record<string, unknown> =>
      isRecord(entry) && typeof entry.rank === "number" && (only ? !only.has(entry.rank) : false),
  );
  for (const clip of clips) {
    if (only && !only.has(clip.rank)) continue;
    const dir = join(work, "projects", clip.slug);
    await mkdir(join(dir, "assets"), { recursive: true });
    log(`[${clip.rank}/${clips.length}] Schneide 9:16 …`);
    await cutVertical(
      source,
      join(dir, "assets", "clip.mp4"),
      clip.start,
      clip.duration,
      info,
      clip.cropX,
    );
    await writeClipProject(dir, clip, words);
    let check = { ok: true, summary: "übersprungen" };
    if (!values["skip-check"]) {
      log(`[${clip.rank}/${clips.length}] Prüfe Komposition …`);
      check = await checkProject(dir);
      if (!check.ok) log(`Warnung: ${check.summary}`);
    }
    log(`[${clip.rank}/${clips.length}] Rendere MP4 …`);
    const output = join(renders, `${clip.slug}.mp4`);
    await renderProject(dir, output);
    log(`Fertig: ${output}`);
    index.push({
      rank: clip.rank,
      file: output,
      project: dir,
      hookTitle: clip.hookTitle,
      start: clip.start,
      end: clip.end,
      duration: clip.duration,
      score: clip.score,
      reason: clip.reason,
      check: check.summary,
    });
  }
  index.sort((a, b) => Number(a.rank) - Number(b.rank));
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  log(`${index.length} Clips in ${renders}`);
}

main().catch((error: unknown) => {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
