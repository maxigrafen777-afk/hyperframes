# Synthetische Grusel-SFX (deterministisch, ohne Netz/Credits).
# Run: python3 sfx.py   -> assets/sfx/*.mp3
import os
import subprocess
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "sfx")
rng = np.random.default_rng(13)


def t_(d):
    return np.arange(int(SR * d)) / SR


def lp_fast(x, cutoff):
    # FFT brickwall-ish lowpass with soft knee
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X = np.fft.rfft(x)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, n)


def bp_fast(x, lo, hi):
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X = np.fft.rfft(x)
    X *= (1 / (1 + (lo / np.maximum(f, 1)) ** 4)) * (1 / (1 + (f / hi) ** 4))
    return np.fft.irfft(X, n)


def env(d, a, r, curve=3.0):
    t = t_(d)
    e = np.minimum(1, t / max(a, 1e-4))
    rel = np.clip((d - t) / max(r, 1e-4), 0, 1) ** curve
    return e * rel


def norm(x, peak=0.9):
    m = np.max(np.abs(x)) or 1
    return x / m * peak


def save(name, x, stereo_width=0.0):
    x = norm(x)
    path_wav = os.path.join(OUT, name + ".wav")
    if stereo_width:
        d = int(SR * stereo_width)
        L = x
        R = np.concatenate([np.zeros(d), x[:-d]])
        data = np.stack([L, R], 1)
        ch = 2
    else:
        data = x[:, None]
        ch = 1
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    with wave.open(path_wav, "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", path_wav, "-b:a", "192k", path_wav[:-4] + ".mp3"],
        check=True,
    )
    os.remove(path_wav)
    print(name)


def saw(f, t):
    return 2 * ((f * t) % 1) - 1


# 1. Drone: tiefe, schwebende Flaeche (70 s)
d = 70
t = t_(d)
lfo = 0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * t)
x = (
    saw(41.2, t) * 0.5
    + saw(41.5, t) * 0.5
    + saw(61.7, t) * 0.25 * lfo
    + np.sin(2 * np.pi * 82.4 * t) * 0.15
    + saw(98.0 * 1.003, t) * 0.08 * (1 - lfo)
)
x = lp_fast(x, 260)
air = bp_fast(rng.standard_normal(len(t)), 300, 2500) * 0.05 * (0.6 + 0.4 * lfo)
save("drone", x + air, stereo_width=0.013)

# 2. Aufzugsmotor: Brummen 100 Hz + Rauschen (25 s)
d = 25
t = t_(d)
x = (
    np.sin(2 * np.pi * 50 * t) * 0.6
    + np.sin(2 * np.pi * 100 * t) * 0.4
    + np.sin(2 * np.pi * 150 * t) * 0.12
)
x += bp_fast(rng.standard_normal(len(t)), 80, 900) * 0.35
x *= 0.85 + 0.15 * np.sin(2 * np.pi * 1.7 * t)
save("motor", x)

# 3. Neon-Surren (20 s)
d = 20
t = t_(d)
x = np.sign(np.sin(2 * np.pi * 120 * t)) * 0.3 + np.sin(2 * np.pi * 240 * t) * 0.3
x = bp_fast(x, 100, 3000) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.4 * t))
save("neon", x)

# 4. Verstimmtes Ding
d = 2.6
t = t_(d)
x = np.zeros_like(t)
for f, a, k in [(659, 1, 1.6), (664, 0.8, 1.7), (1318, 0.35, 3), (1661, 0.25, 4), (523, 0.4, 2)]:
    x += a * np.sin(2 * np.pi * f * t) * np.exp(-k * t)
x *= np.minimum(1, t / 0.004)
save("ding", x, stereo_width=0.011)

# 5. Ding, tief und schief (fuer die 13)
d = 3.2
t = t_(d)
x = np.zeros_like(t)
for f, a, k in [(311, 1, 1.1), (329, 0.9, 1.2), (622, 0.4, 2.2), (466, 0.5, 1.5)]:
    x += a * np.sin(2 * np.pi * f * t * (1 - 0.01 * t)) * np.exp(-k * t)
x *= np.minimum(1, t / 0.004)
save("ding-low", x, stereo_width=0.017)

# 6. Knopf-Klick
d = 0.25
t = t_(d)
x = bp_fast(rng.standard_normal(len(t)), 1500, 6000) * np.exp(-60 * t)
x += np.sin(2 * np.pi * 900 * t) * np.exp(-90 * t) * 0.6
save("klick", x)

# 7. Tuer gleitet (1.6 s) + Anschlag
d = 1.6
t = t_(d)
n = rng.standard_normal(len(t))
slide = bp_fast(n, 120, 1400) * env(d, 0.15, 0.4, 1.5) * 0.6
rumble = np.sin(2 * np.pi * 55 * t) * env(d, 0.1, 0.3) * 0.5
thunk = np.zeros_like(t)
k = int(SR * 1.3)
tt = t[: len(t) - k]
thunk[k:] = np.sin(2 * np.pi * 70 * tt) * np.exp(-14 * tt) + bp_fast(
    rng.standard_normal(len(tt)), 200, 2000
) * np.exp(-30 * tt) * 0.4
save("tuer", slide + rumble + thunk)

# 8. Ruck: tiefer Schlag + Metallknarzen
d = 1.8
t = t_(d)
x = np.sin(2 * np.pi * (60 - 25 * t) * t) * np.exp(-3.5 * t) * 1.2
x += bp_fast(rng.standard_normal(len(t)), 60, 600) * np.exp(-6 * t) * 0.8
creak = np.sin(2 * np.pi * (380 + 60 * np.sin(2 * np.pi * 3 * t)) * t) * np.exp(-2.5 * t) * 0.12
save("ruck", x + creak)

# 10. Herzschlag (30 s, 70 -> 120 bpm)
d = 30
t = t_(d)
x = np.zeros_like(t)
bt = 0.0
while bt < d - 0.5:
    bpm = 70 + 50 * (bt / d)
    for off, a in [(0, 1.0), (0.16, 0.7)]:
        s = int((bt + off) * SR)
        tt = t[: min(int(0.35 * SR), len(t) - s)]
        x[s : s + len(tt)] += a * np.sin(2 * np.pi * 52 * tt) * np.exp(-16 * tt)
    bt += 60 / bpm
save("herz", lp_fast(x, 200))

# 11. Stich (Clusterschwell + Schlag) fuer die Silhouette
d = 3.0
t = t_(d)
sw = np.zeros_like(t)
for f in [220, 233, 247, 330, 349, 466]:
    sw += saw(f, t) * 0.2
sw = lp_fast(sw, 2400) * np.minimum(1, t / 0.08) * np.exp(-1.0 * t)
hit = np.sin(2 * np.pi * (45 - 10 * t) * t) * np.exp(-2.2 * t) * 1.3
scr = bp_fast(rng.standard_normal(len(t)), 2000, 8000) * np.exp(-3 * t) * 0.25
save("stich", sw + hit + scr, stereo_width=0.009)

# 12. Glitch / Flackern (0.5 s)
d = 0.5
t = t_(d)
g = ((np.floor(t * 40) % 3) != 0).astype(float)
x = (bp_fast(rng.standard_normal(len(t)), 400, 5000) * 0.5 + np.sign(np.sin(2 * np.pi * 120 * t)) * 0.3) * g
x *= env(d, 0.005, 0.1)
save("glitch", x)

# 13. Tick (Countdown)
d = 0.2
t = t_(d)
x = np.sin(2 * np.pi * 1800 * t) * np.exp(-50 * t) + bp_fast(rng.standard_normal(len(t)), 2000, 7000) * np.exp(-90 * t) * 0.4
save("tick", x)

# 14. Ferner Ruf (formantartiges Rauschen, unverstaendlich)
d = 2.2
t = t_(d)
src = saw(130 * (1 + 0.03 * np.sin(2 * np.pi * 5 * t)), t)
x = bp_fast(src, 500, 900) * 0.8 + bp_fast(src, 1100, 1500) * 0.4
x *= env(d, 0.25, 1.0, 1.2) * (0.6 + 0.4 * np.sin(2 * np.pi * 1.3 * t) ** 2)
# Hall: ein paar Echos
y = x.copy()
for dl, a in [(0.11, 0.5), (0.23, 0.35), (0.41, 0.22), (0.67, 0.12)]:
    s = int(dl * SR)
    y[s:] += a * x[:-s]
save("ruf", y, stereo_width=0.021)


# ---- Teil 2 ----
def step(tt, a=1.0):
    return a * (np.sin(2 * np.pi * 90 * tt) * np.exp(-28 * tt) + bp_fast(rng.standard_normal(len(tt)), 300, 3000) * np.exp(-45 * tt) * 0.5)


def steps(name, d, rate, a=1.0):
    t = t_(d)
    x = np.zeros_like(t)
    k = 0
    st = 0.05
    while st < d - 0.3:
        s = int(st * SR)
        n = min(int(0.3 * SR), len(t) - s)
        x[s : s + n] += step(t[:n], a * (0.8 + 0.2 * (k % 2)))
        st += 1 / rate
        k += 1
    save(name, x)


steps("schritte", 6, 1.7)
steps("lauf", 4, 4.2, 1.3)

# Handy-Vibration (2 Pulse)
d = 1.3
t = t_(d)
gate = ((t % 0.6) < 0.35).astype(float)
x = (np.sin(2 * np.pi * 170 * t) + 0.4 * np.sign(np.sin(2 * np.pi * 170 * t))) * gate
save("vibration", lp_fast(x, 1200))

# Metallknall gegen die Tür
d = 2.2
t = t_(d)
x = np.sin(2 * np.pi * (55 - 15 * t) * t) * np.exp(-4 * t) * 1.4
for f, a, k in [(212, 0.5, 3), (347, 0.35, 4), (523, 0.25, 5), (811, 0.15, 6)]:
    x += a * np.sin(2 * np.pi * f * t) * np.exp(-k * t)
x += bp_fast(rng.standard_normal(len(t)), 80, 4000) * np.exp(-18 * t) * 0.9
save("knall", x, stereo_width=0.012)

# Tropfen im Keller (20 s)
d = 20
t = t_(d)
x = bp_fast(rng.standard_normal(len(t)), 200, 1200) * 0.04
for i in range(26):
    s = int(((i * 0.77) % d) * SR)
    n = min(int(0.25 * SR), len(t) - s)
    tt = t[:n]
    f = 900 + 500 * ((i * 37) % 7) / 7
    x[s : s + n] += np.sin(2 * np.pi * f * tt * (1 + 2 * tt)) * np.exp(-30 * tt) * 0.5
save("tropfen", x, stereo_width=0.02)

# Nachrichten-Ton
d = 0.9
t = t_(d)
x = (np.sin(2 * np.pi * 1318 * t) * np.exp(-9 * t) + np.sin(2 * np.pi * 1760 * t) * np.exp(-9 * np.maximum(0, t - 0.12)) * (t > 0.12)) * 0.7
save("nachricht", x)


# ---- Teil 3 ----
# Auslöser (Handy-Foto)
d = 0.35
t = t_(d)
x = bp_fast(rng.standard_normal(len(t)), 1500, 8000) * (np.exp(-60 * t) + 0.7 * np.exp(-60 * np.maximum(0, t - 0.11)) * (t > 0.11))
save("ausloeser", x)

# Atmen hinter dir (6 s, langsam, nah)
d = 6
t = t_(d)
n = rng.standard_normal(len(t))
br = bp_fast(n, 250, 2200)
envb = np.zeros_like(t)
for k in range(4):
    a = 0.2 + k * 1.45
    envb += np.exp(-(((t - a - 0.45) / 0.32) ** 2)) * 0.9 + np.exp(-(((t - a - 1.05) / 0.22) ** 2)) * 0.6
save("atmen", br * envb, stereo_width=0.004)

# Tippen (Tastatur-Klicks, 1.6 s)
d = 1.6
t = t_(d)
x = np.zeros_like(t)
for k in range(11):
    s0 = int((0.05 + k * 0.135 + 0.02 * ((k * 7) % 3)) * SR)
    nn = min(int(0.04 * SR), len(t) - s0)
    x[s0 : s0 + nn] += bp_fast(rng.standard_normal(nn), 2000, 7000) * np.exp(-200 * t[:nn])
save("tippen", x)

# Strom aus (Brummen fällt ab)
d = 1.6
t = t_(d)
f = 120 * np.exp(-1.6 * t)
x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.4 * np.exp(-1.5 * t)
x += np.sin(2 * np.pi * 45 * t) * np.exp(-3 * t) * 0.8
save("stromaus", lp_fast(x, 1800))
