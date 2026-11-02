# Erzaehlerstimme fuer Stockwerk 13.
#   python3 voices.py            -> alle Zeilen
#   python3 voices.py n3 n9      -> nur diese Zeilen
# Engine in script.json -> voice.engine:
#   "mbrola"     offline: espeak-ng + MBROLA (apt: espeak-ng mbrola mbrola-de6)
#   "elevenlabs" ELEVENLABS_API_KEY + voice.voiceId (eleven_multilingual_v2), braucht Credits
# Schreibt assets/vo/<id>.mp3 und assets/vo/timings.json (Dauer + Wortzeiten).
import json
import os
import re
import subprocess
import sys
import urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
VO = os.path.join(HERE, "assets", "vo")
RAW = os.path.join(VO, "raw")
os.makedirs(RAW, exist_ok=True)
script = json.load(open(os.path.join(HERE, "script.json"), encoding="utf8"))
V = script["voice"]


def speak_text(text):
    return re.sub(r"\s*(\.\.\.|…)", ".", text)


def synth_mbrola(text, out_wav):
    subprocess.run(
        [
            "espeak-ng",
            "-v",
            V.get("mbrolaVoice", "mb-de6"),
            "-s",
            str(V.get("wpm", 150)),
            "-p",
            str(V.get("espeakPitch", 32)),
            "-w",
            out_wav,
            speak_text(text),
        ],
        check=True,
        capture_output=True,
    )


def el_request(path, payload=None, files=None):
    key = os.environ["ELEVENLABS_API_KEY"]
    if files is None:
        req = urllib.request.Request(
            "https://api.elevenlabs.io" + path,
            data=json.dumps(payload).encode(),
            headers={"xi-api-key": key, "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    out = subprocess.run(
        ["curl", "-sS", "-H", f"xi-api-key: {key}", *sum([["-F", f] for f in files], []), "https://api.elevenlabs.io" + path],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(out.stdout)


def synth_elevenlabs(line, prev, nxt, out_mp3, attempt):
    """Take mit Zeichen-Alignment; Wortzeiten kommen aus dem Alignment."""
    import base64

    body = {
        "text": speak_text(line["text"]),
        "model_id": V.get("elevenModel", "eleven_multilingual_v2"),
        "language_code": "de",
        "voice_settings": V.get("settings", {"stability": 0.5, "similarity_boost": 0.8, "style": 0.3}),
        "seed": 13 + attempt * 101,
    }
    if prev:
        body["previous_text"] = speak_text(prev)
    if nxt:
        body["next_text"] = speak_text(nxt)
    d = el_request(f"/v1/text-to-speech/{V['voiceId']}/with-timestamps?output_format=mp3_44100_192", body)
    with open(out_mp3, "wb") as f:
        f.write(base64.b64decode(d["audio_base64"]))
    al = d.get("normalized_alignment") or d["alignment"]
    chars, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    words, cur = [], None
    for c, a, b in zip(chars, st, en):
        if c.isspace():
            if cur:
                words.append(cur)
            cur = None
            continue
        if cur is None:
            cur = {"text": "", "start": a, "end": b}
        cur["text"] += c
        cur["end"] = b
    if cur:
        words.append(cur)
    return words


NUM = {"2": "zwei", "3": "drei", "5": "fünf", "6": "sechs", "7": "sieben", "8": "acht", "9": "neun",
       "10": "zehn", "11": "elf", "12": "zwölf", "13": "dreizehn"}


def norm_words(s):
    s = s.lower().replace("-", " ")
    out = []
    for w in re.findall(r"[a-zäöüß0-9]+", s):
        out.extend(NUM.get(w, w).split())
    return out


def wer(ref, hyp):
    import difflib

    a, b = norm_words(ref), norm_words(hyp)
    m = sum(x.size for x in difflib.SequenceMatcher(None, a, b).get_matching_blocks())
    return 1 - m / max(1, len(a))


def qa(mp3):
    d = el_request("/v1/speech-to-text", files=["model_id=scribe_v1", "language_code=de", f"file=@{mp3}"])
    return d.get("text", "")


def process(raw, out_mp3):
    # Dunkler machen: leicht tiefer, Waerme unten, Praesenz oben, Kompression, kleiner Raum.
    p = V.get("pitch", 1.0)
    tempo = V.get("tempo", 1.0)
    sr = 44100
    chain = [
        f"aresample={sr}",
        f"asetrate={int(sr * p)}",
        f"aresample={sr}",
        f"atempo={tempo / p:.4f}",
        "highpass=f=60",
        "lowpass=f=7500",
        "equalizer=f=130:t=q:w=1:g=4",
        "equalizer=f=2800:t=q:w=1.2:g=2.5",
        "acompressor=threshold=-22dB:ratio=3:attack=5:release=120:makeup=5",
        "aecho=0.85:0.45:36|67:0.14|0.08",
        "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08",
        "areverse",
        "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12",
        "areverse",
    ]
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", raw, "-af", ",".join(chain), "-ac", "1", "-b:a", "192k", out_mp3],
        check=True,
    )


def pcm_of(mp3):
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", mp3, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
        check=True,
        capture_output=True,
    )
    return np.frombuffer(r.stdout, dtype="<i2").astype(np.float32) / 32768, 16000


def weight(w):
    core = re.sub(r"[^\wäöüß]", "", w.lower())
    syl = max(1, len(re.findall(r"[aeiouäöüy]+", core)))
    return syl + len(core) * 0.08


def word_times(text, mp3):
    """Wortzeiten ohne Spracherkennung: Pausen im Signal trennen die Phrasen
    (an Satzzeichen), innerhalb einer Phrase nach Silben verteilt."""
    x, sr = pcm_of(mp3)
    dur = len(x) / sr
    hop = int(0.01 * sr)
    frames = np.array([np.sqrt(np.mean(x[i : i + hop] ** 2) + 1e-12) for i in range(0, len(x) - hop, hop)])
    db = 20 * np.log10(frames + 1e-9)
    loud = db > (np.max(db) - 30)
    idx = np.where(loud)[0]
    s0 = idx[0] * 0.01 if len(idx) else 0
    s1 = (idx[-1] + 1) * 0.01 if len(idx) else dur
    gaps, run = [], None
    for i in range(int(s0 / 0.01), int(s1 / 0.01)):
        if not loud[i]:
            run = run if run is not None else i
        elif run is not None:
            if i - run >= 6:
                gaps.append((run * 0.01, i * 0.01))
            run = None
    words = speak_text(text).split()
    phrases, cur = [], []
    for w in words:
        cur.append(w)
        if re.search(r"[,.:;!?]$", w):
            phrases.append(cur)
            cur = []
    if cur:
        phrases.append(cur)
    need = len(phrases) - 1
    segs = []
    if need and len(gaps) >= need:
        best = sorted(sorted(gaps, key=lambda g: g[1] - g[0], reverse=True)[:need])
        a = s0
        for g in best:
            segs.append((a, g[0]))
            a = g[1]
        segs.append((a, s1))
    else:
        tot = sum(weight(w) for p in phrases for w in p)
        a = s0
        for p in phrases:
            d = (s1 - s0) * sum(weight(w) for w in p) / tot
            segs.append((a, a + d))
            a += d
    out = []
    for p, (a, b) in zip(phrases, segs):
        tot = sum(weight(w) for w in p)
        t = a
        for w in p:
            d = (b - a) * weight(w) / tot
            out.append({"text": w, "start": round(t, 3), "end": round(t + d, 3)})
            t += d
    return round(dur, 3), out


def lead_trim(mp3):
    """Sekunden Stille, die process() vorne abschneidet (fuer die Wortzeiten)."""
    r = subprocess.run(
        ["ffmpeg", "-v", "info", "-i", mp3, "-af", "silencedetect=n=-45dB:d=0.02", "-f", "null", "-"],
        capture_output=True,
        text=True,
    )
    m = re.search(r"silence_start: (-?[0-9.]+)\D+silence_end: ([0-9.]+)", r.stderr)
    if m and float(m.group(1)) <= 0.01:
        return max(0.0, float(m.group(2)) - 0.08)
    return 0.0


def main():
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    tf = os.path.join(VO, "timings.json")
    timings = json.load(open(tf)) if os.path.exists(tf) else {}
    engine = V.get("engine", "mbrola")
    lines = script["lines"]
    qa_cfg = V.get("qa", {"maxTakes": 3, "maxWer": 0.1})
    for i, l in enumerate(lines):
        if only and l["id"] not in only:
            continue
        mp3 = os.path.join(VO, l["id"] + ".mp3")
        if engine == "elevenlabs":
            raw = os.path.join(RAW, l["id"] + ".mp3")
            prev = lines[i - 1]["text"] if i else None
            nxt = lines[i + 1]["text"] if i + 1 < len(lines) else None
            best = None
            for attempt in range(qa_cfg["maxTakes"]):
                words = synth_elevenlabs(l, prev, nxt, raw, attempt)
                heard = qa(raw)
                e = wer(l["text"], heard)
                print(f"  {l['id']} take {attempt + 1}: wer {e:.2f} | {heard}")
                if best is None or e < best[0]:
                    best = (e, words, open(raw, "rb").read(), heard)
                if e <= qa_cfg["maxWer"]:
                    break
            e, words, data, heard = best
            open(raw, "wb").write(data)
            trim = lead_trim(raw)
            process(raw, mp3)
            words = [
                {"text": w["text"], "start": round(max(0, w["start"] - trim), 3), "end": round(max(0, w["end"] - trim), 3)}
                for w in words
            ]
            dur = float(
                subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3],
                    capture_output=True,
                    text=True,
                ).stdout
            )
            timings[l["id"]] = {"duration": round(dur, 3), "words": words, "engine": engine, "wer": round(e, 3), "heard": heard}
        else:
            raw = os.path.join(RAW, l["id"] + ".wav")
            synth_mbrola(l["text"], raw)
            process(raw, mp3)
            dur, words = word_times(l["text"], mp3)
            timings[l["id"]] = {"duration": dur, "words": words, "engine": engine}
        print(l["id"], timings[l["id"]]["duration"])
    json.dump(timings, open(tf, "w"), indent=1, ensure_ascii=False)


main()
