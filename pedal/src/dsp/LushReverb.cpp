#include "LushReverb.h"

namespace yardsale {

namespace {

constexpr int N = LushReverb::kLines;

// Tank line lengths at size = 1, spread exponentially between these bounds
// (then detuned) so no two share a common period.
constexpr float kShortestLineMs = 48.0f;
constexpr float kLongestLineMs = 180.0f;
constexpr float kMinSizeScale = 0.12f;

constexpr float kDiffuserStepMs[LushReverb::kDiffuserSteps] = { 21.0f, 13.0f, 8.0f, 5.0f };
constexpr float kAllpassMs[N] = { 4.1f, 5.3f, 6.7f, 3.3f, 7.9f, 4.7f, 5.9f, 3.7f };
constexpr float kMaxAllpassGain = 0.62f;

// Per-line LFO rate multipliers: no simple ratios, so the sweeps never line
// up into an audible common cycle.
constexpr float kRateSpread[N] = { 0.713f, 0.829f, 0.947f, 1.061f, 1.187f, 1.303f, 1.427f, 1.559f };

constexpr float kMaxModMs = 1.8f;
constexpr float kMaxPreDelayMs = 500.0f;
constexpr float kOutputScale = 0.6f;
constexpr float kSilence = 1.0e-5f;

// Orthonormal fast Walsh-Hadamard transform, 8 points.
inline void hadamard8(float* x)
{
    for (int h = 1; h < N; h <<= 1)
        for (int i = 0; i < N; i += h << 1)
            for (int j = i; j < i + h; ++j)
            {
                const float a = x[j];
                const float b = x[j + h];
                x[j] = a + b;
                x[j + h] = a - b;
            }
    for (int i = 0; i < N; ++i)
        x[i] *= 0.35355339f; // 1/sqrt(8)
}

// Householder reflection I - (2/N) * 1 1^T: orthogonal (lossless), every
// line feeds every other, and it costs O(N) instead of O(N^2).
inline void householder8(float* x)
{
    float sum = 0.0f;
    for (int i = 0; i < N; ++i)
        sum += x[i];
    sum *= -2.0f / static_cast<float>(N);
    for (int i = 0; i < N; ++i)
        x[i] += sum;
}

// Unity slope at the origin (so the RT60 maths holds for normal levels) and
// never above unity gain (so the loop stays stable), but big swells get
// rounded off instead of piling up - the old-hardware "bloom".
inline float tankSaturate(float x) { return 1.5f * fastTanh(x * (1.0f / 1.5f)); }

} // namespace

void LushReverb::prepare(double sr, int /*maxBlockSize*/)
{
    sampleRate = static_cast<float>(sr);
    Random rng(0x5EEDu);

    for (int s = 0; s < kDiffuserSteps; ++s)
    {
        const float range = kDiffuserStepMs[s] * 0.001f * sampleRate;
        for (int c = 0; c < N; ++c)
        {
            // Channel c gets a random delay inside its own slice of the range,
            // so the eight delays are guaranteed to be spread out.
            const float lo = range * static_cast<float>(c) / N;
            const float hi = range * static_cast<float>(c + 1) / N;
            const int d = std::max(1, static_cast<int>(lo + (hi - lo) * rng.nextFloat()));
            diffuserDelays[s][c] = d;
            diffuserLines[s][c].prepare(d + 1);
            diffuserFlips[s][c] = rng.nextFloat() < 0.5f ? -1.0f : 1.0f;
        }
    }

    maxModSamples = kMaxModMs * 0.001f * sampleRate;
    for (int c = 0; c < N; ++c)
    {
        const float t = static_cast<float>(c) / static_cast<float>(N - 1);
        const float ms = kShortestLineMs * std::pow(kLongestLineMs / kShortestLineMs, t)
                       * (1.0f + 0.04f * rng.nextBipolar());
        baseLength[c] = ms * 0.001f * sampleRate;
        tank[c].prepare(static_cast<int>(baseLength[c] + 2.0f * maxModSamples) + 8);
        tankAllpass[c].prepare(static_cast<int>(kAllpassMs[c] * 0.001f * sampleRate));

        sineMod[c].prepare(sampleRate);
        sineMod[c].setPhase(static_cast<float>(c) / N + 0.1f * rng.nextFloat());
        driftMod[c].prepare(sampleRate, 0xAB00u + static_cast<uint32_t>(c) * 131u);
    }

    maxPreDelay = kMaxPreDelayMs * 0.001f * sampleRate;
    preDelayL.prepare(static_cast<int>(maxPreDelay) + 8);
    preDelayR.prepare(static_cast<int>(maxPreDelay) + 8);

    // Size glides slowly: resizing the tank mid-tail bends the pitch of the
    // whole wash, like grabbing the reel. Intentional.
    sizeScale.prepare(sampleRate, 600.0f);
    modDepthSamples.prepare(sampleRate, 200.0f);
    preDelaySamples.prepare(sampleRate, 250.0f);
    inputGain.prepare(sampleRate, 20.0f);
    dryGain.prepare(sampleRate, 30.0f);
    wetGain.prepare(sampleRate, 30.0f);
    widthSmooth.prepare(sampleRate, 50.0f);
    allpassGain.prepare(sampleRate, 50.0f);

    // Re-apply every parameter against the new sample rate.
    setSize(size);
    setPreDelay(preDelayMs);
    setModDepth(modDepth);
    setModRate(modRate);
    setDiffusion(diffusion);
    setWidth(width);
    setMix(mix);
    lowCutApplied = highCutApplied = -1.0f;

    reset();
}

void LushReverb::reset()
{
    for (int s = 0; s < kDiffuserSteps; ++s)
        for (int c = 0; c < N; ++c)
            diffuserLines[s][c].reset();

    for (int c = 0; c < N; ++c)
    {
        tank[c].reset();
        tankAllpass[c].reset();
        highCut[c].reset();
        lowCut[c].reset();
    }
    preDelayL.reset();
    preDelayR.reset();

    sizeScale.snap(sizeScale.getTarget());
    modDepthSamples.snap(modDepthSamples.getTarget());
    preDelaySamples.snap(preDelaySamples.getTarget());
    inputGain.snap(inputGain.getTarget());
    dryGain.snap(dryGain.getTarget());
    wetGain.snap(wetGain.getTarget());
    widthSmooth.snap(widthSmooth.getTarget());
    allpassGain.snap(allpassGain.getTarget());

    decayAppliedScale = decayAppliedSeconds = -1.0f;
    idle = false;
    silentSamples = 0;
}

void LushReverb::setMix(float m)
{
    mix = clampf(m, 0.0f, 1.0f);
    updateMixTargets();
}

void LushReverb::updateMixTargets()
{
    dryGain.setTarget(enabled ? std::min(1.0f, 2.0f * (1.0f - mix)) : 1.0f);
    wetGain.setTarget(std::min(1.0f, 2.0f * mix));
    inputGain.setTarget(enabled ? 1.0f : 0.0f);
}

void LushReverb::setPreDelay(float ms)
{
    preDelayMs = clampf(ms, 0.0f, kMaxPreDelayMs);
    preDelaySamples.setTarget(preDelayMs * 0.001f * sampleRate);
}

void LushReverb::setSize(float amount)
{
    size = clampf(amount, 0.0f, 1.0f);
    sizeScale.setTarget(kMinSizeScale + (1.0f - kMinSizeScale) * size);
}

void LushReverb::setDecay(float seconds) { decaySeconds = clampf(seconds, 0.3f, 60.0f); }

void LushReverb::setDiffusion(float amount)
{
    diffusion = clampf(amount, 0.0f, 1.0f);
    allpassGain.setTarget(diffusion * kMaxAllpassGain);
}

void LushReverb::setModDepth(float amount)
{
    modDepth = clampf(amount, 0.0f, 1.0f);
    modDepthSamples.setTarget(modDepth * maxModSamples);
}

void LushReverb::setModRate(float hz)
{
    modRate = clampf(hz, 0.05f, 4.0f);
    for (int c = 0; c < N; ++c)
    {
        sineMod[c].setRate(modRate * kRateSpread[c]);
        driftMod[c].setRate(0.05f + 0.8f * modRate);
    }
}

void LushReverb::setLowCut(float hz) { lowCutHz = clampf(hz, 20.0f, 1000.0f); }
void LushReverb::setHighCut(float hz) { highCutHz = clampf(hz, 500.0f, 20000.0f); }
void LushReverb::setWidth(float amount) { width = clampf(amount, 0.0f, 1.0f); widthSmooth.setTarget(width); }

void LushReverb::setEnabled(bool shouldBeEnabled)
{
    enabled = shouldBeEnabled;
    if (enabled)
        idle = false;
    updateMixTargets();
}

void LushReverb::updateFilters()
{
    if (highCutHz != highCutApplied)
    {
        highCutApplied = highCutHz;
        for (OnePole& f : highCut)
            f.setCutoff(highCutHz, sampleRate);
    }
    if (lowCutHz != lowCutApplied)
    {
        lowCutApplied = lowCutHz;
        for (OnePole& f : lowCut)
            f.setCutoff(lowCutHz, sampleRate);
    }
}

// Jot's rule: give each line a gain proportional to its length,
//     g_i = 10^(-3 * L_i / (RT60 * fs)),
// so every recirculation path loses exactly 60 dB in RT60 seconds, whatever
// route the energy takes through the matrix. L_i counts the modulated line,
// its centre offset, the read-before-write sample and the allpass.
void LushReverb::updateDecayGains(float scale)
{
    if (std::fabs(scale - decayAppliedScale) < 1.0e-4f && decaySeconds == decayAppliedSeconds)
        return;
    decayAppliedScale = scale;
    decayAppliedSeconds = decaySeconds;

    for (int c = 0; c < N; ++c)
    {
        const float loop = baseLength[c] * scale + maxModSamples + 2.0f
                         + static_cast<float>(tankAllpass[c].getLength());
        decayGain[c] = std::pow(10.0f, -3.0f * loop / (decaySeconds * sampleRate));
    }
}

void LushReverb::process(float* left, float* right, int numSamples)
{
    if (idle)
    {
        if (!enabled)
            return;
        idle = false;
    }

    updateFilters();
    updateDecayGains(sizeScale.getCurrent());

    // A long tail builds more energy than a short one; take back half of that
    // (in dB) so long decays swell without drowning the dry signal.
    float meanGainSq = 0.0f;
    for (int c = 0; c < N; ++c)
        meanGainSq += decayGain[c] * decayGain[c] / N;
    const float outputScale = kOutputScale * std::pow(1.0f - meanGainSq, 0.25f);
    const float modOffset = maxModSamples + 1.0f;

    float blockPeak = 0.0f;

    for (int i = 0; i < numSamples; ++i)
    {
        const float scale = sizeScale.next();
        const float depth = modDepthSamples.next();
        const float gIn = inputGain.next();
        const float dry = dryGain.next();
        const float wet = wetGain.next();
        const float wid = widthSmooth.next();
        const float apGain = allpassGain.next();

        preDelayL.push(left[i] * gIn);
        preDelayR.push(right[i] * gIn);
        const float pd = std::max(preDelaySamples.next(), 1.0f);
        const float inL = preDelayL.readHermite(pd);
        const float inR = preDelayR.readHermite(pd);

        // Split stereo across 8 channels at unit total energy, then diffuse.
        float x[N];
        for (int c = 0; c < N; ++c)
            x[c] = 0.5f * ((c & 1) ? inR : inL);

        for (int s = 0; s < kDiffuserSteps; ++s)
        {
            for (int c = 0; c < N; ++c)
            {
                diffuserLines[s][c].push(x[c]);
                x[c] = diffuserLines[s][c].read(diffuserDelays[s][c]) * diffuserFlips[s][c];
            }
            hadamard8(x);
        }

        // Tank.
        float y[N];
        for (int c = 0; c < N; ++c)
        {
            const float mod = 0.65f * sineMod[c].next() + 0.35f * driftMod[c].next();
            float v = tank[c].readHermite(baseLength[c] * scale + modOffset + depth * mod);
            v = lowCut[c].processHP(highCut[c].processLP(v)); // vintage damping, in the loop
            v = tankAllpass[c].process(v, apGain);
            y[c] = v * decayGain[c];
        }

        // Two orthogonal Hadamard rows: decorrelated left/right from one tank.
        float wetL = (y[0] - y[1] + y[2] - y[3] + y[4] - y[5] + y[6] - y[7]) * outputScale;
        float wetR = (y[0] + y[1] - y[2] - y[3] + y[4] + y[5] - y[6] - y[7]) * outputScale;

        householder8(y);
        for (int c = 0; c < N; ++c)
            tank[c].push(x[c] + tankSaturate(y[c]));

        const float mid = 0.5f * (wetL + wetR);
        const float side = 0.5f * (wetL - wetR) * wid;
        wetL = mid + side;
        wetR = mid - side;

        blockPeak = std::max(blockPeak, std::max(std::fabs(wetL), std::fabs(wetR)));
        left[i] = left[i] * dry + wetL * wet;
        right[i] = right[i] * dry + wetR * wet;
    }

    // Bypassed with trails: let the tail ring out, then go idle once it has
    // been below -100 dBFS for a second (longer than the max pre-delay).
    if (!enabled && inputGain.isSettled() && blockPeak < kSilence)
    {
        silentSamples += numSamples;
        if (silentSamples > static_cast<int>(sampleRate))
            idle = true;
    }
    else
    {
        silentSamples = 0;
    }
}

} // namespace yardsale
