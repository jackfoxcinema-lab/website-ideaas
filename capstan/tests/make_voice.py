# Synthetic "voice": glottal pulse train through formant resonators, with syllable envelopes and pauses.
import numpy as np, wave, sys
sr = 48000; dur = 12.0; n = int(sr*dur)
t = np.arange(n)/sr
rng = np.random.default_rng(4)
f0 = 140 + 25*np.sin(2*np.pi*0.7*t) + 15*np.sin(2*np.pi*2.3*t)
phase = np.cumsum(f0/sr)
src = (np.mod(phase,1.0) < 0.08).astype(float) - 0.08
src += 0.02*rng.standard_normal(n)
def reson(x, f, bw):
    r = np.exp(-np.pi*bw/sr); a1 = -2*r*np.cos(2*np.pi*f/sr); a2 = r*r
    y = np.zeros_like(x); y1=y2=0.0
    for i in range(len(x)):
        v = x[i] - a1*y1 - a2*y2; y[i]=v; y2=y1; y1=v
    return y*(1-r)
vowels = [(700,1200,2600),(300,2300,3000),(500,900,2500),(400,1900,2600)]
out = np.zeros(n)
seg = int(0.25*sr)
for k in range(0, n, seg):
    F = vowels[(k//seg) % 4]
    x = src[k:k+seg]
    y = reson(x,F[0],90)*1.0 + reson(x,F[1],110)*0.6 + reson(x,F[2],160)*0.3
    out[k:k+len(y)] = y
env = np.clip(np.sin(2*np.pi*1.9*t),0,1)**0.6 * (np.sin(2*np.pi*0.23*t) > -0.6)
out *= env
out = out/np.max(np.abs(out))*0.35
pcm = (out*32767).astype('<i2')
with wave.open(sys.argv[1],'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())
print('wrote', sys.argv[1])
