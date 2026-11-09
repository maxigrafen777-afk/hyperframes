import { describe, expect, test } from "bun:test";
import { fitRange, maxClipsFor, resolveClips, slugify } from "./clips.ts";
import {
  buildCaptionGroups,
  captionText,
  escapeHtml,
  generateComposition,
  wordsInWindow,
} from "./composition.ts";
import { cropFilter } from "./media.ts";
import { buildSentences, parseTranscript, type Sentence, type Word } from "./transcript.ts";

/** Ten-second sentences back to back: sentence i spans [10i, 10i + 9.5]. */
function sentences(n: number, length = 9.5, step = 10): Sentence[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    start: i * step,
    end: i * step + length,
    text: `Satz ${i}.`,
    firstWord: i,
    lastWord: i,
  }));
}

const opts = { count: 10, minSec: 30, maxSec: 60, videoDuration: 1000 };

describe("transcript", () => {
  test("parses array and {words} shapes and drops non-speech tokens", () => {
    const words = parseTranscript([
      { id: "w1", text: "Hallo", start: 1, end: 1.4 },
      { id: "w0", text: "♪", start: 0, end: 0.5 },
      { text: "Welt.", start: 1.5, end: 2 },
      { text: 3, start: 2, end: 3 },
    ]);
    expect(words.map((w) => w.text)).toEqual(["Hallo", "Welt."]);
    expect(parseTranscript({ words: [{ text: "Ja", start: 0, end: 1 }] })).toHaveLength(1);
  });

  test("splits sentences on punctuation, pauses and length", () => {
    const words: Word[] = [
      { text: "Das", start: 0, end: 0.2 },
      { text: "ist", start: 0.2, end: 0.4 },
      { text: "gut.", start: 0.4, end: 0.8 },
      { text: "Und", start: 0.9, end: 1.1 },
      { text: "dann", start: 1.1, end: 1.3 },
      { text: "Pause", start: 3, end: 3.4 },
    ];
    const result = buildSentences(words);
    expect(result.map((s) => s.text)).toEqual(["Das ist gut.", "Und dann", "Pause"]);
    expect(result[1]).toMatchObject({ start: 0.9, end: 1.3, firstWord: 3, lastWord: 4 });
  });
});

describe("clip fitting", () => {
  test("grows a too-short range on sentence boundaries", () => {
    const range = fitRange(sentences(20), 2, 2, opts);
    expect(range).not.toBeNull();
    expect(range!.startSentence).toBe(2);
    expect(range!.endSentence).toBe(4);
    const length = range!.end - range!.start;
    expect(length).toBeGreaterThanOrEqual(30);
    expect(length).toBeLessThanOrEqual(60);
  });

  test("shrinks a too-long range", () => {
    const range = fitRange(sentences(20), 0, 9, opts);
    expect(range!.endSentence).toBe(5);
    expect(range!.end - range!.start).toBeLessThanOrEqual(60);
  });

  test("grows at the start when the end of the video is reached", () => {
    const range = fitRange(sentences(10), 9, 9, opts);
    expect(range!.endSentence).toBe(9);
    expect(range!.startSentence).toBe(7);
  });

  test("returns null when no sentence range can fit", () => {
    // One 100 s sentence can never be cut to 30–60 s on a sentence boundary.
    expect(fitRange(sentences(1, 100, 100), 0, 0, opts)).toBeNull();
  });
});

describe("resolveClips", () => {
  test("keeps the best non-overlapping clips, ranked by score", () => {
    const { clips, issues } = resolveClips(
      [
        { startSentence: 0, endSentence: 3, hookTitle: "Erster", reason: "a", score: 50 },
        { startSentence: 2, endSentence: 5, hookTitle: "Überlappt", reason: "b", score: 40 },
        { startSentence: 10, endSentence: 13, hookTitle: "Bester Moment!", reason: "c", score: 90 },
      ],
      sentences(20),
      opts,
    );
    expect(clips.map((c) => c.hookTitle)).toEqual(["Bester Moment!", "Erster"]);
    expect(clips[0]).toMatchObject({ rank: 1, slug: "01-bester-moment", cropX: 0 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Überlappt");
    for (const clip of clips) {
      expect(clip.duration).toBeGreaterThanOrEqual(30);
      expect(clip.duration).toBeLessThanOrEqual(60);
    }
  });

  test("stops at count and fixes swapped or out-of-range indexes", () => {
    const { clips } = resolveClips(
      [
        { startSentence: 99, endSentence: 16, hookTitle: "A", reason: "", score: 80 },
        { startSentence: 0, endSentence: 3, hookTitle: "B", reason: "", score: 70 },
      ],
      sentences(20),
      { ...opts, count: 1 },
    );
    expect(clips).toHaveLength(1);
    expect(clips[0].endSentence).toBe(19);
  });

  test("maxClipsFor", () => {
    expect(maxClipsFor(174, 30)).toBe(5);
    expect(maxClipsFor(20, 30)).toBe(0);
  });

  test("slugify handles German characters", () => {
    expect(slugify("Größter Fehler: Übermut!")).toBe("groesster-fehler-uebermut");
    expect(slugify("???")).toBe("clip");
  });
});

describe("captions", () => {
  const words: Word[] = [
    { text: "Fertig", start: 10, end: 10.4 },
    { text: "ist", start: 10.4, end: 10.6 },
    { text: "besser", start: 10.6, end: 11 },
    { text: "als", start: 11, end: 11.2 },
    { text: "perfekt.", start: 11.2, end: 11.8 },
    { text: "Danach", start: 30, end: 30.5 },
  ];

  test("wordsInWindow shifts times to the clip and drops outside words", () => {
    const inside = wordsInWindow(words, 10, 20);
    expect(inside).toHaveLength(5);
    expect(inside[0]).toEqual({ text: "Fertig", start: 0, end: 0.4 });
  });

  test("groups break on word limit and punctuation, never overlap", () => {
    const groups = buildCaptionGroups(wordsInWindow(words, 10, 20));
    expect(groups.map((g) => g.words.map((w) => w.text).join(" "))).toEqual([
      "Fertig ist besser",
      "als perfekt.",
    ]);
    expect(groups[0].start).toBeCloseTo(0.15);
    expect(groups[0].end).toBeLessThanOrEqual(groups[1].start);
  });

  test("captionText and escapeHtml", () => {
    expect(captionText("perfekt.")).toBe("perfekt");
    expect(captionText("wirklich?")).toBe("wirklich?");
    expect(escapeHtml(`<b>"A&B"</b>`)).toBe("&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;");
  });

  test("composition carries the contract pieces", () => {
    const html = generateComposition({
      duration: 42.5,
      hookTitle: "Fertig > perfekt",
      words: wordsInWindow(words, 10, 20),
      videoSrc: "assets/clip.mp4",
      gsapSrc: "assets/gsap.min.js",
    });
    expect(html).toContain('data-duration="42.5"');
    expect(html).toContain('data-width="1080"');
    expect(html).toContain('data-track-kind="captions"');
    expect(html).toContain("Fertig &gt; perfekt");
    expect(html).toContain('window.__timelines["main"] = tl;');
    expect(html).toContain('id="cg1-w1"');
    expect(html).not.toContain("Math.random");
  });
});

describe("cropFilter", () => {
  test("landscape → centred 9:16 window, cropX moves it", () => {
    expect(cropFilter(1920, 1080, 0)).toBe("crop=606:1080:657:0");
    expect(cropFilter(1920, 1080, -1)).toBe("crop=606:1080:0:0");
    expect(cropFilter(1920, 1080, 1)).toBe("crop=606:1080:1314:0");
  });

  test("portrait source keeps full width", () => {
    expect(cropFilter(1080, 1920, 0)).toBe("crop=1080:1920:0:0");
  });
});
