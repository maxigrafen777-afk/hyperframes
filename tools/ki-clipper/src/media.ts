import { copyFile, mkdir, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { hasCommand, runOrThrow } from "./run.ts";
import { HEIGHT, WIDTH, FPS } from "./composition.ts";

export function isUrl(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

export interface DownloadOptions {
  cookies?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Downloads a video with yt-dlp (max. 1080p, MP4) into `dir`. Reuses an earlier download. */
export async function downloadVideo(
  url: string,
  dir: string,
  options: DownloadOptions = {},
): Promise<{ path: string; title: string | null; channel: string | null; url: string }> {
  await mkdir(dir, { recursive: true });
  const target = join(dir, "source.mp4");
  const infoPath = join(dir, "source.info.json");
  if (!existsSync(target)) {
    if (!(await hasCommand("yt-dlp"))) {
      throw new Error(
        "yt-dlp ist nicht installiert. Installation: `pip install yt-dlp` (oder `brew install yt-dlp`).",
      );
    }
    const args = [
      "--no-playlist",
      "-f",
      "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b",
      "--merge-output-format",
      "mp4",
      "--write-info-json",
      "--no-progress",
      "-o",
      join(dir, "source.%(ext)s"),
    ];
    if (options.cookies) args.push("--cookies", options.cookies);
    args.push(url);
    try {
      await runOrThrow("yt-dlp", args, { inheritStderr: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not a bot|Sign in to confirm/i.test(message)) {
        throw new Error(
          "YouTube verlangt eine Anmeldung (Bot-Prüfung). Exportiere die Cookies deines eigenen " +
            "YouTube-Kontos als cookies.txt und übergib sie mit --cookies cookies.txt, " +
            "oder lade das Video selbst herunter und gib die MP4-Datei an.\n\n" +
            message,
        );
      }
      throw error;
    }
    if (!existsSync(target)) {
      const produced = (await readdir(dir)).find(
        (f) => f.startsWith("source.") && !f.endsWith(".json"),
      );
      if (!produced) throw new Error("yt-dlp hat keine Videodatei geschrieben.");
      await transcodeToMp4(join(dir, produced), target);
    }
  }
  let title: string | null = null;
  let channel: string | null = null;
  if (existsSync(infoPath)) {
    const info: unknown = JSON.parse(await readFile(infoPath, "utf8"));
    if (isRecord(info)) {
      title = str(info.title);
      channel = str(info.channel) ?? str(info.uploader);
    }
  }
  return { path: target, title, channel, url };
}

async function transcodeToMp4(input: string, output: string): Promise<void> {
  await runOrThrow("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    input,
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    output,
  ]);
}

/** Copies a local file into the work folder so the run is self-contained. */
export async function importLocalVideo(input: string, dir: string): Promise<string> {
  if (!existsSync(input)) throw new Error(`Datei nicht gefunden: ${input}`);
  await mkdir(dir, { recursive: true });
  const target = join(dir, "source.mp4");
  if (!existsSync(target)) {
    if (input.toLowerCase().endsWith(".mp4")) await copyFile(input, target);
    else await transcodeToMp4(input, target);
  }
  return target;
}

export async function probeVideo(
  path: string,
): Promise<{ duration: number; width: number; height: number }> {
  const { stdout } = await runOrThrow("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:stream_side_data=rotation:format=duration",
    "-of",
    "json",
    path,
  ]);
  const data: unknown = JSON.parse(stdout);
  let width = 0;
  let height = 0;
  let duration = 0;
  let rotation = 0;
  if (isRecord(data)) {
    const streams = Array.isArray(data.streams) ? data.streams : [];
    const stream: unknown = streams[0];
    if (isRecord(stream)) {
      width = Number(stream.width) || 0;
      height = Number(stream.height) || 0;
      const sideData = Array.isArray(stream.side_data_list) ? stream.side_data_list : [];
      for (const entry of sideData) {
        if (isRecord(entry) && typeof entry.rotation === "number") rotation = entry.rotation;
      }
    }
    if (isRecord(data.format)) duration = Number(data.format.duration) || 0;
  }
  if (Math.abs(rotation) === 90 || Math.abs(rotation) === 270) [width, height] = [height, width];
  if (!width || !height || !duration) throw new Error(`Konnte das Video nicht lesen: ${path}`);
  return { duration, width, height };
}

/** ffmpeg crop filter for a 9:16 window; `cropX` -1…1 moves it left/right in landscape footage. */
export function cropFilter(width: number, height: number, cropX: number): string {
  const target = WIDTH / HEIGHT;
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  const shift = Math.max(-1, Math.min(1, cropX));
  if (width / height > target) {
    const cw = even(height * target);
    const x = Math.round(((width - cw) / 2) * (1 + shift));
    return `crop=${cw}:${even(height)}:${x}:0`;
  }
  const ch = even(width / target);
  const y = Math.round((height - ch) / 2);
  return `crop=${even(width)}:${ch}:0:${y}`;
}

/** Cuts [start, start+duration) out of the source and reframes it to 1080×1920. */
export async function cutVertical(
  source: string,
  out: string,
  start: number,
  duration: number,
  size: { width: number; height: number },
  cropX: number,
): Promise<void> {
  const vf = `${cropFilter(size.width, size.height, cropX)},scale=${WIDTH}:${HEIGHT}:flags=lanczos,setsar=1,fps=${FPS}`;
  await runOrThrow("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    start.toFixed(3),
    "-i",
    source,
    "-t",
    duration.toFixed(3),
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "19",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    out,
  ]);
}

export async function extractAudio(source: string, out: string): Promise<void> {
  await runOrThrow("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    source,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    out,
  ]);
}
