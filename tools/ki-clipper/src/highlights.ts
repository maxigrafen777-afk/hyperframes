import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ClipCandidate } from "./clips.ts";
import { formatTime, type Sentence } from "./transcript.ts";

export const DEFAULT_MODEL = "claude-opus-5-5";

const CandidateSchema = z.object({
  clips: z.array(
    z.object({
      start_sentence: z.number().int(),
      end_sentence: z.number().int(),
      hook_title: z.string(),
      reason: z.string(),
      score: z.number().int(),
    }),
  ),
});

export interface HighlightRequest {
  sentences: Sentence[];
  count: number;
  minSec: number;
  maxSec: number;
  videoTitle?: string | null;
  model?: string;
  /** Sentence ranges that are already taken (a second pass asks for others). */
  exclude?: Array<{ startSentence: number; endSentence: number }>;
}

const SYSTEM = `Du bist ein erfahrener Social-Media-Editor für deutschsprachige TikTok- und Reels-Clips.
Du bekommst das vollständige, nummerierte Transkript eines langen Videos (Satz-Index, Start–Ende, Text).
Deine Aufgabe: die stärksten, eigenständig verständlichen Momente finden, die als Kurzclip funktionieren.

Ein guter Clip:
- hat in den ersten 3 Sekunden einen Hook (Frage, steile These, Überraschung, Zahl, Konflikt, Emotion);
- ist ohne den Rest des Videos verständlich (keine Bezüge wie „wie vorhin gesagt“ am Anfang);
- hat einen Spannungsbogen und endet auf einer Pointe, Erkenntnis oder einem klaren Schluss;
- beginnt und endet an Satzgrenzen.

Hook-Titel:
- Deutsch, höchstens 7 Wörter, neugierig machend, aber inhaltlich wahr (kein irreführender Clickbait);
- keine Emojis, keine Hashtags, keine Anführungszeichen.

Score: 1–100, wie viral/spannend der Moment ist. Die Clips dürfen sich nicht überschneiden.`;

function transcriptBlock(sentences: Sentence[]): string {
  return sentences
    .map((s) => `[${s.index}] ${formatTime(s.start)}–${formatTime(s.end)} ${s.text}`)
    .join("\n");
}

function userPrompt(req: HighlightRequest): string {
  const ask = req.count;
  const lines = [
    req.videoTitle ? `Videotitel: ${req.videoTitle}` : null,
    `Finde die ${ask} besten Clips. Jeder Clip muss ${req.minSec}–${req.maxSec} Sekunden lang sein ` +
      `(gemessen vom Start des ersten bis zum Ende des letzten Satzes).`,
    `Gib für jeden Clip start_sentence und end_sentence (inklusive) als Satz-Index an, ` +
      `dazu hook_title, reason (ein Satz, warum der Moment stark ist) und score.`,
    `Sortiere nach score, der beste zuerst.`,
  ];
  if (req.exclude && req.exclude.length > 0) {
    const taken = req.exclude.map((r) => `${r.startSentence}–${r.endSentence}`).join(", ");
    lines.push(
      `Diese Satzbereiche sind schon vergeben und dürfen nicht überlappt werden: ${taken}.`,
    );
  }
  return `${lines.filter(Boolean).join("\n")}\n\n<transkript>\n${transcriptBlock(req.sentences)}\n</transkript>`;
}

/** Asks Claude for clip candidates. Needs ANTHROPIC_API_KEY (or another SDK credential). */
export async function findHighlights(req: HighlightRequest): Promise<ClipCandidate[]> {
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: req.model ?? DEFAULT_MODEL,
    max_tokens: 16000,
    // On a policy decline the API retries on a fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(CandidateSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt(req) }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("Das Modell hat die Anfrage abgelehnt.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Die Antwort des Modells wurde abgeschnitten (max_tokens).");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Die Antwort des Modells ließ sich nicht als Clip-Liste lesen.");
  return parsed.clips.map((c) => ({
    startSentence: c.start_sentence,
    endSentence: c.end_sentence,
    hookTitle: c.hook_title,
    reason: c.reason,
    score: c.score,
  }));
}
