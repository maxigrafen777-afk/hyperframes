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


def synth_elevenlabs(text, out_mp3):
    key = os.environ["ELEVENLABS_API_KEY"]
    body = json.dumps(
        {
            "text": speak_text(text),
            "model_id": V.get("elevenModel", "eleven_multilingual_v2"),
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.8, "style": 0.3},
            "seed": 13,
        }
    ).encode()
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{V['voiceId']}?output_format=mp3_44100_128",
        data=body,
        headers={"xi-api-key": key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r, open(out_mp3, "wb") as f:
        f.write(r.read())


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


def main():
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    tf = os.path.join(VO, "timings.json")
    timings = json.load(open(tf)) if os.path.exists(tf) else {}
    engine = V.get("engine", "mbrola")
    for l in script["lines"]:
        if only and l["id"] not in only:
            continue
        mp3 = os.path.join(VO, l["id"] + ".mp3")
        if engine == "elevenlabs":
            raw = os.path.join(RAW, l["id"] + ".mp3")
            synth_elevenlabs(l["text"], raw)
        else:
            raw = os.path.join(RAW, l["id"] + ".wav")
            synth_mbrola(l["text"], raw)
        process(raw, mp3)
        dur, words = word_times(l["text"], mp3)
        timings[l["id"]] = {"duration": dur, "words": words, "engine": engine}
        print(l["id"], dur)
    json.dump(timings, open(tf, "w"), indent=1, ensure_ascii=False)


main()
