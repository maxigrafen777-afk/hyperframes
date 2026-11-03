# Lautstärke-Hüllkurve einer Audiodatei: 30 Werte pro Sekunde, normiert 0..1.
import sys, subprocess, json, numpy as np
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", sys.argv[1], "-ac", "1", "-ar", "12000", "-f", "s16le", "-"], capture_output=True).stdout
x = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
hop = 400
rms = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) if i + hop <= len(x) else 0.0 for i in range(0, len(x), hop)])
ref = np.percentile(rms[rms > 0], 95) if np.any(rms > 0) else 1.0
v = np.clip(rms / ref, 0, 1)
v[v < 0.12] = 0
print(json.dumps([round(float(a), 2) for a in v]))
