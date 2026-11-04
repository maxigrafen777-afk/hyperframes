import sys, subprocess, numpy as np, json
raw = subprocess.run(["ffmpeg","-v","error","-i",sys.argv[1],"-ac","1","-ar","16000","-f","s16le","-"],capture_output=True).stdout
x = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
fr, hop = 640, 320; vals=[]; rms=[]
for i in range(0, len(x)-fr, hop):
    w = x[i:i+fr]; w = w - w.mean(); e=np.sqrt((w*w).mean()); rms.append(e)
    if e < 500: continue
    ac = np.correlate(w, w, "full")[fr-1:]
    lo, hi = 16000//500, 16000//60
    k = lo + int(np.argmax(ac[lo:hi]))
    if ac[k] > 0.4*ac[0]: vals.append(16000/k)
v=np.array(vals); st=12*np.log2(v/np.median(v)) if len(v) else np.array([0])
r=np.array(rms); r=r[r>300]
print(json.dumps({"f0":round(float(np.median(v)),1) if len(v) else 0,"var":round(float(np.std(st)),2),"dyn":round(float(20*np.log10(np.percentile(r,95)/np.percentile(r,20))),1) if len(r) else 0}))
