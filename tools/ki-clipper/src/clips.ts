import type { Sentence } from "./transcript.ts";

/** What the model proposes: a sentence range plus the copy for the clip. */
export interface ClipCandidate {
  startSentence: number;
  endSentence: number;
  hookTitle: string;
  reason: string;
  score: number;
}

/** A clip after validation, with times in the source video. */
export interface ClipPlan {
  /** 1 is the strongest clip. */
  rank: number;
  slug: string;
  start: number;
  end: number;
  duration: number;
  startSentence: number;
  endSentence: number;
  hookTitle: string;
  reason: string;
  score: number;
  text: string;
  /**
   * Horizontal position of the 9:16 window in a landscape source:
   * -1 = left edge, 0 = centre, 1 = right edge.
   */
  cropX: number;
}

export interface ResolveOptions {
  count: number;
  minSec: number;
  maxSec: number;
  videoDuration: number;
  /** Lead-in before the first word, so the clip does not start mid-breath. */
  padStartSec?: number;
  /** Tail after the last word. */
  padEndSec?: number;
}

export interface ResolveResult {
  clips: ClipPlan[];
  issues: string[];
}

interface Range {
  startSentence: number;
  endSentence: number;
  start: number;
  end: number;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function rangeTimes(
  sentences: Sentence[],
  a: number,
  b: number,
  opts: Required<ResolveOptions>,
): Range {
  const start = Math.max(0, sentences[a].start - opts.padStartSec);
  const end = Math.min(opts.videoDuration, sentences[b].end + opts.padEndSec);
  return { startSentence: a, endSentence: b, start, end };
}

/**
 * Moves a sentence range into [minSec, maxSec] by dropping or adding whole
 * sentences, so a cut always lands on a sentence boundary.
 */
export function fitRange(
  sentences: Sentence[],
  startSentence: number,
  endSentence: number,
  options: ResolveOptions,
): Range | null {
  const opts = withDefaults(options);
  const last = sentences.length - 1;
  let a = clampInt(Math.min(startSentence, endSentence), 0, last);
  let b = clampInt(Math.max(startSentence, endSentence), 0, last);
  let range = rangeTimes(sentences, a, b, opts);
  const length = () => range.end - range.start;

  while (length() > opts.maxSec && b > a) {
    b--;
    range = rangeTimes(sentences, a, b, opts);
  }
  // Grow at the end first (the payoff usually follows), then at the start.
  while (length() < opts.minSec) {
    const growEnd = b < last ? rangeTimes(sentences, a, b + 1, opts) : null;
    const growStart = a > 0 ? rangeTimes(sentences, a - 1, b, opts) : null;
    if (growEnd && growEnd.end - growEnd.start <= opts.maxSec) {
      b++;
      range = growEnd;
    } else if (growStart && growStart.end - growStart.start <= opts.maxSec) {
      a--;
      range = growStart;
    } else break;
  }
  const finalLength = length();
  if (finalLength < opts.minSec || finalLength > opts.maxSec) return null;
  return range;
}

function withDefaults(options: ResolveOptions): Required<ResolveOptions> {
  return { padStartSec: 0.15, padEndSec: 0.4, ...options };
}

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "clip";
}

/** How many non-overlapping clips of at least `minSec` fit into the video. */
export function maxClipsFor(videoDuration: number, minSec: number): number {
  return Math.max(0, Math.floor(videoDuration / minSec));
}

/**
 * Turns model proposals into the final clip list: fixes lengths on sentence
 * boundaries, drops overlaps (keeping the higher score), keeps the best `count`.
 */
export function resolveClips(
  candidates: ClipCandidate[],
  sentences: Sentence[],
  options: ResolveOptions,
): ResolveResult {
  const issues: string[] = [];
  if (sentences.length === 0) return { clips: [], issues: ["Das Transkript enthält keine Sätze."] };
  const accepted: Array<Range & { candidate: ClipCandidate }> = [];
  const ordered = [...candidates].sort((x, y) => y.score - x.score);

  for (const candidate of ordered) {
    if (accepted.length >= options.count) break;
    const label = `Vorschlag „${candidate.hookTitle}“ (Sätze ${candidate.startSentence}–${candidate.endSentence})`;
    const range = fitRange(sentences, candidate.startSentence, candidate.endSentence, options);
    if (!range) {
      issues.push(`${label}: lässt sich nicht auf ${options.minSec}–${options.maxSec} s bringen.`);
      continue;
    }
    const clash = accepted.find((r) => range.start < r.end && r.start < range.end);
    if (clash) {
      issues.push(`${label}: überschneidet sich mit „${clash.candidate.hookTitle}“.`);
      continue;
    }
    accepted.push({ ...range, candidate });
  }

  const usedSlugs = new Set<string>();
  const clips = accepted.map((r, i): ClipPlan => {
    const rank = i + 1;
    let slug = `${String(rank).padStart(2, "0")}-${slugify(r.candidate.hookTitle)}`;
    while (usedSlugs.has(slug)) slug += "-x";
    usedSlugs.add(slug);
    return {
      rank,
      slug,
      start: round(r.start),
      end: round(r.end),
      duration: round(r.end - r.start),
      startSentence: r.startSentence,
      endSentence: r.endSentence,
      hookTitle: r.candidate.hookTitle.trim(),
      reason: r.candidate.reason.trim(),
      score: r.candidate.score,
      text: sentences
        .slice(r.startSentence, r.endSentence + 1)
        .map((s) => s.text)
        .join(" "),
      cropX: 0,
    };
  });
  return { clips, issues };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
