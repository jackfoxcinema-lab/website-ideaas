#include "PedalChain.h"

namespace yardsale {

namespace {

constexpr int kModuleCount = 3;

// Soft knee above -1 dBFS, hard ceiling at 0 dBFS. Long reverb swells with
// grain feedback can stack up; this keeps the pedal from clipping the
// Pi's DAC while leaving normal levels untouched.
inline float safetyLimit(float x)
{
    constexpr float knee = 0.89f;
    const float a = std::fabs(x);
    if (a <= knee)
        return x;
    const float shaped = knee + (1.0f - knee) * std::tanh((a - knee) / (1.0f - knee));
    return x < 0.0f ? -shaped : shaped;
}

} // namespace

void PedalChain::prepare(double sr, int maxBlockSize)
{
    sampleRate = static_cast<float>(sr);
    maxBlock = std::max(1, maxBlockSize);

    tape.prepare(sr, maxBlock);
    grain.prepare(sr, maxBlock);
    verb.prepare(sr, maxBlock);

    inputGain.prepare(sampleRate, 20.0f);
    outputGain.prepare(sampleRate, 20.0f);
    dcBlockL.setCutoff(8.0f, sampleRate);
    dcBlockR.setCutoff(8.0f, sampleRate);
    routingFadeStep = 1.0f / (0.004f * sampleRate); // 4 ms out, 4 ms in

    reset();
}

void PedalChain::reset()
{
    tape.reset();
    grain.reset();
    verb.reset();
    dcBlockL.reset();
    dcBlockR.reset();
    inputGain.snap(inputGain.getTarget() > 0.0f ? inputGain.getTarget() : 1.0f);
    outputGain.snap(outputGain.getTarget() > 0.0f ? outputGain.getTarget() : 1.0f);
    activeRouting = requestedRouting;
    routingFade = 1.0f;
}

void PedalChain::setSettings(const PedalSettings& s)
{
    inputGain.setTarget(dbToGain(s.inputGainDb));
    outputGain.setTarget(dbToGain(s.outputGainDb));
    requestedRouting = s.routing;

    tape.setEnabled(s.tape.enabled);
    tape.setDrive(s.tape.driveDb);
    tape.setWow(s.tape.wow);
    tape.setFlutter(s.tape.flutter);
    tape.setAge(s.tape.age);
    tape.setHiss(s.tape.hiss);
    tape.setDropouts(s.tape.dropouts);
    tape.setOutputGain(s.tape.outputDb);

    grain.setEnabled(s.grain.enabled);
    grain.setMix(s.grain.mix);
    grain.setGrainSize(s.grain.sizeMs);
    grain.setDensity(s.grain.density);
    grain.setPosition(s.grain.positionMs);
    grain.setScatter(s.grain.scatter);
    grain.setPitch(s.grain.pitch);
    grain.setPitchJitter(s.grain.pitchJitterCents);
    grain.setAsync(s.grain.async);
    grain.setSpread(s.grain.spread);
    grain.setReverseProbability(s.grain.reverse);
    grain.setShimmerProbability(s.grain.shimmer);
    grain.setSwirl(s.grain.swirl);
    grain.setFeedback(s.grain.feedback);
    grain.setTone(s.grain.toneHz);
    grain.setFreeze(s.grain.freeze);

    verb.setEnabled(s.verb.enabled);
    verb.setMix(s.verb.mix);
    verb.setPreDelay(s.verb.preDelayMs);
    verb.setSize(s.verb.size);
    verb.setDecay(s.verb.decaySeconds);
    verb.setDiffusion(s.verb.diffusion);
    verb.setModDepth(s.verb.modDepth);
    verb.setModRate(s.verb.modRateHz);
    verb.setLowCut(s.verb.lowCutHz);
    verb.setHighCut(s.verb.highCutHz);
    verb.setWidth(s.verb.width);
}

void PedalChain::processBlock(float* left, float* right, int numSamples)
{
    ScopedFlushDenormals noDenormals;

    for (int offset = 0; offset < numSamples; offset += maxBlock)
        processChunk(left + offset, right + offset, std::min(maxBlock, numSamples - offset));
}

void PedalChain::processMonoToStereo(const float* input, float* left, float* right, int numSamples)
{
    if (left != input)
        std::copy(input, input + numSamples, left);
    if (right != input)
        std::copy(input, input + numSamples, right);
    processBlock(left, right, numSamples);
}

void PedalChain::runModule(Module module, float* left, float* right, int numSamples)
{
    switch (module)
    {
        case Module::Tape:  tape.process(left, right, numSamples); break;
        case Module::Grain: grain.process(left, right, numSamples); break;
        case Module::Verb:  verb.process(left, right, numSamples); break;
    }
}

void PedalChain::processChunk(float* left, float* right, int numSamples)
{
    static constexpr Module kOrders[][kModuleCount] = {
        { Module::Tape, Module::Grain, Module::Verb },
        { Module::Tape, Module::Verb, Module::Grain },
        { Module::Grain, Module::Tape, Module::Verb },
        { Module::Grain, Module::Verb, Module::Tape },
        { Module::Verb, Module::Tape, Module::Grain },
        { Module::Verb, Module::Grain, Module::Tape },
    };

    // The order can only change between chunks, and only once the output
    // has been ducked to silence, so a routing switch never clicks.
    if (requestedRouting != activeRouting && routingFade <= 0.0f)
        activeRouting = requestedRouting;

    for (int i = 0; i < numSamples; ++i)
    {
        const float g = inputGain.next();
        // DC blocker: codec offsets would otherwise bias the tape saturator.
        left[i] = dcBlockL.processHP(left[i] * g);
        right[i] = dcBlockR.processHP(right[i] * g);
    }

    for (Module m : kOrders[static_cast<int>(activeRouting)])
        runModule(m, left, right, numSamples);

    for (int i = 0; i < numSamples; ++i)
    {
        if (requestedRouting != activeRouting)
            routingFade = std::max(0.0f, routingFade - routingFadeStep);
        else
            routingFade = std::min(1.0f, routingFade + routingFadeStep);

        const float g = outputGain.next() * routingFade;
        left[i] = safetyLimit(left[i] * g);
        right[i] = safetyLimit(right[i] * g);
    }
}

double PedalChain::getTailSeconds() const
{
    // Reverb RT60 plus the longest a grain can reach back into the buffer.
    return static_cast<double>(verb.getDecaySeconds()) + 6.0;
}

} // namespace yardsale
