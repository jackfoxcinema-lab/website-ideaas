// The whole pedal: input conditioning, three modules in a selectable order,
// and an output safety stage. Framework-agnostic: a JUCE plugin, a JACK/ALSA
// host on the Raspberry Pi, or an offline renderer all drive it the same way.
//
// Threading contract:
//   prepare()                   - setup thread, may allocate
//   setSettings(), process*()   - audio thread only, never allocate or lock
// A host copies its parameter atomics into a PedalSettings at the top of each
// callback and calls setSettings() before processing.

#pragma once

#include "GranularSwirl.h"
#include "LushReverb.h"
#include "TapeStage.h"

namespace yardsale {

enum class Routing
{
    TapeGrainVerb, // default: tape colours the input, the cloud is washed by the verb
    TapeVerbGrain, // grains of the reverb wash
    GrainTapeVerb,
    GrainVerbTape, // everything "printed to tape" at the end
    VerbTapeGrain,
    VerbGrainTape,
};

struct PedalSettings
{
    float inputGainDb = 0.0f;
    float outputGainDb = 0.0f;
    Routing routing = Routing::TapeGrainVerb;

    struct Tape
    {
        bool enabled = true;
        float driveDb = 6.0f;
        float wow = 0.35f;
        float flutter = 0.3f;
        float age = 0.4f;
        float hiss = 0.3f;
        float dropouts = 0.15f;
        float outputDb = 0.0f;
    } tape;

    struct Grain
    {
        bool enabled = true;
        float mix = 0.35f;
        float sizeMs = 180.0f;
        float density = 12.0f;
        float positionMs = 350.0f;
        float scatter = 0.4f;
        float pitch = 0.0f;
        float pitchJitterCents = 12.0f;
        float async = 0.7f;
        float spread = 0.8f;
        float reverse = 0.25f;
        float shimmer = 0.15f;
        float swirl = 0.5f;
        float feedback = 0.35f;
        float toneHz = 6000.0f;
        bool freeze = false;
    } grain;

    struct Verb
    {
        bool enabled = true;
        float mix = 0.45f;
        float preDelayMs = 30.0f;
        float size = 0.8f;
        float decaySeconds = 8.0f;
        float diffusion = 0.75f;
        float modDepth = 0.45f;
        float modRateHz = 0.45f;
        float lowCutHz = 120.0f;
        float highCutHz = 5500.0f;
        float width = 1.0f;
    } verb;
};

class PedalChain
{
public:
    // Not real-time safe (allocates). Call before audio starts or when the
    // sample rate / maximum block size changes.
    void prepare(double sampleRate, int maxBlockSize);
    void reset();

    void setSettings(const PedalSettings& settings);

    // In-place stereo processing. numSamples may exceed maxBlockSize.
    void processBlock(float* left, float* right, int numSamples);

    // Mono guitar in, stereo out (the usual pedal case).
    void processMonoToStereo(const float* input, float* left, float* right, int numSamples);

    double getTailSeconds() const;

private:
    enum class Module { Tape, Grain, Verb };

    void processChunk(float* left, float* right, int numSamples);
    void runModule(Module module, float* left, float* right, int numSamples);

    TapeStage tape;
    GranularSwirl grain;
    LushReverb verb;

    float sampleRate = 48000.0f;
    int maxBlock = 512;

    Routing activeRouting = Routing::TapeGrainVerb;
    Routing requestedRouting = Routing::TapeGrainVerb;
    float routingFade = 1.0f;     // ducks the output while the order changes
    float routingFadeStep = 0.0f;

    Smoother inputGain, outputGain;
    OnePole dcBlockL, dcBlockR;
};

} // namespace yardsale
