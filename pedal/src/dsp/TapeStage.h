// Tape emulation: record-side saturation, transport wow & flutter, dropouts,
// hiss, and playback-side bandwidth limiting.
//
//   in -> drive -> pre-emphasis -> asymmetric tanh (ADAA) -> de-emphasis
//      -> transport (modulated delay) -> + hiss -> dropouts
//      -> head bump -> gap-loss low-pass -> low cut -> out

#pragma once

#include "DelayLine.h"
#include "DspUtils.h"

namespace yardsale {

// First-order antiderivative anti-aliasing (Parker/Zavalishin/Le Bivic 2016)
// for y = tanh(x). Instead of sampling tanh, output the average of tanh over
// the segment between consecutive input samples:
//     y[n] = (F(x[n]) - F(x[n-1])) / (x[n] - x[n-1]),  F(x) = log(cosh(x))
// That suppresses the aliased harmonics that give cheap saturation its fizz,
// at ~1/4 the cost of 2x oversampling - which matters on a Raspberry Pi.
// Runs in double: the difference quotient cancels catastrophically in float.
class AdaaTanh
{
public:
    void reset()
    {
        xPrev = 0.0;
        fPrev = 0.0;
    }

    float process(float in)
    {
        const double x = in;
        const double f = logCosh(x);
        const double dx = x - xPrev;
        const double y = std::fabs(dx) < 1.0e-5 ? std::tanh(0.5 * (x + xPrev)) : (f - fPrev) / dx;
        xPrev = x;
        fPrev = f;
        return static_cast<float>(y);
    }

private:
    // Overflow-safe log(cosh(x)) = |x| + log1p(exp(-2|x|)) - log(2).
    static double logCosh(double x)
    {
        const double a = std::fabs(x);
        return a + std::log1p(std::exp(-2.0 * a)) - 0.69314718055994530942;
    }

    double xPrev = 0.0;
    double fPrev = 0.0;
};

class TapeStage
{
public:
    // Not real-time safe (allocates). Call before audio starts.
    void prepare(double sampleRate, int maxBlockSize);
    void reset();

    // All setters are cheap, allocation-free and meant to be called on the
    // audio thread at the start of a block.
    void setDrive(float db);          // 0 .. +18 dB into the saturator
    void setWow(float amount);        // 0..1  -> 0 .. 1.2 % slow pitch drift
    void setFlutter(float amount);    // 0..1  -> 0 .. 0.3 % fast pitch jitter
    void setAge(float amount);        // 0..1  fresh reel -> worn cassette
    void setHiss(float amount);       // 0..1  off, then -78 .. -46 dBFS
    void setDropouts(float amount);   // 0..1  rate/depth of level dips
    void setOutputGain(float db);
    void setEnabled(bool shouldBeEnabled);

    void process(float* left, float* right, int numSamples);

    // Current transport delay. Varies with the wow setting.
    int getLatencySamples() const { return static_cast<int>(baseDelay.getCurrent()); }

private:
    void updatePlaybackEq();

    struct Channel
    {
        OnePole preEmphasis, deEmphasis;
        AdaaTanh saturator;
        DelayLine transport;
        HissGenerator hiss;
        OnePole dropoutLowpass;
        Svf headBump, gapLoss, lowCut;
        OnePole gapLossPole;
    };

    Channel channels[2];

    float sampleRate = 48000.0f;
    float maxTransportDelay = 0.0f;

    Smoother drive, wowDepth, flutterDepth, hissLevel, outputGain, baseDelay, bypassMix;
    float ageTarget = 0.35f;
    float ageApplied = -1.0f;
    float dropoutAmount = 0.0f;
    bool enabled = true;
    bool fullyBypassed = false;

    // Transport modulation sources.
    SineLfo wowLfo, flutterLfo;
    DriftLfo wowDrift, wowRateDrift, flutterNoise, biasDrift;

    // Dropout event state.
    Random dropoutRng { 0xD809u };
    int dropoutHold = 0;
    float dropoutTarget = 1.0f;
    float dropoutGain = 1.0f;
    float dropoutAttack = 0.0f, dropoutRelease = 0.0f;
};

} // namespace yardsale
