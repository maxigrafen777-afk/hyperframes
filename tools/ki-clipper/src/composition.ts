import type { Word } from "./transcript.ts";

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;

/** A caption group: 1–3 words that are on screen together. */
export interface CaptionGroup {
  start: number;
  end: number;
  words: Word[];
}

export interface CaptionOptions {
  maxWords?: number;
  /** A pause at least this long starts a new group. */
  pauseSec?: number;
  /** Keep a group up this long after its last word, unless the next one starts. */
  holdSec?: number;
  /** No group starts before this (a caption at 0 s looks pre-existing). */
  firstStartSec?: number;
}

const GROUP_BREAK = /[.!?…,;:]["»“”')\]]*$/u;

/** Words relative to the clip start, limited to the clip window. */
export function wordsInWindow(words: Word[], start: number, end: number): Word[] {
  return words
    .filter((w) => w.start >= start - 0.05 && w.start < end - 0.1)
    .map((w) => ({
      text: w.text,
      start: r3(Math.max(0, w.start - start)),
      end: r3(Math.min(end - start, Math.max(w.end, w.start + 0.05) - start)),
    }));
}

export function buildCaptionGroups(words: Word[], options: CaptionOptions = {}): CaptionGroup[] {
  const maxWords = options.maxWords ?? 3;
  const pauseSec = options.pauseSec ?? 0.15;
  const holdSec = options.holdSec ?? 0.35;
  const firstStartSec = options.firstStartSec ?? 0.15;
  const groups: CaptionGroup[] = [];
  let current: Word[] = [];
  const flush = () => {
    if (current.length === 0) return;
    groups.push({ start: current[0].start, end: current[current.length - 1].end, words: current });
    current = [];
  };
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = words[i + 1];
    current.push(word);
    const longWord = word.text.length >= 14 && current.length >= 2;
    if (
      !next ||
      current.length >= maxWords ||
      longWord ||
      GROUP_BREAK.test(word.text) ||
      next.start - word.end >= pauseSec
    ) {
      flush();
    }
  }
  // Open each group on time, keep it a little after the last word, never overlap the next.
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const next = groups[i + 1];
    group.start = Math.max(group.start, i === 0 ? firstStartSec : 0);
    const held = group.end + holdSec;
    group.end = next ? Math.min(held, next.start) : held;
    if (group.end <= group.start) group.end = group.start + 0.1;
  }
  return groups;
}

/** Display text: captions drop trailing commas and full stops but keep ? and !. */
export function captionText(text: string): string {
  return text.replace(/[.,;:]+(["»“”')\]]*)$/u, "$1");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Font size so the group stays on one line inside the 900 px caption width. */
export function captionFontSize(text: string): number {
  const chars = Math.max(1, text.length);
  return Math.max(48, Math.min(92, Math.floor(900 / (chars * 0.66))));
}

export function hookFontSize(title: string): number {
  const chars = title.length;
  if (chars <= 18) return 96;
  if (chars <= 32) return 82;
  if (chars <= 48) return 70;
  return 60;
}

export interface CompositionInput {
  duration: number;
  hookTitle: string;
  words: Word[];
  videoSrc: string;
  gsapSrc: string;
  hookSec?: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * One 1080×1920 HyperFrames composition: the reframed clip, a hook title for
 * the first seconds and word-by-word karaoke captions. Every timed element is
 * written in the HTML with a stable id, so the HyperFrames desktop app can edit it.
 */
export function generateComposition(input: CompositionInput): string {
  const duration = r3(input.duration);
  const hookSec = r3(Math.min(input.hookSec ?? 2.8, Math.max(1, duration - 0.5)));
  const groups = buildCaptionGroups(input.words);

  const groupHtml = groups
    .map((group, g) => {
      const text = group.words.map((w) => captionText(w.text)).join(" ");
      const spans = group.words
        .map(
          (w, i) =>
            `<span id="cg${g}-w${i}" class="cap-word">${escapeHtml(captionText(w.text))}</span>`,
        )
        .join(" ");
      return `        <div id="cg${g}" class="cap-group" style="font-size: ${captionFontSize(text)}px">${spans}</div>`;
    })
    .join("\n");

  const groupTweens = groups
    .map((group, g) => {
      const lines = [
        `      tl.set("#cg${g}", { opacity: 1, visibility: "visible" }, ${r3(group.start)});`,
        `      tl.fromTo("#cg${g}", { scale: 0.84, y: 14 }, { scale: 1, y: 0, duration: 0.16, ease: "back.out(2.4)" }, ${r3(group.start)});`,
      ];
      group.words.forEach((w, i) => {
        const on = r3(Math.max(group.start, w.start));
        const off = r3(Math.min(group.end, Math.max(w.end, on + 0.12)));
        lines.push(
          `      tl.to("#cg${g}-w${i}", { color: "#FFE14D", scale: 1.06, duration: 0.08, ease: "power2.out" }, ${on});`,
          `      tl.to("#cg${g}-w${i}", { color: "#FFFFFF", scale: 1, duration: 0.1, ease: "power2.in" }, ${off});`,
        );
      });
      const exit = r3(Math.max(group.start + 0.05, group.end - 0.1));
      lines.push(
        `      tl.to("#cg${g}", { opacity: 0, duration: ${r3(Math.min(0.1, group.end - group.start))}, ease: "power2.in" }, ${exit});`,
        `      tl.set("#cg${g}", { opacity: 0, visibility: "hidden" }, ${r3(group.end)});`,
      );
      return lines.join("\n");
    })
    .join("\n");

  const hook = escapeHtml(input.hookTitle.trim());
  const hookOut = r3(hookSec - 0.32);

  return `<!doctype html>
<html lang="de" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${WIDTH}, height=${HEIGHT}" />
    <script src="${escapeHtml(input.gsapSrc)}"></script>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html,
      body {
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        overflow: hidden;
        background: #000;
      }
      body {
        font-family: "Inter", sans-serif;
      }
      #root {
        --hook-bg: #ffffff;
        --hook-fg: #111111;
        --accent: #ffe14d;
      }
      #hook {
        position: absolute;
        left: 0;
        top: 330px;
        width: ${WIDTH}px;
        display: flex;
        justify-content: center;
        z-index: 30;
      }
      #hook-card {
        max-width: 860px;
        padding: 30px 46px 34px;
        border-radius: 30px;
        background: var(--hook-bg);
        color: var(--hook-fg);
        font-weight: 900;
        line-height: 1.06;
        letter-spacing: -0.01em;
        text-align: center;
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
        border-bottom: 12px solid var(--accent);
      }
      #captions {
        position: absolute;
        left: 0;
        top: 0;
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        z-index: 20;
        pointer-events: none;
        overflow: visible;
      }
      .cap-group {
        position: absolute;
        left: 0;
        top: 1130px;
        width: ${WIDTH}px;
        padding: 0 90px;
        display: flex;
        flex-wrap: nowrap;
        justify-content: center;
        gap: 0.42em;
        text-align: center;
        color: #ffffff;
        font-weight: 900;
        line-height: 1.1;
        white-space: nowrap;
        overflow: visible;
        opacity: 0;
        visibility: hidden;
        text-shadow:
          0 0 2px #000,
          4px 4px 0 #000,
          -4px 4px 0 #000,
          4px -4px 0 #000,
          -4px -4px 0 #000,
          0 8px 22px rgba(0, 0, 0, 0.6);
      }
      .cap-word {
        display: inline-block;
        color: #ffffff;
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${duration}"
      data-width="${WIDTH}"
      data-height="${HEIGHT}"
    >
      <video
        id="a-roll"
        class="clip"
        src="${escapeHtml(input.videoSrc)}"
        playsinline
        data-start="0"
        data-duration="${duration}"
        data-track-index="0"
        data-has-audio="true"
        style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover"
      ></video>

      <div id="hook" class="clip" data-start="0" data-duration="${hookSec}" data-track-index="2" data-track-kind="graphics">
        <div id="hook-card" data-var-text="hookTitle" style="font-size: ${hookFontSize(input.hookTitle)}px">${hook}</div>
      </div>

      <div id="captions" class="clip" data-start="0" data-duration="${duration}" data-track-index="1" data-track-kind="captions">
${groupHtml}
      </div>
    </div>

    <script>
      const tl = gsap.timeline({ paused: true });
      // Hook: already on screen at frame 0 (it is the thumbnail), punches in, leaves upward.
      tl.fromTo("#hook-card", { scale: 1.06, rotation: -3 }, { scale: 1, rotation: -2, duration: 0.45, ease: "back.out(2)" }, 0);
      tl.to("#hook-card", { opacity: 0, y: -40, scale: 0.94, duration: 0.3, ease: "power2.in" }, ${hookOut});
      // Captions: one group at a time, the spoken word lights up.
${groupTweens}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
}
