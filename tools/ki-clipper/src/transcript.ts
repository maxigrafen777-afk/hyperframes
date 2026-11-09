import { readFile } from "node:fs/promises";

/** One transcribed word with its time in seconds, as `hyperframes transcribe` writes it. */
export interface Word {
  text: string;
  start: number;
  end: number;
}

/** A sentence-like span of words; clips are cut on these boundaries. */
export interface Sentence {
  index: number;
  start: number;
  end: number;
  text: string;
  firstWord: number;
  lastWord: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toWord(value: unknown): Word | null {
  if (!isRecord(value)) return null;
  const { text, start, end } = value;
  if (typeof text !== "string" || typeof start !== "number" || typeof end !== "number") return null;
  const trimmed = text.trim();
  // Drop music notes, replacement characters and empty tokens: they are not speech.
  if (!trimmed || /^[♪�\s]+$/u.test(trimmed)) return null;
  return { text: trimmed, start, end: Math.max(end, start) };
}

/** Reads the word list from a transcript file (a plain array, or `{ words: [...] }`). */
export function parseTranscript(json: unknown): Word[] {
  const list = Array.isArray(json)
    ? json
    : isRecord(json) && Array.isArray(json.words)
      ? json.words
      : [];
  const words: Word[] = [];
  for (const item of list) {
    const word = toWord(item);
    if (word) words.push(word);
  }
  words.sort((a, b) => a.start - b.start);
  return words;
}

export async function loadTranscript(path: string): Promise<Word[]> {
  return parseTranscript(JSON.parse(await readFile(path, "utf8")));
}

const SENTENCE_END = /[.!?…]["»“”')\]]*$/u;
const SOFT_BREAK = /[,;:–-]["»“”')\]]*$/u;

export interface SentenceOptions {
  /** A silence at least this long ends a sentence even without punctuation. */
  pauseSec?: number;
  /** Past this length a sentence ends at the next comma or pause. */
  softMaxSec?: number;
  /** Past this length a sentence ends after the current word, whatever follows. */
  hardMaxSec?: number;
}

/**
 * Groups words into sentences. Transcripts without punctuation still split on
 * pauses and length, so a clip boundary never lands in the middle of a word run.
 */
export function buildSentences(words: Word[], options: SentenceOptions = {}): Sentence[] {
  const pauseSec = options.pauseSec ?? 0.8;
  const softMaxSec = options.softMaxSec ?? 12;
  const hardMaxSec = options.hardMaxSec ?? 20;
  const sentences: Sentence[] = [];
  let first = 0;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = words[i + 1];
    const span = word.end - words[first].start;
    const gap = next ? next.start - word.end : Number.POSITIVE_INFINITY;
    const ends =
      !next ||
      SENTENCE_END.test(word.text) ||
      gap >= pauseSec ||
      (span >= softMaxSec && (SOFT_BREAK.test(word.text) || gap >= 0.3)) ||
      span >= hardMaxSec;
    if (!ends) continue;
    const slice = words.slice(first, i + 1);
    sentences.push({
      index: sentences.length,
      start: words[first].start,
      end: word.end,
      text: slice.map((w) => w.text).join(" "),
      firstWord: first,
      lastWord: i,
    });
    first = i + 1;
  }
  return sentences;
}

/** `mm:ss.s` for prompts and logs. */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}
