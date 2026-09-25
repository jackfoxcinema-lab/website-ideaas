// Modulated 8-line feedback delay network.
//
//   in -> pre-delay -> 4-step Hadamard diffuser (8 ch)
//      -> [ 8 modulated delay lines -> high-cut LP -> low-cut HP
//           -> allpass diffuser -> decay gain -> Householder mix
//           -> soft saturation ] -> back into the lines
//   out <- two orthogonal taps across the 8 line outputs -> width
//
// The delay taps are swept by a sine + smooth-random LFO per line, which
// constantly retunes the tank's modes. That is what kills the metallic ring
// and produces the chorused, lush "Valhalla" bloom.

#pragma once

#include "DelayLine.h"
#include "DspUtils.h"

namespace yardsale {

class LushReverb
{
public:
    static constexpr int kLines = 8;
    static constexpr int kDiffuserSteps = 4;

    // Not real-time safe (allocates). Call before audio starts.
    void prepare(double sampleRate, int maxBlockSize);
    void reset();

    // Audio-thread setters, cheap and allocation-free.
    void setMix(float mix);             // 0..1
    void setPreDelay(float ms);         // 0 .. 500 ms
    void setSize(float amount);         // 0..1 (tank lengths 12 % .. 100 %)
    void setDecay(float seconds);       // RT60, 0.3 .. 60 s
    void setDiffusion(float amount);    // 0..1 in-tank allpass density
    void setModDepth(float amount);     // 0..1 -> 0 .. 1.8 ms tap sweep
    void setModRate(float hz);          // 0.05 .. 4 Hz
    void setLowCut(float hz);           // in-loop high-pass, 20 .. 1000 Hz
    void setHighCut(float hz);          // in-loop low-pass, 500 .. 20000 Hz
    void setWidth(float amount);        // 0 (mono) .. 1 (full)
    void setEnabled(bool shouldBeEnabled); // bypass with trails

    void process(float* left, float* right, int numSamples);

    bool isIdle() const { return idle; }
    float getDecaySeconds() const { return decaySeconds; }

private:
    void updateFilters();
    void updateDecayGains(float sizeScale);
    void updateMixTargets();

    // 4-step multichannel diffuser: short fixed delays, polarity flips and an
    // 8x8 Hadamard mix per step. Each step multiplies echo density by 8.
    DelayLine diffuserLines[kDiffuserSteps][kLines];
    int diffuserDelays[kDiffuserSteps][kLines] = {};
    float diffuserFlips[kDiffuserSteps][kLines] = {};

    DelayLine preDelayL, preDelayR;
    DelayLine tank[kLines];
    SchroederAllpass tankAllpass[kLines];
    OnePole highCut[kLines], lowCut[kLines];
    SineLfo sineMod[kLines];
    DriftLfo driftMod[kLines];

    float baseLength[kLines] = {};  // samples, at size = 1
    float decayGain[kLines] = {};
    float maxModSamples = 0.0f;
    float maxPreDelay = 0.0f;

    float sampleRate = 48000.0f;
    float mix = 0.45f;
    float size = 0.8f;
    float decaySeconds = 8.0f;
    float diffusion = 0.75f;
    float modRate = 0.45f;
    float modDepth = 0.45f;
    float preDelayMs = 30.0f;
    float lowCutHz = 120.0f, highCutHz = 5500.0f;
    float lowCutApplied = -1.0f, highCutApplied = -1.0f;
    float width = 1.0f;
    float decayAppliedScale = -1.0f, decayAppliedSeconds = -1.0f;
    bool enabled = true;
    bool idle = false;
    int silentSamples = 0;

    Smoother sizeScale, modDepthSamples, preDelaySamples, inputGain, dryGain, wetGain, widthSmooth, allpassGain;
};

} // namespace yardsale
