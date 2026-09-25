# Yard Sale: ambient pedal DSP core

The DSP for a three-block ambient multi-effect: **tape**, **granular swirl**
and a **lush modulated reverb**. It is written to run first as a VST3 and later
on a Raspberry Pi as a standalone pedal. There is no GUI code. The core is plain
C++17 with no dependencies. A thin JUCE wrapper turns it into a plugin.

```
            ┌──────────── PedalChain (any order; default shown) ─────────────┐
 in ─ DC ─► │  TapeStage  ──►  GranularSwirl  ──►  LushReverb                │ ─► limiter ─► out
 (mono or   │  saturate        record → grains     pre-delay → diffuse       │    (soft knee,
  stereo)   │  wow/flutter     pitch/pan/reverse   → 8-line modulated FDN    │     0 dBFS)
            └────────────────────────────────────────────────────────────────┘
```

| File | What it is |
|---|---|
| `src/dsp/DspUtils.h` | Primitives: smoother, TPT one-pole, Simper SVF, LFOs, Hermite, fast tanh, denormal guard (x86 + ARM), RNG, hiss |
| `src/dsp/DelayLine.h` | Power-of-two delay line (integer + Hermite taps), Schroeder allpass |
| `src/dsp/TapeStage.*` | Emphasis → asymmetric tanh (ADAA) → wow/flutter transport → hiss → dropouts → playback EQ |
| `src/dsp/GranularSwirl.*` | 5 s record buffer, 24-voice stochastic grain engine, freeze / micro-looper |
| `src/dsp/LushReverb.*` | Pre-delay, 4-step Hadamard diffuser, 8-line Householder FDN with in-loop damping |
| `src/dsp/PedalChain.*` | Owns the three modules, routing (6 orders, click-free switch), I/O stages |
| `src/plugin/PluginProcessor.*` | JUCE `AudioProcessor` adapter (38 parameters, JUCE's stock generic editor, state save/restore) |
| `tests/render_and_test.cpp` | Offline verification, benchmark and demo renders |

## Real-time contract

- `prepare()` is the only place memory is allocated. Call it from the setup
  thread.
- `setSettings()` and `processBlock()` run on the audio thread. They never
  allocate, lock or make system calls. The host copies its parameter atomics
  into a `PedalSettings` at the top of each callback and passes it in.
- `processBlock()` enables flush-to-zero/denormals-are-zero for its scope: MXCSR
  on x86, FPCR.FZ on AArch64, FPSCR on 32-bit ARM. FZ is off by default on Pi
  Linux, and decaying reverb tails would otherwise fall into slow denormal
  arithmetic.
- Blocks larger than the prepared maximum are split internally.
- **Bypass:** tape uses true bypass once its 20 ms crossfade ends. Grain and
  reverb bypass *with trails*: their input fades out and the tail rings on.
  Once silent, they go idle and cost no CPU.

## Build and test

```bash
cmake -S . -B build -G Ninja && cmake --build build
./build/yardsale_tests renders     # runs every check, then writes demo WAVs to renders/
```

The harness replaces global `operator new` to count allocations. It then checks
that the chain allocates **zero** times under 30 s of random parameter
automation, including routing, freeze and bypass flips and irregular block
sizes. It runs every test at 44.1, 48 and 96 kHz:

| Check | Result (48 kHz) |
|---|---|
| Heap allocations on the audio path | 0 |
| Tape small-signal gain at +12 dB drive | −0.02 dB (drive compensation is exact) |
| Tape H2 / H3 at −6 dBFS, +12 dB drive | −31 / −18 dBc |
| Full wow, measured peak pitch deviation | 1.29 % (target 1.2 % + drift) |
| Reverb RT60 vs setting (300 Hz–3 kHz band) | 1.5 s → 1.51 s, 4.0 s → 4.01 s, with and without modulation |
| Grain transposition −12 / +7 / +12 st | target pitch 65–90 dB above the source |
| 60 s decay, 0 dBFS noise, full modulation | stays bounded |
| Bypassed and idle modules | bit-exact passthrough |
| Denormal guard | flushes inside the scope, restores after |
| CPU, full chain, 48 kHz, Xeon 2.8 GHz | ~3.9 % of one core |

The same suite also passes as an AArch64 (Cortex-A72) binary under
`qemu-aarch64`, and under ASan and UBSan. The CPU figure scales to very roughly
15–20 % of one Raspberry Pi 4 core. That is an estimate, not a hardware
measurement.

**Raspberry Pi** (native, or cross-compiled with `aarch64-linux-gnu-g++`):

```bash
cmake -S . -B build -DYARDSALE_PI_CPU=cortex-a72   # Pi 4; cortex-a76 for Pi 5
```

**Plugin** (VST3 + Standalone). This has been validated with pluginval at
strictness 10:

```bash
cmake -S . -B build-plugin -DYARDSALE_BUILD_PLUGIN=ON -DJUCE_DIR=/path/to/JUCE
cmake --build build-plugin
```

**Prebuilt VST3s.** The `Pedal plugin` GitHub Actions workflow builds
`Yard Sale.vst3` for Windows (x64, static runtime) and macOS (universal),
runs pluginval on each, and attaches them as the run's artifacts. To install:

- **Windows:** copy the `Yard Sale.vst3` folder to
  `C:\Program Files\Common Files\VST3\`.
- **macOS:** unzip, then copy to `~/Library/Audio/Plug-Ins/VST3/`. The build
  is ad-hoc signed, not notarised, so clear the download quarantine first:
  `xattr -dr com.apple.quarantine ~/Library/Audio/Plug-Ins/VST3/"Yard Sale.vst3"`.

In FL Studio, open **Options → Manage plugins**, click **Find plugins**, and
**Yard Sale** appears under Effects, from the vendor "Yard Sale Audio".

On the Pi, the host loop is a JACK or ALSA callback that does
`chain.setSettings(knobs.snapshot()); chain.processMonoToStereo(in, l, r, n);`.
A control thread writes the knob ADC readings into atomics. Nothing else needs
to change.

## The maths behind the "yard-sale" character

### Tape

- **Asymmetric saturation.** The saturator computes `tanh(x + b) − tanh(b)`.
  Pure tanh is odd-symmetric, so it only makes odd harmonics. The bias `b` bends
  the curve and adds a 2nd harmonic, which is the warm, "tube-ish" one. `b`
  wanders slowly (±0.04 at 0.07 Hz), so the harmonic balance keeps shifting like
  a record amp that is still warming up.
- **Record/playback emphasis.** An 8 dB treble shelf is applied before the
  saturator and removed after it. The shelf is `1 + k·HP(ωc)` and its exact
  inverse is `(1 + k·LP(ωc/(1+k)))/(1+k)`. Both are built with the same
  bilinear warping, so small signals come out flat. Loud treble, like pick
  attack, hits the curve harder than bass does. That frequency-dependent
  compression is the core of tape's "smooth top end".
- **ADAA instead of oversampling.** The output is the average of tanh over each
  sample interval, `(F(xₙ) − F(xₙ₋₁))/(xₙ − xₙ₋₁)` with `F = log cosh`. This
  removes most of the aliasing fizz at about a quarter of the cost of 2×
  oversampling, which matters on a Pi. It runs in double precision, because the
  difference quotient cancels badly in float.
- **Drive makeup.** Makeup gain is `1 / (drive · (1 − tanh²b))`, the inverse of
  the curve's slope at rest. Quiet playing stays at unity and only peaks
  compress, so the drive knob changes character, not volume.
- **Wow and flutter.** Both modulate a short delay line. A delay swinging by
  `A·sin(2πft)` shifts pitch by `2πfA/fs`, so the knobs are defined directly as
  pitch deviation (up to 1.2 % wow, 0.3 % flutter) and converted to excursion.
  - **Wow** is a 0.55 Hz sine whose rate hunts ±15 %, plus a Catmull-Rom random
    spline. The spline is smooth in both value and slope, so the drift has no
    corners and reads as a tired motor rather than digital randomness.
  - **Flutter** is a 7.3 Hz capstan sine plus band-limited noise.
  - **Latency.** The resting delay only covers the current excursion, so
    latency is about 3 samples with wow off.
- **Degradation.**
  - **Gap loss:** 19 kHz on a fresh reel down to 4.2 kHz on a worn cassette,
    at about 18 dB/oct.
  - **Head bump:** +1.5 to +3.5 dB at 85 Hz.
  - **Dropouts:** Poisson-timed level dips that also lose treble first, the
    way poor head contact does.
  - **Hiss:** pink/white noise, independent per track and placed before the
    playback EQ so it takes on the same bandwidth.

### Granular

- **Asynchronous onsets.** Gaps between grains blend a fixed grid with a
  Poisson process (exponential gaps), `mean·((1−a) + a·(−ln u))`. Irregular
  spacing is what keeps a cloud from buzzing like a comb filter.
- **Read heads never hit the seam.** A grain's distance behind the write head
  changes at `w − r` (forward) or `w + r` (reverse), where `w` is 1 while
  recording and 0 when frozen. Each grain's start is clamped so the distance
  stays inside the recorded audio for the grain's whole life. For example, a
  +12 st grain chases the write head and so must start at least one grain
  length back. A fade guard handles freeze being toggled mid-grain.
- **Swirl.**
  - **Pitch:** each grain gets random jitter and an occasional octave-up
    "shimmer" grain, plus a small linear pitch glide within the grain. The
    glide produces chorus-like smear.
  - **Pan:** the cloud's centre orbits slowly (sine plus drift). Each grain
    lands around it with constant-power panning and drifts across the field
    while it plays.
- **Level normalisation.** Overlapping grains are mostly uncorrelated, so level
  grows with √(overlap × 3/8), the Hann window's power. Gain is normalised by
  that.
- **Feedback.** Feedback is soft-clipped and taken after the tone filter, so
  each regeneration gets darker, like a tape echo.

### Reverb

- **Diffuser.** Four steps of 8-channel short delays, polarity flips and
  Hadamard mixing. Each step multiplies echo density by 8 while conserving
  energy.
- **Tank.** 8 lines with lengths spread exponentially from 48 to 180 ms, then
  detuned, mixed by a Householder matrix `I − (2/N)·11ᵀ`. The matrix is
  lossless and fully mixing, and costs O(N).
- **Decay.** Jot's rule `gᵢ = 10^(−3·Lᵢ / (RT60·fs))` gives every
  recirculation path the same RT60. `Lᵢ` includes the modulation centre offset
  and the in-loop allpass, whose mean energy delay is exactly its length. The
  measured RT60 lands within 3 % of the setting at 44.1–96 kHz.
- **Modulation.** Every tap is swept by its own sine (rates at irrational
  ratios) plus smooth random drift, read with Hermite interpolation. Linear
  interpolation would add a modulated treble loss that compounds on every pass
  through the loop. Constantly retuning the modes is what removes metallic
  ringing and gives the chorused Valhalla-style bloom.
- **Vintage damping.** One-pole low-pass and high-pass filters sit *inside* the
  loop, so highs and lows decay faster the longer the tail rings.
- **Loop saturation.** `1.5·tanh(x/1.5)` has unity slope at 0, so the decay
  maths holds at normal levels, and never has gain above 1, so the loop stays
  stable. Big swells are rounded off instead of piling up.
- **Size glides.** Changing size mid-tail glides over 600 ms and bends the
  pitch of the whole wash. This is deliberate.
