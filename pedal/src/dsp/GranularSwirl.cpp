#include "GranularSwirl.h"

namespace yardsale {

namespace {

constexpr int kWindowSize = 1024;
constexpr float kBufferSeconds = 4.0f;       // rounded up to a power of two
constexpr float kMaxScatterSeconds = 1.5f;
constexpr double kSeamGuard = 64.0;          // samples kept clear of the write head
constexpr float kSilence = 1.0e-5f;          // -100 dBFS

} // namespace

void GranularSwirl::prepare(double sr, int /*maxBlockSize*/)
{
    sampleRate = static_cast<float>(sr);

    int size = 1;
    while (size < static_cast<int>(kBufferSeconds * sampleRate) + 1)
        size <<= 1;
    bufferLength = size;
    bufferMask = size - 1;
    buffer.assign(static_cast<size_t>(size), 0.0f);

    // Hann window with one guard point for the interpolated lookup.
    windowTable.assign(kWindowSize + 2, 0.0f);
    for (int k = 0; k <= kWindowSize; ++k)
        windowTable[static_cast<size_t>(k)] =
            0.5f - 0.5f * std::cos(kTwoPi * static_cast<float>(k) / static_cast<float>(kWindowSize));

    inputGain.prepare(sampleRate, 20.0f);
    dryGain.prepare(sampleRate, 30.0f);
    wetGain.prepare(sampleRate, 30.0f);
    feedback.prepare(sampleRate, 50.0f);
    positionSmooth.prepare(sampleRate, 150.0f);

    panLfo.prepare(sampleRate);
    panDrift.prepare(sampleRate, 0x5A1Eu);
    panDrift.setRate(0.13f);
    setSwirl(swirl);

    lowCutL.setCutoff(60.0f, sampleRate);
    lowCutR.setCutoff(60.0f, sampleRate);
    toneApplied = -1.0f;

    reset();
}

void GranularSwirl::reset()
{
    std::fill(buffer.begin(), buffer.end(), 0.0f);
    writePos = 0;
    silentWrites = 0;
    for (Grain& g : grains)
        g.active = false;
    samplesToNextGrain = 0.0f;
    feedbackSample = 0.0f;
    toneL.reset(); toneR.reset();
    lowCutL.reset(); lowCutR.reset();
    idle = false;

    setMix(mix); // recompute dry/wet/input targets
    inputGain.snap(inputGain.getTarget());
    dryGain.snap(dryGain.getTarget());
    wetGain.snap(wetGain.getTarget());
    feedback.snap(feedback.getTarget());
    positionSmooth.snap(positionMs * 0.001f * sampleRate);
}

void GranularSwirl::setMix(float m)
{
    mix = clampf(m, 0.0f, 1.0f);
    // "Both at unity in the middle": dry only starts to fall past 50 %, which
    // is how ambient players expect a wash control to behave.
    dryGain.setTarget(enabled ? std::min(1.0f, 2.0f * (1.0f - mix)) : 1.0f);
    wetGain.setTarget(std::min(1.0f, 2.0f * mix));
    inputGain.setTarget(enabled ? 1.0f : 0.0f);
}

void GranularSwirl::setGrainSize(float ms) { sizeMs = clampf(ms, 20.0f, 500.0f); }
void GranularSwirl::setDensity(float gps) { density = clampf(gps, 1.0f, 40.0f); }
void GranularSwirl::setPosition(float ms) { positionMs = clampf(ms, 0.0f, 2000.0f); }
void GranularSwirl::setScatter(float amount) { scatter = clampf(amount, 0.0f, 1.0f); }
void GranularSwirl::setPitch(float semitones) { pitch = clampf(semitones, -12.0f, 12.0f); }
void GranularSwirl::setPitchJitter(float cents) { pitchJitter = clampf(cents, 0.0f, 100.0f); }
void GranularSwirl::setAsync(float amount) { asyncAmount = clampf(amount, 0.0f, 1.0f); }
void GranularSwirl::setSpread(float amount) { spread = clampf(amount, 0.0f, 1.0f); }
void GranularSwirl::setReverseProbability(float p) { reverseProbability = clampf(p, 0.0f, 1.0f); }
void GranularSwirl::setShimmerProbability(float p) { shimmerProbability = clampf(p, 0.0f, 1.0f); }
void GranularSwirl::setFeedback(float amount) { feedback.setTarget(clampf(amount, 0.0f, 0.9f)); }
void GranularSwirl::setTone(float hz) { toneHz = clampf(hz, 1000.0f, 16000.0f); }
void GranularSwirl::setFreeze(bool shouldFreeze) { freeze = shouldFreeze; }

void GranularSwirl::setSwirl(float amount)
{
    swirl = clampf(amount, 0.0f, 1.0f);
    panLfo.setRate(0.05f + 0.35f * swirl);
}

void GranularSwirl::setEnabled(bool shouldBeEnabled)
{
    enabled = shouldBeEnabled;
    if (enabled)
        idle = false;
    setMix(mix);
}

float GranularSwirl::readBuffer(double position) const
{
    const int i = static_cast<int>(position);
    const float frac = static_cast<float>(position - static_cast<double>(i));
    return hermite4(frac,
                    buffer[static_cast<size_t>((i - 1) & bufferMask)],
                    buffer[static_cast<size_t>(i & bufferMask)],
                    buffer[static_cast<size_t>((i + 1) & bufferMask)],
                    buffer[static_cast<size_t>((i + 2) & bufferMask)]);
}

float GranularSwirl::window(float phase) const
{
    const float index = clampf(phase, 0.0f, 1.0f) * static_cast<float>(kWindowSize);
    const int i = static_cast<int>(index);
    const float frac = index - static_cast<float>(i);
    const float a = windowTable[static_cast<size_t>(i)];
    return a + frac * (windowTable[static_cast<size_t>(i + 1)] - a);
}

// Onset spacing blends a metronomic grid (async = 0) with a Poisson process
// (async = 1, exponentially distributed gaps). The irregular spacing is what
// stops a granular cloud sounding like a buzzing comb filter.
float GranularSwirl::scheduleInterval()
{
    const float mean = sampleRate / density;
    const float u = rng.nextFloat();
    const float exponential = std::min(-std::log(1.0f - u), 4.0f);
    return std::max(1.0f, mean * ((1.0f - asyncAmount) + asyncAmount * exponential));
}

void GranularSwirl::spawnGrain()
{
    Grain* g = nullptr;
    for (Grain& candidate : grains)
    {
        if (!candidate.active)
        {
            g = &candidate;
            break;
        }
    }
    if (g == nullptr)
        return; // all voices busy: skip rather than steal, avoids clicks

    const bool writing = !(freeze && enabled);

    float length = std::max(64.0f, sizeMs * 0.001f * sampleRate * (1.0f + 0.2f * rng.nextBipolar()));

    // Pitch: base transposition, random jitter, occasional octave-up
    // "shimmer" grain, and a slow glide inside the grain for chorus smear.
    float semitones = pitch + pitchJitter * 0.01f * rng.nextBipolar();
    if (rng.nextFloat() < shimmerProbability)
        semitones += 12.0f;
    const float startRate = std::exp2(semitones / 12.0f);
    const float endRate = startRate * std::exp2(swirl * 18.0f * rng.nextBipolar() / 1200.0f);
    const bool reverse = rng.nextFloat() < reverseProbability;

    // Keep the read head inside recorded audio for the grain's whole life.
    // Distance behind the write head changes at s = w - r (forward) or
    // s = w + r (reverse), where w is 1 while recording and 0 when frozen.
    // So a +12 st grain chases the write head at 1 sample/sample and must
    // start at least N samples back, or it would run into the seam.
    const float w = writing ? 1.0f : 0.0f;
    const float rMin = std::min(startRate, endRate);
    const float rMax = std::max(startRate, endRate);
    const float sMin = reverse ? w + rMin : w - rMax;
    const float sMax = reverse ? w + rMax : w - rMin;
    const float grow = std::max(0.0f, sMax);
    const float shrink = -std::min(0.0f, sMin);

    const float dMin = static_cast<float>(kSeamGuard) + 8.0f;
    const float dMax = static_cast<float>(bufferLength) - static_cast<float>(kSeamGuard) - 8.0f;
    if (grow + shrink > 0.0f)
        length = std::min(length, (dMax - dMin) / (grow + shrink));

    const float desired = positionSmooth.getCurrent()
                        + scatter * kMaxScatterSeconds * sampleRate * rng.nextFloat();
    const float lo = dMin + shrink * length;
    const float hi = dMax - grow * length;
    const float distance = clampf(desired, lo, hi);

    double start = static_cast<double>(writePos) - static_cast<double>(distance);
    if (start < 0.0)
        start += static_cast<double>(bufferLength);

    // Stereo: the cloud's centre orbits slowly; each grain lands somewhere
    // around it and drifts across the field while it plays.
    const float centre = 0.7f * swirl * (0.7f * panLfoValue + 0.3f * panDriftValue);
    const float panStart = clampf(centre + spread * rng.nextBipolar(), -1.0f, 1.0f);
    const float panEnd = clampf(panStart + 0.5f * swirl * rng.nextBipolar(), -1.0f, 1.0f);
    const float thetaStart = (panStart + 1.0f) * kPi * 0.25f;
    const float thetaEnd = (panEnd + 1.0f) * kPi * 0.25f;

    // Overlapping grains are mostly uncorrelated, so their sum grows with the
    // square root of the overlap (Hann power = 3/8). Normalise for that.
    const float overlap = density * sizeMs * 0.001f;
    const float amplitude = dbToGain(1.5f * rng.nextBipolar()) / std::sqrt(std::max(1.0f, overlap * 0.375f));

    g->active = true;
    g->position = start;
    g->rate = reverse ? -startRate : startRate;
    g->rateStep = ((reverse ? -endRate : endRate) - g->rate) / static_cast<double>(length);
    g->phase = 0.0f;
    g->phaseStep = 1.0f / length;
    g->gainL = std::cos(thetaStart);
    g->gainR = std::sin(thetaStart);
    g->gainLStep = (std::cos(thetaEnd) - g->gainL) / length;
    g->gainRStep = (std::sin(thetaEnd) - g->gainR) / length;
    g->amplitude = amplitude;
    g->samplesLeft = static_cast<int>(length);
}

void GranularSwirl::process(float* left, float* right, int numSamples)
{
    if (idle)
    {
        if (!enabled)
            return;
        idle = false;
    }

    if (toneHz != toneApplied)
    {
        toneApplied = toneHz;
        toneL.setCutoff(toneHz, sampleRate);
        toneR.setCutoff(toneHz, sampleRate);
    }

    positionSmooth.setTarget(positionMs * 0.001f * sampleRate);
    const bool writing = !(freeze && enabled);
    const double length = static_cast<double>(bufferLength);
    float blockPeak = 0.0f;

    for (int i = 0; i < numSamples; ++i)
    {
        const float in = 0.5f * (left[i] + right[i]) * inputGain.next();
        const float fb = feedback.next();
        const float dry = dryGain.next();
        const float wet = wetGain.next();
        positionSmooth.next();
        panLfoValue = panLfo.next();
        panDriftValue = panDrift.next();

        if (writing)
        {
            // Regenerations are soft-clipped so high feedback blooms instead of exploding.
            const float w = in + fastTanh(fb * feedbackSample);
            buffer[static_cast<size_t>(writePos)] = w;
            writePos = (writePos + 1) & bufferMask;
            silentWrites = std::fabs(w) < kSilence ? std::min(silentWrites + 1, bufferLength) : 0;
        }

        samplesToNextGrain -= 1.0f;
        if (samplesToNextGrain <= 0.0f)
        {
            spawnGrain();
            samplesToNextGrain += scheduleInterval();
        }

        float wetL = 0.0f, wetR = 0.0f;
        for (Grain& g : grains)
        {
            if (!g.active)
                continue;

            float s = readBuffer(g.position) * window(g.phase) * g.amplitude;

            // Safety net for mid-grain freeze toggles: fade out rather than
            // read across the discontinuity at the write head.
            double distance = static_cast<double>(writePos) - g.position;
            if (distance < 0.0)
                distance += length;
            const double edge = std::min(distance, length - distance) - 4.0;
            if (edge < kSeamGuard)
            {
                if (edge <= 0.0)
                {
                    g.active = false;
                    continue;
                }
                s *= static_cast<float>(edge / kSeamGuard);
            }

            wetL += s * g.gainL;
            wetR += s * g.gainR;

            g.position += g.rate;
            if (g.position >= length)
                g.position -= length;
            else if (g.position < 0.0)
                g.position += length;
            g.rate += g.rateStep;
            g.phase += g.phaseStep;
            g.gainL += g.gainLStep;
            g.gainR += g.gainRStep;
            if (--g.samplesLeft <= 0)
                g.active = false;
        }

        // Darken and de-mud the cloud; the feedback is taken after this, so
        // every regeneration gets a little duller, like a tape echo.
        wetL = lowCutL.processHP(toneL.processLP(wetL));
        wetR = lowCutR.processHP(toneR.processLP(wetR));
        feedbackSample = 0.5f * (wetL + wetR);

        blockPeak = std::max(blockPeak, std::max(std::fabs(wetL), std::fabs(wetR)));
        left[i] = left[i] * dry + wetL * wet;
        right[i] = right[i] * dry + wetR * wet;
    }

    // Bypassed with trails: once the whole buffer has been overwritten with
    // silence and the cloud is quiet, stop spending CPU.
    if (!enabled && inputGain.isSettled() && silentWrites >= bufferLength && blockPeak < kSilence)
        idle = true;
}

} // namespace yardsale
