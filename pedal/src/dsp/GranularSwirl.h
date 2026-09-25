// Granular delay / micro-looper.
//
// The input is recorded (mono) into a ~5 s circular buffer. A stochastic
// scheduler fires grains that read back from it at their own pitch, direction
// and stereo position, and the overlapped grains are summed into a stereo
// cloud. Freeze stops recording so the grains scan a held buffer, turning the
// module into a micro-looper.

#pragma once

#include "DspUtils.h"

#include <vector>

namespace yardsale {

class GranularSwirl
{
public:
    static constexpr int kMaxGrains = 24;

    // Not real-time safe (allocates). Call before audio starts.
    void prepare(double sampleRate, int maxBlockSize);
    void reset();

    // Audio-thread setters, cheap and allocation-free.
    void setMix(float mix);                   // 0..1
    void setGrainSize(float ms);              // 20 .. 500 ms
    void setDensity(float grainsPerSecond);   // 1 .. 40
    void setPosition(float ms);               // 0 .. 2000 ms behind the input
    void setScatter(float amount);            // 0..1 -> up to 1.5 s random position spread
    void setPitch(float semitones);           // -12 .. +12
    void setPitchJitter(float cents);         // 0 .. 100 cents random per grain
    void setAsync(float amount);              // 0 = metronomic, 1 = Poisson onsets
    void setSpread(float amount);             // 0..1 stereo spread of grain pans
    void setReverseProbability(float p);      // 0..1
    void setShimmerProbability(float p);      // 0..1 chance of a grain an octave up
    void setSwirl(float amount);              // 0..1 pan rotation + in-grain pitch drift
    void setFeedback(float amount);           // 0 .. 0.9
    void setTone(float hz);                   // wet low-pass, 1 .. 16 kHz
    void setFreeze(bool shouldFreeze);
    void setEnabled(bool shouldBeEnabled);    // bypass with trails

    void process(float* left, float* right, int numSamples);

    // True once bypassed and fully drained: process() is then a no-op.
    bool isIdle() const { return idle; }

private:
    struct Grain
    {
        bool active = false;
        double position = 0.0;  // absolute buffer position (double: sub-sample accuracy over 2^18 samples)
        double rate = 1.0;      // signed read increment, per sample
        double rateStep = 0.0;  // linear pitch glide across the grain
        float phase = 0.0f;     // 0..1 through the window
        float phaseStep = 0.0f;
        float gainL = 0.0f, gainR = 0.0f;
        float gainLStep = 0.0f, gainRStep = 0.0f;
        float amplitude = 0.0f;
        int samplesLeft = 0;
    };

    void spawnGrain();
    float scheduleInterval();
    float readBuffer(double position) const;
    float window(float phase) const;

    std::vector<float> buffer;
    std::vector<float> windowTable;
    int bufferMask = 0;
    int bufferLength = 0;
    int writePos = 0;
    int silentWrites = 0;

    Grain grains[kMaxGrains];

    float sampleRate = 48000.0f;
    float samplesToNextGrain = 0.0f;

    // Parameters (raw targets).
    float mix = 0.35f;
    float sizeMs = 180.0f;
    float density = 12.0f;
    float positionMs = 350.0f;
    float scatter = 0.4f;
    float pitch = 0.0f;
    float pitchJitter = 12.0f;
    float asyncAmount = 0.7f;
    float spread = 0.8f;
    float reverseProbability = 0.25f;
    float shimmerProbability = 0.15f;
    float swirl = 0.5f;
    float toneHz = 6000.0f;
    float toneApplied = -1.0f;
    bool freeze = false;
    bool enabled = true;
    bool idle = false;

    Smoother inputGain, dryGain, wetGain, feedback, positionSmooth;
    SineLfo panLfo;
    DriftLfo panDrift;
    float panLfoValue = 0.0f, panDriftValue = 0.0f;
    Random rng { 0xC10D5u };

    OnePole toneL, toneR, lowCutL, lowCutR;
    float feedbackSample = 0.0f;
};

} // namespace yardsale
