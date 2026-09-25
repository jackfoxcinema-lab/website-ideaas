#include "TapeStage.h"

namespace yardsale {

namespace {

// Record-side emphasis: +8 dB shelf above ~2.5 kHz going into the saturator,
// exactly undone after it. Loud treble therefore hits the tanh harder than
// loud bass - the HF compression that makes tape sound smooth on pick attack.
constexpr float kEmphasisHz = 2500.0f;
constexpr float kEmphasis = 1.5f;  // shelf gain - 1

// Resting asymmetry of the saturator: tanh(x + b) - tanh(b) has a 2nd
// harmonic that pure tanh lacks. The bias wanders slowly, like a record
// amp drifting as it warms up.
constexpr float kBias = 0.12f;
constexpr float kBiasDriftDepth = 0.04f;
constexpr float kBiasDriftHz = 0.07f;

// Transport. Rates are for a tired capstan motor, not a calibrated deck.
constexpr float kWowHz = 0.55f;
constexpr float kWowRateWander = 0.15f;  // +-15 % motor speed hunting
constexpr float kWowDriftShare = 0.35f;
constexpr float kMaxWowDeviation = 0.012f;      // 1.2 % pitch
constexpr float kFlutterHz = 7.3f;
constexpr float kFlutterNoiseHz = 22.0f;
constexpr float kMaxFlutterDeviation = 0.003f;  // 0.3 % pitch
constexpr float kTransportMargin = 2.0f;        // samples

constexpr float kDropoutsPerSecond = 0.8f;

} // namespace

void TapeStage::prepare(double sr, int /*maxBlockSize*/)
{
    sampleRate = static_cast<float>(sr);

    // Worst case excursion is ~5 ms at full wow; 30 ms leaves room at any rate.
    const int transportSize = static_cast<int>(0.03f * sampleRate) + 8;
    maxTransportDelay = static_cast<float>(transportSize - 4);

    const float emphasisG = OnePole::gFor(kEmphasisHz, sampleRate);
    for (int ch = 0; ch < 2; ++ch)
    {
        Channel& c = channels[ch];
        c.transport.prepare(transportSize);
        c.preEmphasis.setG(emphasisG);
        // Same bilinear warping, pole moved down by (1 + k): the de-emphasis
        // is the exact inverse of the pre-emphasis for small signals.
        c.deEmphasis.setG(emphasisG / (1.0f + kEmphasis));
        c.hiss.seed(0x7A9E5u + static_cast<uint32_t>(ch) * 7919u);
        c.dropoutLowpass.setCutoff(2200.0f, sampleRate);
    }

    drive.prepare(sampleRate, 30.0f);
    wowDepth.prepare(sampleRate, 120.0f);
    flutterDepth.prepare(sampleRate, 120.0f);
    hissLevel.prepare(sampleRate, 50.0f);
    outputGain.prepare(sampleRate, 30.0f);
    baseDelay.prepare(sampleRate, 250.0f);
    bypassMix.prepare(sampleRate, 20.0f);

    wowLfo.prepare(sampleRate);
    flutterLfo.prepare(sampleRate);
    flutterLfo.setRate(kFlutterHz);
    wowDrift.prepare(sampleRate, 0x1111u);
    wowDrift.setRate(0.4f);
    wowRateDrift.prepare(sampleRate, 0x2222u);
    wowRateDrift.setRate(0.11f);
    flutterNoise.prepare(sampleRate, 0x3333u);
    flutterNoise.setRate(kFlutterNoiseHz);
    biasDrift.prepare(sampleRate, 0x4444u);
    biasDrift.setRate(kBiasDriftHz);

    dropoutAttack = 1.0f - std::exp(-1.0f / (0.008f * sampleRate));
    dropoutRelease = 1.0f - std::exp(-1.0f / (0.060f * sampleRate));

    ageApplied = -1.0f;
    reset();
}

void TapeStage::reset()
{
    for (Channel& c : channels)
    {
        c.preEmphasis.reset();
        c.deEmphasis.reset();
        c.saturator.reset();
        c.transport.reset();
        c.dropoutLowpass.reset();
        c.headBump.reset();
        c.gapLoss.reset();
        c.lowCut.reset();
        c.gapLossPole.reset();
    }

    drive.snap(drive.getTarget() > 0.0f ? drive.getTarget() : 1.0f);
    wowDepth.snap(wowDepth.getTarget());
    flutterDepth.snap(flutterDepth.getTarget());
    hissLevel.snap(hissLevel.getTarget());
    outputGain.snap(outputGain.getTarget() > 0.0f ? outputGain.getTarget() : 1.0f);
    bypassMix.snap(enabled ? 1.0f : 0.0f);
    fullyBypassed = !enabled;

    const float wowAmp = wowDepth.getTarget() * sampleRate / (kTwoPi * kWowHz);
    baseDelay.snap(wowAmp * (1.0f + kWowDriftShare) + kTransportMargin + 1.0f);

    dropoutHold = 0;
    dropoutTarget = 1.0f;
    dropoutGain = 1.0f;
}

void TapeStage::setDrive(float db) { drive.setTarget(dbToGain(clampf(db, 0.0f, 18.0f))); }

void TapeStage::setWow(float amount)
{
    const float a = clampf(amount, 0.0f, 1.0f);
    wowDepth.setTarget(a * a * kMaxWowDeviation); // squared: fine control near zero
}

void TapeStage::setFlutter(float amount)
{
    const float a = clampf(amount, 0.0f, 1.0f);
    flutterDepth.setTarget(a * a * kMaxFlutterDeviation);
}

void TapeStage::setAge(float amount) { ageTarget = clampf(amount, 0.0f, 1.0f); }

void TapeStage::setHiss(float amount)
{
    const float a = clampf(amount, 0.0f, 1.0f);
    hissLevel.setTarget(a <= 0.0f ? 0.0f : dbToGain(lerp(-78.0f, -46.0f, a)));
}

void TapeStage::setDropouts(float amount) { dropoutAmount = clampf(amount, 0.0f, 1.0f); }

void TapeStage::setOutputGain(float db) { outputGain.setTarget(dbToGain(clampf(db, -24.0f, 12.0f))); }

void TapeStage::setEnabled(bool shouldBeEnabled)
{
    enabled = shouldBeEnabled;
    bypassMix.setTarget(enabled ? 1.0f : 0.0f);
}

void TapeStage::updatePlaybackEq()
{
    if (ageTarget == ageApplied)
        return;
    ageApplied = ageTarget;

    // Gap loss: 19 kHz on a fresh reel down to 4.2 kHz on a worn cassette,
    // 2-pole SVF plus a one-pole a little higher for an ~18 dB/oct knee.
    const float cutoff = expMap(ageApplied, 19000.0f, 4200.0f);
    // Head bump grows as the tape gets older/slower: +1.5 .. +3.5 dB at 85 Hz.
    const float bumpDb = 1.5f + 2.0f * ageApplied;

    for (Channel& c : channels)
    {
        c.gapLoss.setLowpass(cutoff, 0.62f, sampleRate);
        c.gapLossPole.setCutoff(std::min(cutoff * 1.6f, 0.45f * sampleRate), sampleRate);
        c.headBump.setBell(85.0f, 1.1f, bumpDb, sampleRate);
        c.lowCut.setHighpass(30.0f, 0.6f, sampleRate);
    }
}

void TapeStage::process(float* left, float* right, int numSamples)
{
    if (fullyBypassed)
    {
        if (!enabled)
            return; // true bypass: untouched, zero CPU
        // Coming back from true bypass: flush the ~ms of stale transport audio.
        reset();
        bypassMix.snap(0.0f);
        bypassMix.setTarget(1.0f);
        fullyBypassed = false;
    }

    updatePlaybackEq();

    float* io[2] = { left, right };

    for (int i = 0; i < numSamples; ++i)
    {
        const float driveGain = drive.next();
        const float wowDev = wowDepth.next();
        const float flutterDev = flutterDepth.next();
        const float hiss = hissLevel.next();
        const float outGain = outputGain.next();
        const float wet = bypassMix.next();

        // --- saturator operating point ---------------------------------------
        const float bias = kBias + kBiasDriftDepth * biasDrift.next();
        const float tanhBias = std::tanh(bias);
        // Unity small-signal gain: quiet playing stays at the same level, only
        // peaks get squashed. Drive changes the character, not the volume.
        const float makeup = 1.0f / (driveGain * (1.0f - tanhBias * tanhBias));

        // --- transport: wow & flutter as delay modulation ---------------------
        // A delay swinging as A*sin(2*pi*f*t) shifts pitch by 2*pi*f*A/fs, so
        // for a target pitch deviation d the excursion is A = d*fs / (2*pi*f).
        const float wowAmp = wowDev * sampleRate / (kTwoPi * kWowHz);
        const float flutterSineAmp = 0.6f * flutterDev * sampleRate / (kTwoPi * kFlutterHz);
        // Catmull-Rom noise at rate r has a slope of roughly +-2r, so d = A*2r/fs.
        const float flutterNoiseAmp = 0.4f * flutterDev * sampleRate / (2.0f * kFlutterNoiseHz);

        wowLfo.setRate(kWowHz * (1.0f + kWowRateWander * wowRateDrift.next()));
        const float modulation = wowAmp * (wowLfo.next() + kWowDriftShare * wowDrift.next())
                               + flutterSineAmp * flutterLfo.next()
                               + flutterNoiseAmp * flutterNoise.next();

        // The resting delay only needs to cover the current excursion, so with
        // wow off the stage adds almost no latency. Moving it slowly is heard
        // as the motor speeding up/down - which is on-brand.
        baseDelay.setTarget(wowAmp * (1.0f + kWowDriftShare) + flutterSineAmp + flutterNoiseAmp
                            + kTransportMargin + 1.0f);
        const float delay = clampf(baseDelay.next() + modulation, 1.0f, maxTransportDelay);

        // --- dropouts: brief loss of head contact ------------------------------
        if (dropoutHold > 0)
        {
            if (--dropoutHold == 0)
                dropoutTarget = 1.0f;
        }
        else if (dropoutAmount > 0.0f
                 && dropoutRng.nextFloat() < dropoutAmount * kDropoutsPerSecond / sampleRate)
        {
            const float depth = dropoutAmount * (0.25f + 0.75f * dropoutRng.nextFloat());
            dropoutTarget = 1.0f - 0.75f * depth;  // down to about -12 dB
            dropoutHold = static_cast<int>((0.03f + 0.2f * dropoutRng.nextFloat()) * sampleRate);
        }
        dropoutGain += (dropoutTarget < dropoutGain ? dropoutAttack : dropoutRelease)
                     * (dropoutTarget - dropoutGain);
        // Lost head contact costs treble before it costs level.
        const float dropoutDullness = clampf((1.0f - dropoutGain) * 2.5f, 0.0f, 1.0f);

        for (int ch = 0; ch < 2; ++ch)
        {
            Channel& c = channels[ch];
            const float dry = io[ch][i];

            // Record side.
            const float x = dry * driveGain;
            const float emphasised = x + kEmphasis * c.preEmphasis.processHP(x);
            const float saturated = c.saturator.process(emphasised + bias) - tanhBias;
            const float recorded = (saturated + kEmphasis * c.deEmphasis.processLP(saturated))
                                 * (1.0f / (1.0f + kEmphasis)) * makeup;

            // Transport. Both tracks share one capstan, so one modulation.
            c.transport.push(recorded);
            float y = c.transport.readHermite(delay);

            // Hiss lives on the tape, so it goes through dropouts and playback EQ.
            if (hiss > 0.0f)
                y += hiss * c.hiss.next();

            y *= dropoutGain;
            y += dropoutDullness * (c.dropoutLowpass.processLP(y) - y);

            // Playback side.
            y = c.headBump.process(y);
            y = c.gapLossPole.processLP(c.gapLoss.process(y));
            y = c.lowCut.process(y) * outGain;

            io[ch][i] = dry + wet * (y - dry);
        }
    }

    // Switch to true bypass once the wet share is below -80 dB.
    if (!enabled && bypassMix.getCurrent() < 1.0e-4f)
    {
        bypassMix.snap(0.0f);
        fullyBypassed = true;
    }
}

} // namespace yardsale
