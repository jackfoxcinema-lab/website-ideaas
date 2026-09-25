// Power-of-two circular delay line with integer and Hermite-interpolated taps.

#pragma once

#include "DspUtils.h"

#include <vector>

namespace yardsale {

class DelayLine
{
public:
    // Not real-time safe: allocates. Call from prepare() only.
    void prepare(int maxDelaySamples)
    {
        int size = 1;
        while (size < maxDelaySamples + 4)
            size <<= 1;
        buffer.assign(static_cast<size_t>(size), 0.0f);
        mask = size - 1;
        writeIndex = 0;
    }

    void reset()
    {
        std::fill(buffer.begin(), buffer.end(), 0.0f);
        writeIndex = 0;
    }

    int capacity() const { return mask + 1; }

    void push(float x)
    {
        buffer[static_cast<size_t>(writeIndex)] = x;
        writeIndex = (writeIndex + 1) & mask;
    }

    // Delay 0 is the most recently pushed sample.
    float read(int delay) const
    {
        return buffer[static_cast<size_t>((writeIndex - 1 - delay) & mask)];
    }

    // Fractional read, delay >= 1.0 (Hermite needs one newer neighbour).
    // Hermite rather than linear because these taps are modulated: linear
    // interpolation's low-pass depends on the fractional position, so a
    // modulated linear tap adds a periodic "swish" of HF loss - and inside a
    // feedback loop that loss compounds on every pass.
    float readHermite(float delay) const
    {
        const int whole = static_cast<int>(delay);
        const float frac = delay - static_cast<float>(whole);
        const int i = writeIndex - 1 - whole;
        const float xm1 = buffer[static_cast<size_t>((i + 1) & mask)];
        const float x0 = buffer[static_cast<size_t>(i & mask)];
        const float x1 = buffer[static_cast<size_t>((i - 1) & mask)];
        const float x2 = buffer[static_cast<size_t>((i - 2) & mask)];
        return hermite4(frac, xm1, x0, x1, x2);
    }

private:
    std::vector<float> buffer;
    int mask = 0;
    int writeIndex = 0;
};

// Schroeder allpass: w[n] = x[n] + g*w[n-M], y[n] = -g*w[n] + w[n-M].
// Flat magnitude, so it adds echo density inside the reverb tank without
// changing the decay time.
class SchroederAllpass
{
public:
    void prepare(int delaySamples)
    {
        length = std::max(delaySamples, 1);
        line.prepare(length);
    }

    void reset() { line.reset(); }
    int getLength() const { return length; }

    float process(float x, float g)
    {
        const float delayed = line.read(length - 1);
        const float w = x + g * delayed;
        line.push(w);
        return delayed - g * w;
    }

private:
    DelayLine line;
    int length = 1;
};

} // namespace yardsale
