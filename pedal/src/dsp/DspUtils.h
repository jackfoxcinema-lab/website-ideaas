// Shared real-time DSP primitives for the pedal.
//
// Everything in here is header-only, allocation-free and safe to call from
// the audio thread. The only functions that may allocate are the ones named
// prepare(), and those must be called from the control/setup thread.

#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>

#if defined(__SSE__) || defined(_M_X64) || (defined(_M_IX86_FP) && _M_IX86_FP >= 1)
#include <xmmintrin.h>
#define YARDSALE_X86_FTZ 1
#endif

namespace yardsale {

constexpr float kPi = 3.14159265358979323846f;
constexpr float kTwoPi = 2.0f * kPi;

inline float dbToGain(float db) { return std::pow(10.0f, db * 0.05f); }

inline float clampf(float x, float lo, float hi) { return std::min(std::max(x, lo), hi); }

inline float lerp(float a, float b, float t) { return a + (b - a) * t; }

// Exponential mapping of a 0..1 control onto [lo, hi] - the natural taper for
// frequencies and times.
inline float expMap(float t, float lo, float hi) { return lo * std::pow(hi / lo, clampf(t, 0.0f, 1.0f)); }

// Rational (Pade 3/2) tanh. Exact at 0 with unity slope, reaches +-1 at +-3
// and is clamped beyond, so it never has gain > 1 anywhere. Cheap enough to
// sit inside feedback loops.
inline float fastTanh(float x)
{
    x = clampf(x, -3.0f, 3.0f);
    const float x2 = x * x;
    return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}

// sin(2*pi*phase) for phase in [0, 1). Two-stage parabolic approximation,
// max error ~0.001: plenty for LFOs, far cheaper than std::sin.
inline float fastSin2Pi(float phase)
{
    const float t = phase * 2.0f - 1.0f;            // [-1, 1)
    float y = 4.0f * t * (1.0f - std::fabs(t));     // ~sin(pi * t)
    y = 0.225f * (y * std::fabs(y) - y) + y;
    return -y;                                       // sin(2*pi*p) = -sin(pi*t)
}

// 4-point, 3rd-order Hermite interpolation (Laurent de Soras' "x-form").
// Interpolates between x0 and x1; xm1 and x2 are the outer neighbours.
inline float hermite4(float frac, float xm1, float x0, float x1, float x2)
{
    const float c = (x1 - xm1) * 0.5f;
    const float v = x0 - x1;
    const float w = c + v;
    const float a = w + v + (x2 - x0) * 0.5f;
    const float bNeg = w + a;
    return (((a * frac) - bNeg) * frac + c) * frac + x0;
}

//==============================================================================
// Flush denormals to zero for the lifetime of the object. Decaying IIR states
// and reverb tails otherwise fall into the denormal range and can cost 100x
// on x86. On AArch64 Linux (Raspberry Pi 4/5) FZ is off by default, so we set
// it explicitly in FPCR.
class ScopedFlushDenormals
{
public:
    ScopedFlushDenormals()
    {
#if defined(YARDSALE_X86_FTZ)
        previous = _mm_getcsr();
        _mm_setcsr(static_cast<unsigned int>(previous) | 0x8040u); // FTZ | DAZ
#elif defined(__aarch64__)
        uint64_t fpcr;
        asm volatile("mrs %0, fpcr" : "=r"(fpcr) : : "memory");
        previous = fpcr;
        asm volatile("msr fpcr, %0" : : "r"(fpcr | (uint64_t{1} << 24)) : "memory");
#elif defined(__arm__) && defined(__ARM_FP)
        uint32_t fpscr;
        asm volatile("vmrs %0, fpscr" : "=r"(fpscr) : : "memory");
        previous = fpscr;
        asm volatile("vmsr fpscr, %0" : : "r"(fpscr | (1u << 24)) : "memory");
#endif
        compilerBarrier();
    }

    ~ScopedFlushDenormals()
    {
        compilerBarrier();
#if defined(YARDSALE_X86_FTZ)
        _mm_setcsr(static_cast<unsigned int>(previous));
#elif defined(__aarch64__)
        asm volatile("msr fpcr, %0" : : "r"(previous) : "memory");
#elif defined(__arm__) && defined(__ARM_FP)
        asm volatile("vmsr fpscr, %0" : : "r"(static_cast<uint32_t>(previous)) : "memory");
#endif
    }

    ScopedFlushDenormals(const ScopedFlushDenormals&) = delete;
    ScopedFlushDenormals& operator=(const ScopedFlushDenormals&) = delete;

private:
    // Compilers don't model the FP control register as a dependency, so
    // without a barrier they may schedule audio maths outside the scope.
    static void compilerBarrier()
    {
#if defined(__GNUC__) || defined(__clang__)
        asm volatile("" : : : "memory");
#endif
    }

    uint64_t previous = 0;
};

//==============================================================================
// xorshift32. Deterministic per seed so every pedal unit sounds the same from
// power-on, but each module/channel gets its own stream.
class Random
{
public:
    explicit Random(uint32_t s = 0x9E3779B9u) { seed(s); }
    void seed(uint32_t s) { state = s != 0 ? s : 0x9E3779B9u; }

    uint32_t nextUInt()
    {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        return state;
    }

    float nextFloat() { return static_cast<float>(nextUInt() >> 8) * (1.0f / 16777216.0f); } // [0, 1)
    float nextBipolar() { return nextFloat() * 2.0f - 1.0f; }                                 // [-1, 1)

private:
    uint32_t state = 0x9E3779B9u;
};

//==============================================================================
// One-pole exponential parameter smoother. Removes zipper noise from knob
// moves and, when the time constant is long, gives delay-time changes a
// tape-like pitch glide instead of a click.
class Smoother
{
public:
    void prepare(float sampleRate, float timeMs)
    {
        coeff = 1.0f - std::exp(-1.0f / (std::max(timeMs, 0.01f) * 0.001f * sampleRate));
    }

    void setTarget(float t) { target = t; }
    void snap(float v) { current = target = v; }

    float next()
    {
        current += coeff * (target - current);
        if (std::fabs(target - current) < 1.0e-7f)
            current = target;
        return current;
    }

    float getCurrent() const { return current; }
    float getTarget() const { return target; }
    bool isSettled() const { return std::fabs(target - current) < 1.0e-7f; }

private:
    float coeff = 1.0f;
    float current = 0.0f;
    float target = 0.0f;
};

//==============================================================================
// Topology-preserving-transform one-pole (Zavalishin). Stable under fast
// cutoff modulation, exact bilinear response with prewarping.
class OnePole
{
public:
    static float gFor(float hz, float sampleRate)
    {
        return std::tan(kPi * clampf(hz, 1.0f, 0.49f * sampleRate) / sampleRate);
    }

    void setCutoff(float hz, float sampleRate) { setG(gFor(hz, sampleRate)); }
    void setG(float g) { G = g / (1.0f + g); }
    void reset(float value = 0.0f) { s = value; }

    float processLP(float x)
    {
        const float v = (x - s) * G;
        const float lp = v + s;
        s = lp + v;
        return lp;
    }

    float processHP(float x) { return x - processLP(x); }

private:
    float G = 0.0f;
    float s = 0.0f;
};

//==============================================================================
// Cytomic/Simper trapezoidal state-variable filter. Used for the tape
// playback EQ (head bump bell, gap-loss low-pass, low cut).
class Svf
{
public:
    void setLowpass(float hz, float q, float sampleRate)
    {
        computeCore(hz, 1.0f / q, sampleRate);
        m0 = 0.0f; m1 = 0.0f; m2 = 1.0f;
    }

    void setHighpass(float hz, float q, float sampleRate)
    {
        computeCore(hz, 1.0f / q, sampleRate);
        m0 = 1.0f; m1 = -k; m2 = -1.0f;
    }

    void setBell(float hz, float q, float gainDb, float sampleRate)
    {
        const float A = std::pow(10.0f, gainDb / 40.0f);
        computeCore(hz, 1.0f / (q * A), sampleRate);
        m0 = 1.0f; m1 = k * (A * A - 1.0f); m2 = 0.0f;
    }

    void reset() { ic1eq = ic2eq = 0.0f; }

    float process(float v0)
    {
        const float v3 = v0 - ic2eq;
        const float v1 = a1 * ic1eq + a2 * v3;
        const float v2 = ic2eq + a2 * ic1eq + a3 * v3;
        ic1eq = 2.0f * v1 - ic1eq;
        ic2eq = 2.0f * v2 - ic2eq;
        return m0 * v0 + m1 * v1 + m2 * v2;
    }

private:
    void computeCore(float hz, float kIn, float sampleRate)
    {
        const float g = OnePole::gFor(hz, sampleRate);
        k = kIn;
        a1 = 1.0f / (1.0f + g * (g + k));
        a2 = g * a1;
        a3 = g * a2;
    }

    float k = 1.0f, a1 = 0.0f, a2 = 0.0f, a3 = 0.0f;
    float m0 = 0.0f, m1 = 0.0f, m2 = 1.0f;
    float ic1eq = 0.0f, ic2eq = 0.0f;
};

//==============================================================================
class SineLfo
{
public:
    void prepare(float sr) { sampleRate = sr; }
    void setRate(float hz) { increment = hz / sampleRate; }
    void setPhase(float p) { phase = p - std::floor(p); }

    float next()
    {
        const float out = fastSin2Pi(phase);
        phase += increment;
        if (phase >= 1.0f)
            phase -= 1.0f;
        return out;
    }

private:
    float sampleRate = 48000.0f;
    float phase = 0.0f;
    float increment = 0.0f;
};

// Smooth random wander in [-1, 1]: a Catmull-Rom spline through random points
// spaced 1/rate seconds apart. Continuous in value *and* slope, so when it
// modulates a delay time the resulting pitch drift has no corners - the
// motion reads as "old motor", not "digital random".
class DriftLfo
{
public:
    void prepare(float sr, uint32_t seed)
    {
        sampleRate = sr;
        rng.seed(seed);
        p0 = rng.nextBipolar(); p1 = rng.nextBipolar();
        p2 = rng.nextBipolar(); p3 = rng.nextBipolar();
        phase = 0.0f;
    }

    void setRate(float hz) { increment = hz / sampleRate; }

    float next()
    {
        phase += increment;
        if (phase >= 1.0f)
        {
            phase -= 1.0f;
            p0 = p1; p1 = p2; p2 = p3;
            p3 = rng.nextBipolar();
        }
        // Catmull-Rom can overshoot slightly; clamp keeps the contract.
        return clampf(hermite4(phase, p0, p1, p2, p3), -1.0f, 1.0f);
    }

private:
    Random rng;
    float sampleRate = 48000.0f;
    float phase = 0.0f, increment = 0.0f;
    float p0 = 0.0f, p1 = 0.0f, p2 = 0.0f, p3 = 0.0f;
};

//==============================================================================
// Paul Kellet's economy pink-noise filter, blended with some white so the
// result has the "hhhh" of tape hiss rather than a pure pink rumble.
// Normalised to unit RMS (measured over 10^7 samples).
class HissGenerator
{
public:
    void seed(uint32_t s) { rng.seed(s); b0 = b1 = b2 = 0.0f; }

    float next()
    {
        const float white = rng.nextBipolar();
        b0 = 0.99765f * b0 + white * 0.0990460f;
        b1 = 0.96300f * b1 + white * 0.2965164f;
        b2 = 0.57000f * b2 + white * 1.0526913f;
        const float pink = b0 + b1 + b2 + white * 0.1848f;
        return (0.25f * pink + 0.6f * white) * kNormalise;
    }

    static constexpr float kNormalise = 1.461f;

private:
    Random rng;
    float b0 = 0.0f, b1 = 0.0f, b2 = 0.0f;
};

} // namespace yardsale
