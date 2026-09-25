// Offline harness: verifies the real-time and DSP claims, benchmarks the
// chain, and renders demo WAVs from a synthetic plucked-guitar part.
//
//   ./yardsale_tests [output-dir]      (default: renders)

#include "dsp/PedalChain.h"

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <functional>
#include <new>
#include <string>
#include <vector>

using namespace yardsale;

//==============================================================================
// Allocation tracking: every global new is counted while tracking is on.

static std::atomic<bool> gTrack { false };
static std::atomic<long> gAllocations { 0 };

void* operator new(std::size_t size)
{
    if (gTrack.load(std::memory_order_relaxed))
        gAllocations.fetch_add(1, std::memory_order_relaxed);
    if (void* p = std::malloc(size != 0 ? size : 1))
        return p;
    throw std::bad_alloc();
}
void* operator new[](std::size_t size) { return operator new(size); }
void operator delete(void* p) noexcept { std::free(p); }
void operator delete[](void* p) noexcept { std::free(p); }
void operator delete(void* p, std::size_t) noexcept { std::free(p); }
void operator delete[](void* p, std::size_t) noexcept { std::free(p); }

struct AllocationProbe
{
    AllocationProbe() { gAllocations = 0; gTrack = true; }
    ~AllocationProbe() { gTrack = false; }
    long count() const { return gAllocations.load(); }
};

//==============================================================================
static int gFailures = 0;

static void check(bool ok, const char* what, const std::string& detail = {})
{
    std::printf("  [%s] %s%s%s\n", ok ? "PASS" : "FAIL", what, detail.empty() ? "" : " - ", detail.c_str());
    if (!ok)
        ++gFailures;
}

static std::string fmt(const char* f, double a, double b = 0.0, double c = 0.0)
{
    char buf[256];
    std::snprintf(buf, sizeof buf, f, a, b, c);
    return buf;
}

//==============================================================================
// Test material

struct Stereo
{
    std::vector<float> l, r;
    explicit Stereo(size_t n = 0) : l(n, 0.0f), r(n, 0.0f) {}
    size_t size() const { return l.size(); }
};

// Karplus-Strong plucks: an Emaj9 arpeggio, a strum, a few melody notes,
// then silence so the tails are audible.
static std::vector<float> makeGuitar(float sr, float seconds)
{
    const size_t total = static_cast<size_t>(seconds * sr);
    std::vector<float> out(total, 0.0f);
    Random rng(42);

    struct Note { float time, freq, amp; };
    std::vector<Note> notes;
    const float arp[] = { 82.41f, 123.47f, 207.65f, 311.13f, 369.99f, 493.88f };
    for (int i = 0; i < 6; ++i)
        notes.push_back({ 0.4f * static_cast<float>(i), arp[i], 0.22f });
    for (int i = 0; i < 6; ++i)
        notes.push_back({ 3.0f + 0.018f * static_cast<float>(i), arp[i], 0.16f });
    const float melody[] = { 659.26f, 622.25f, 493.88f, 554.37f, 415.30f };
    for (int i = 0; i < 5; ++i)
        notes.push_back({ 5.0f + 0.6f * static_cast<float>(i), melody[i], 0.2f });

    for (const Note& note : notes)
    {
        const int period = std::max(2, static_cast<int>(sr / note.freq));
        std::vector<float> line(static_cast<size_t>(period));
        float smooth = 0.0f;
        for (float& s : line) // softened noise burst = a thumb, not a pick
        {
            smooth += 0.5f * (rng.nextBipolar() - smooth);
            s = smooth;
        }
        const size_t start = static_cast<size_t>(note.time * sr);
        size_t idx = 0;
        for (size_t n = start; n < total && n < start + static_cast<size_t>(4.0f * sr); ++n)
        {
            const size_t next = (idx + 1) % line.size();
            const float y = line[idx];
            line[idx] = 0.4985f * (line[idx] + line[next]);
            idx = next;
            out[n] += note.amp * y;
        }
    }
    return out;
}

static bool allFinite(const Stereo& s)
{
    for (size_t i = 0; i < s.size(); ++i)
        if (!std::isfinite(s.l[i]) || !std::isfinite(s.r[i]))
            return false;
    return true;
}

static float peakOf(const Stereo& s, size_t from = 0, size_t to = SIZE_MAX)
{
    float p = 0.0f;
    for (size_t i = from; i < std::min(to, s.size()); ++i)
        p = std::max(p, std::max(std::fabs(s.l[i]), std::fabs(s.r[i])));
    return p;
}

static double rmsOf(const std::vector<float>& x, size_t from, size_t to)
{
    double acc = 0.0;
    for (size_t i = from; i < to; ++i)
        acc += static_cast<double>(x[i]) * x[i];
    return std::sqrt(acc / static_cast<double>(to - from));
}

// Hann-windowed Goertzel magnitude at one frequency.
static double toneLevel(const std::vector<float>& x, size_t from, size_t n, double freq, double sr)
{
    const double w = 2.0 * 3.14159265358979 * freq / sr;
    const double coeff = 2.0 * std::cos(w);
    double s1 = 0.0, s2 = 0.0;
    for (size_t i = 0; i < n; ++i)
    {
        const double win = 0.5 - 0.5 * std::cos(2.0 * 3.14159265358979 * static_cast<double>(i) / static_cast<double>(n));
        const double s0 = x[from + i] * win + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
    }
    return std::sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / (0.25 * static_cast<double>(n));
}

static double db(double x) { return 20.0 * std::log10(std::max(x, 1e-12)); }

// Runs `process` over a stereo buffer in irregular block sizes, the way a
// real host does, with allocation tracking on.
static long runBlocks(Stereo& io, int maxBlock, const std::function<void(float*, float*, int)>& process,
                      const std::function<void(size_t)>& beforeBlock = {})
{
    Random blockRng(7);
    AllocationProbe probe;
    size_t pos = 0;
    while (pos < io.size())
    {
        const int want = 1 + static_cast<int>(blockRng.nextFloat() * static_cast<float>(maxBlock));
        const int n = static_cast<int>(std::min<size_t>(static_cast<size_t>(want), io.size() - pos));
        if (beforeBlock)
            beforeBlock(pos);
        process(io.l.data() + pos, io.r.data() + pos, n);
        pos += static_cast<size_t>(n);
    }
    return probe.count();
}

//==============================================================================
// WAV writer: 16-bit PCM with TPDF dither.

static void writeWav(const std::string& path, const Stereo& s, int sr)
{
    std::ofstream f(path, std::ios::binary);
    if (!f)
    {
        std::printf("  (could not write %s)\n", path.c_str());
        return;
    }
    auto u32 = [&](uint32_t v) { f.write(reinterpret_cast<const char*>(&v), 4); };
    auto u16 = [&](uint16_t v) { f.write(reinterpret_cast<const char*>(&v), 2); };
    const uint32_t dataBytes = static_cast<uint32_t>(s.size() * 4);
    f.write("RIFF", 4); u32(36 + dataBytes); f.write("WAVE", 4);
    f.write("fmt ", 4); u32(16); u16(1); u16(2); u32(static_cast<uint32_t>(sr));
    u32(static_cast<uint32_t>(sr) * 4); u16(4); u16(16);
    f.write("data", 4); u32(dataBytes);
    Random dither(99);
    for (size_t i = 0; i < s.size(); ++i)
        for (float v : { s.l[i], s.r[i] })
        {
            const float d = (dither.nextFloat() - dither.nextFloat()) / 32768.0f;
            const float c = clampf(v + d, -1.0f, 1.0f);
            u16(static_cast<uint16_t>(static_cast<int16_t>(std::lrint(c * 32767.0f))));
        }
}

//==============================================================================
// Tests

static void testTape(float sr)
{
    std::printf("\nTape stage @ %.0f Hz\n", sr);

    TapeStage tape;
    tape.prepare(sr, 512);
    tape.setDrive(12.0f);
    tape.setWow(0.0f);
    tape.setFlutter(0.0f);
    tape.setAge(0.0f);
    tape.setHiss(0.0f);
    tape.setDropouts(0.0f);
    tape.reset();

    // Small-signal gain: drive compensation should keep quiet playing at unity.
    const size_t n = static_cast<size_t>(sr * 2.0f);
    Stereo quiet(n);
    for (size_t i = 0; i < n; ++i)
        quiet.l[i] = quiet.r[i] = 0.01f * std::sin(kTwoPi * 1000.0f * static_cast<float>(i) / sr);
    const std::vector<float> reference = quiet.l;
    runBlocks(quiet, 256, [&](float* l, float* r, int k) { tape.process(l, r, k); });
    const double gainDb = db(rmsOf(quiet.l, n / 2, n) / rmsOf(reference, n / 2, n));
    check(std::fabs(gainDb) < 0.5, "unity small-signal gain at +12 dB drive", fmt("%+.2f dB", gainDb));

    // Hot signal: asymmetric saturation must produce a real 2nd harmonic.
    tape.reset();
    Stereo hot(n);
    for (size_t i = 0; i < n; ++i)
        hot.l[i] = hot.r[i] = 0.5f * std::sin(kTwoPi * 441.0f * static_cast<float>(i) / sr);
    runBlocks(hot, 256, [&](float* l, float* r, int k) { tape.process(l, r, k); });
    const size_t win = static_cast<size_t>(sr);
    const double h1 = toneLevel(hot.l, n / 2, win, 441.0, sr);
    const double h2 = toneLevel(hot.l, n / 2, win, 882.0, sr);
    const double h3 = toneLevel(hot.l, n / 2, win, 1323.0, sr);
    check(db(h2 / h1) > -60.0 && db(h2 / h1) < -15.0, "even harmonic from bias asymmetry",
          fmt("H2 %.1f dBc, H3 %.1f dBc", db(h2 / h1), db(h3 / h1)));

    // Wow: instantaneous frequency of a 1 kHz tone via zero crossings.
    TapeStage wow;
    wow.prepare(sr, 512);
    wow.setWow(1.0f);
    wow.setFlutter(0.0f);
    wow.setHiss(0.0f);
    wow.setDropouts(0.0f);
    wow.setAge(0.0f);
    wow.reset();
    const size_t wn = static_cast<size_t>(sr * 12.0f);
    Stereo tone(wn);
    for (size_t i = 0; i < wn; ++i)
        tone.l[i] = tone.r[i] = 0.05f * std::sin(kTwoPi * 1000.0f * static_cast<float>(i) / sr);
    runBlocks(tone, 256, [&](float* l, float* r, int k) { wow.process(l, r, k); });
    std::vector<double> crossings;
    for (size_t i = static_cast<size_t>(sr) + 1; i < wn; ++i)
        if (tone.l[i - 1] < 0.0f && tone.l[i] >= 0.0f)
            crossings.push_back(static_cast<double>(i - 1) + tone.l[i - 1] / (tone.l[i - 1] - tone.l[i]));
    double maxDev = 0.0;
    for (size_t i = 8; i < crossings.size(); ++i) // average over 8 cycles
    {
        const double f = 8.0 * sr / (crossings[i] - crossings[i - 8]);
        maxDev = std::max(maxDev, std::fabs(f / 1000.0 - 1.0));
    }
    check(maxDev > 0.009 && maxDev < 0.02, "full wow gives ~1.2 % peak pitch deviation", fmt("%.2f %%", maxDev * 100.0));
}

// Schroeder backward integration of the 300 Hz - 3 kHz band. Band-limited
// because the in-loop low-pass (correctly) shortens the air band's decay,
// which would otherwise dominate a broadband estimate.
static double measureRt60(const Stereo& ir, float sr)
{
    Svf hp1, hp2, lp1, lp2;
    hp1.setHighpass(300.0f, 0.707f, sr);
    hp2.setHighpass(300.0f, 0.707f, sr);
    lp1.setLowpass(3000.0f, 0.707f, sr);
    lp2.setLowpass(3000.0f, 0.707f, sr);
    std::vector<double> band(ir.size());
    for (size_t i = 0; i < ir.size(); ++i)
        band[i] = lp2.process(lp1.process(hp2.process(hp1.process(ir.l[i] + ir.r[i]))));

    std::vector<double> edc(ir.size());
    double acc = 0.0;
    for (size_t i = ir.size(); i-- > 0;)
    {
        acc += band[i] * band[i];
        edc[i] = acc;
    }
    double t5 = -1.0, t35 = -1.0;
    for (size_t i = 0; i < edc.size(); ++i)
    {
        const double level = 10.0 * std::log10(edc[i] / edc[0]);
        if (t5 < 0.0 && level <= -5.0)
            t5 = static_cast<double>(i) / sr;
        if (t35 < 0.0 && level <= -35.0)
        {
            t35 = static_cast<double>(i) / sr;
            break;
        }
    }
    return (t5 < 0.0 || t35 < 0.0) ? -1.0 : 2.0 * (t35 - t5); // T30 extrapolated to 60 dB
}

static void testReverb(float sr)
{
    std::printf("\nReverb @ %.0f Hz\n", sr);

    for (float target : { 1.5f, 4.0f })
    {
        for (float depth : { 0.0f, 0.6f })
        {
            LushReverb verb;
            verb.prepare(sr, 512);
            verb.setMix(1.0f);
            verb.setPreDelay(0.0f);
            verb.setSize(0.8f);
            verb.setDecay(target);
            verb.setDiffusion(0.75f);
            verb.setModDepth(depth);
            verb.setModRate(0.5f);
            verb.setLowCut(20.0f);
            verb.setHighCut(20000.0f);
            verb.reset();

            Stereo ir(static_cast<size_t>(sr * target * 2.5f));
            ir.l[0] = ir.r[0] = 1.0f;
            runBlocks(ir, 256, [&](float* l, float* r, int k) { verb.process(l, r, k); });
            const double rt = measureRt60(ir, sr);
            check(rt > target * 0.93 && rt < target * 1.07, "RT60 tracks the decay setting (within 7 %)",
                  fmt("set %.1f s, mod %.1f, measured %.2f s", target, depth, rt));
        }
    }

    // In-loop damping: with a 3 kHz high-cut the treble must die much sooner.
    LushReverb dark;
    dark.prepare(sr, 512);
    dark.setMix(1.0f);
    dark.setPreDelay(0.0f);
    dark.setDecay(4.0f);
    dark.setModDepth(0.0f);
    dark.setHighCut(3000.0f);
    dark.setLowCut(20.0f);
    dark.reset();
    const size_t n = static_cast<size_t>(sr * 3.0f);
    Stereo noise(n);
    Random rng(5);
    for (size_t i = 0; i < static_cast<size_t>(sr * 0.5f); ++i)
        noise.l[i] = noise.r[i] = 0.2f * rng.nextBipolar();
    runBlocks(noise, 256, [&](float* l, float* r, int k) { dark.process(l, r, k); });
    const size_t at = static_cast<size_t>(sr * 2.0f), win = static_cast<size_t>(sr * 0.5f);
    double lo = 0.0, hi = 0.0;
    for (double f : { 200.0, 300.0, 400.0 }) lo += toneLevel(noise.l, at, win, f, sr);
    for (double f : { 6000.0, 7000.0, 8000.0 }) hi += toneLevel(noise.l, at, win, f, sr);
    check(db(hi / lo) < -25.0, "high-cut in the loop darkens the tail over time", fmt("HF vs LF %.1f dB after 1.5 s", db(hi / lo)));

    // Stability at the extremes: 60 s decay, loud noise, full modulation.
    LushReverb huge;
    huge.prepare(sr, 512);
    huge.setMix(1.0f);
    huge.setSize(1.0f);
    huge.setDecay(60.0f);
    huge.setModDepth(1.0f);
    huge.setModRate(4.0f);
    huge.setDiffusion(1.0f);
    huge.setLowCut(20.0f);
    huge.setHighCut(20000.0f);
    huge.reset();
    Stereo loud(static_cast<size_t>(sr * 30.0f));
    for (size_t i = 0; i < loud.size(); ++i)
        loud.l[i] = loud.r[i] = rng.nextBipolar();
    runBlocks(loud, 256, [&](float* l, float* r, int k) { huge.process(l, r, k); });
    const float lastPeak = peakOf(loud, loud.size() - static_cast<size_t>(sr * 5.0f));
    check(allFinite(loud) && lastPeak < 8.0f, "bounded under 0 dBFS noise with 60 s decay", fmt("peak %.2f", lastPeak));
}

static void testGranular(float sr)
{
    std::printf("\nGranular @ %.0f Hz\n", sr);

    for (float semis : { -12.0f, 7.0f, 12.0f })
    {
        GranularSwirl g;
        g.prepare(sr, 512);
        g.setMix(1.0f);
        g.setPitch(semis);
        g.setPitchJitter(0.0f);
        g.setShimmerProbability(0.0f);
        g.setReverseProbability(0.0f);
        g.setSwirl(0.0f);
        g.setSpread(0.0f);
        g.setFeedback(0.0f);
        g.setScatter(0.0f);
        g.setDensity(20.0f);
        g.setGrainSize(120.0f);
        g.setPosition(300.0f);
        g.setTone(16000.0f);
        g.reset();

        const size_t n = static_cast<size_t>(sr * 4.0f);
        Stereo tone(n);
        for (size_t i = 0; i < n; ++i)
            tone.l[i] = tone.r[i] = 0.3f * std::sin(kTwoPi * 220.0f * static_cast<float>(i) / sr);
        runBlocks(tone, 256, [&](float* l, float* r, int k) { g.process(l, r, k); });
        const double expected = 220.0 * std::pow(2.0, semis / 12.0);
        const size_t win = static_cast<size_t>(sr * 2.0f);
        const double shifted = toneLevel(tone.l, n - win, win, expected, sr);
        const double original = toneLevel(tone.l, n - win, win, 220.0, sr);
        check(db(shifted / original) > 20.0, "grain transposition lands on the right pitch",
              fmt("%+.0f st: %.1f Hz is %.1f dB over 220 Hz", semis, expected, db(shifted / original)));
    }

    // Freeze: after the input stops, the held buffer keeps sounding.
    GranularSwirl g;
    g.prepare(sr, 512);
    g.setMix(1.0f);
    g.setPitch(12.0f);
    g.setReverseProbability(0.5f);
    g.reset();
    const size_t n = static_cast<size_t>(sr * 8.0f);
    Stereo io(n);
    Random rng(3);
    for (size_t i = 0; i < static_cast<size_t>(sr * 3.0f); ++i)
        io.l[i] = io.r[i] = 0.3f * rng.nextBipolar();
    runBlocks(io, 256, [&](float* l, float* r, int k) { g.process(l, r, k); },
              [&](size_t pos) { g.setFreeze(pos >= static_cast<size_t>(sr * 2.5f)); });
    const double heldRms = rmsOf(io.l, static_cast<size_t>(sr * 6.0f), n);
    check(heldRms > 0.01 && allFinite(io), "freeze holds a texture after the input stops",
          fmt("RMS 3-5 s after input: %.1f dBFS", db(heldRms)));
}

static void testBypassAndTrails(float sr)
{
    std::printf("\nBypass / trails @ %.0f Hz\n", sr);
    Random rng(11);

    // Reverb: disabling keeps the tail, then goes idle and passes audio untouched.
    LushReverb verb;
    verb.prepare(sr, 512);
    verb.setMix(0.5f);
    verb.setDecay(3.0f);
    verb.reset();
    Stereo a(static_cast<size_t>(sr * 1.0f));
    for (size_t i = 0; i < a.size(); ++i)
        a.l[i] = a.r[i] = 0.3f * rng.nextBipolar();
    runBlocks(a, 256, [&](float* l, float* r, int k) { verb.process(l, r, k); });
    verb.setEnabled(false);
    Stereo tail(static_cast<size_t>(sr * 0.3f));
    runBlocks(tail, 256, [&](float* l, float* r, int k) { verb.process(l, r, k); });
    check(rmsOf(tail.l, tail.size() / 2, tail.size()) > 1e-3, "reverb tail continues after bypass");
    Stereo drain(static_cast<size_t>(sr * 12.0f));
    runBlocks(drain, 256, [&](float* l, float* r, int k) { verb.process(l, r, k); });
    check(verb.isIdle(), "reverb goes idle once the tail has died");

    // Granular: same, the trail is the buffer draining.
    GranularSwirl grain;
    grain.prepare(sr, 512);
    grain.setMix(0.5f);
    grain.setFeedback(0.5f);
    grain.reset();
    Stereo b(static_cast<size_t>(sr * 2.0f));
    for (size_t i = 0; i < b.size(); ++i)
        b.l[i] = b.r[i] = 0.3f * rng.nextBipolar();
    runBlocks(b, 256, [&](float* l, float* r, int k) { grain.process(l, r, k); });
    grain.setEnabled(false);
    Stereo gdrain(static_cast<size_t>(sr * 15.0f));
    runBlocks(gdrain, 256, [&](float* l, float* r, int k) { grain.process(l, r, k); });
    check(grain.isIdle(), "granular goes idle once its buffer has drained");

    // Tape: true bypass, bit-exact once the crossfade finishes.
    TapeStage tape;
    tape.prepare(sr, 512);
    tape.reset();
    tape.setEnabled(false);
    Stereo fade(static_cast<size_t>(sr * 0.5f));
    runBlocks(fade, 256, [&](float* l, float* r, int k) { tape.process(l, r, k); });
    Stereo c(4096);
    for (size_t i = 0; i < c.size(); ++i)
        c.l[i] = c.r[i] = rng.nextBipolar();
    const std::vector<float> before = c.l;

    // Idle modules must be bit-exact passthrough too.
    runBlocks(c, 256, [&](float* l, float* r, int k) {
        tape.process(l, r, k);
        grain.process(l, r, k);
        verb.process(l, r, k);
    });
    check(std::memcmp(before.data(), c.l.data(), before.size() * sizeof(float)) == 0,
          "bypassed modules are bit-exact passthrough");
}

static void testChainRobustness(float sr)
{
    std::printf("\nFull chain @ %.0f Hz\n", sr);
    PedalChain chain;
    chain.prepare(sr, 256);

    // Random settings every block, including routing, freeze and bypass flips,
    // with block sizes up to 3x the prepared maximum.
    PedalSettings s;
    chain.setSettings(s);
    chain.reset();
    Random rng(1234);
    const std::vector<float> guitar = makeGuitar(sr, 30.0f);
    Stereo io(guitar.size());
    io.l = guitar;
    io.r = guitar;
    const long allocations = runBlocks(io, 768, [&](float* l, float* r, int k) { chain.processBlock(l, r, k); },
        [&](size_t) {
            auto u = [&] { return rng.nextFloat(); };
            if (u() < 0.1f)
            {
                s.routing = static_cast<Routing>(static_cast<int>(u() * 6.0f));
                s.tape.enabled = u() > 0.2f;
                s.grain.enabled = u() > 0.2f;
                s.verb.enabled = u() > 0.2f;
                s.grain.freeze = u() > 0.7f;
            }
            s.tape.driveDb = 18.0f * u();
            s.tape.wow = u();
            s.tape.flutter = u();
            s.tape.age = u();
            s.tape.hiss = u();
            s.tape.dropouts = u();
            s.grain.pitch = 24.0f * u() - 12.0f;
            s.grain.sizeMs = 20.0f + 480.0f * u();
            s.grain.density = 1.0f + 39.0f * u();
            s.grain.positionMs = 2000.0f * u();
            s.grain.feedback = 0.9f * u();
            s.grain.shimmer = u();
            s.grain.reverse = u();
            s.verb.size = u();
            s.verb.decaySeconds = 0.3f + 59.7f * u();
            s.verb.modDepth = u();
            s.verb.modRateHz = 0.05f + 3.95f * u();
            s.verb.highCutHz = 500.0f + 19500.0f * u();
            s.verb.lowCutHz = 20.0f + 980.0f * u();
            chain.setSettings(s);
        });
    check(allocations == 0, "no heap allocation on the audio path under random automation",
          fmt("%.0f allocations", static_cast<double>(allocations)));
    check(allFinite(io), "output always finite");
    check(peakOf(io) <= 1.0f, "safety limiter holds 0 dBFS", fmt("peak %.3f", peakOf(io)));
}

static void testDenormals()
{
    std::printf("\nFloating point environment\n");
    // Volatile stores pin each multiply to its side of the scope.
    volatile float tiny = 1.0e-38f;
    volatile float before = tiny * 1.0e-3f;
    volatile float inside = 1.0f;
    {
        ScopedFlushDenormals guard;
        inside = tiny * 1.0e-3f;
    }
    volatile float after = tiny * 1.0e-3f;
    check(before != 0.0f && inside == 0.0f && after != 0.0f, "denormals flushed inside the audio scope, restored after");
}

static void benchmark(float sr, int block)
{
    PedalChain chain;
    chain.prepare(sr, block);
    PedalSettings s;
    chain.setSettings(s);
    chain.reset();
    const std::vector<float> guitar = makeGuitar(sr, 60.0f);
    Stereo io(guitar.size());
    io.l = guitar;
    io.r = guitar;

    const auto start = std::chrono::steady_clock::now();
    for (size_t pos = 0; pos < io.size(); pos += static_cast<size_t>(block))
    {
        const int n = static_cast<int>(std::min<size_t>(static_cast<size_t>(block), io.size() - pos));
        chain.processBlock(io.l.data() + pos, io.r.data() + pos, n);
    }
    const double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count();
    std::printf("\nBenchmark: 60 s of audio @ %.0f Hz, block %d: %.3f s CPU = %.1fx real time (%.2f %% of one core)\n",
                sr, block, secs, 60.0 / secs, secs / 60.0 * 100.0);
}

//==============================================================================
// Demo renders

static void render(const std::string& path, float sr, const PedalSettings& settings, float seconds,
                   const std::function<void(PedalSettings&, float)>& automation = {})
{
    PedalChain chain;
    chain.prepare(sr, 128);
    chain.setSettings(settings);
    chain.reset();

    const std::vector<float> guitar = makeGuitar(sr, seconds);
    Stereo io(guitar.size());
    PedalSettings s = settings;
    for (size_t pos = 0; pos < io.size(); pos += 128)
    {
        const int n = static_cast<int>(std::min<size_t>(128, io.size() - pos));
        if (automation)
        {
            automation(s, static_cast<float>(pos) / sr);
            chain.setSettings(s);
        }
        chain.processMonoToStereo(guitar.data() + pos, io.l.data() + pos, io.r.data() + pos, n);
    }
    writeWav(path, io, static_cast<int>(sr));
    std::printf("  wrote %s (peak %.1f dBFS)\n", path.c_str(), db(peakOf(io)));
}

int main(int argc, char** argv)
{
    const std::string outDir = argc > 1 ? argv[1] : "renders";

    testDenormals();

    for (float sr : { 44100.0f, 48000.0f, 96000.0f })
    {
        testTape(sr);
        testReverb(sr);
        testGranular(sr);
        testBypassAndTrails(sr);
        testChainRobustness(sr);
    }

    benchmark(48000.0f, 64);
    benchmark(48000.0f, 256);

    std::printf("\nRenders\n");
    const float sr = 48000.0f;
    Stereo dry;
    {
        const std::vector<float> g = makeGuitar(sr, 16.0f);
        dry = Stereo(g.size());
        dry.l = g;
        dry.r = g;
        writeWav(outDir + "/01_dry_guitar.wav", dry, static_cast<int>(sr));
    }

    render(outDir + "/02_default_chain.wav", sr, PedalSettings {}, 16.0f);

    PedalSettings printed;
    printed.routing = Routing::GrainVerbTape;
    printed.tape.age = 0.75f;
    printed.tape.wow = 0.6f;
    printed.tape.hiss = 0.55f;
    printed.tape.dropouts = 0.5f;
    printed.tape.driveDb = 10.0f;
    render(outDir + "/03_printed_to_tape.wav", sr, printed, 16.0f);

    PedalSettings shimmer;
    shimmer.grain.mix = 0.55f;
    shimmer.grain.shimmer = 0.5f;
    shimmer.grain.feedback = 0.6f;
    shimmer.grain.reverse = 0.1f;
    shimmer.verb.decaySeconds = 20.0f;
    shimmer.verb.size = 1.0f;
    shimmer.verb.mix = 0.55f;
    shimmer.verb.highCutHz = 8000.0f;
    render(outDir + "/04_shimmer_cloud.wav", sr, shimmer, 20.0f);

    PedalSettings frozen;
    frozen.grain.mix = 0.7f;
    frozen.grain.density = 25.0f;
    frozen.grain.sizeMs = 350.0f;
    frozen.grain.pitch = -12.0f;
    frozen.grain.shimmer = 0.35f;
    render(outDir + "/05_frozen_pad.wav", sr, frozen, 16.0f,
           [](PedalSettings& s, float t) { s.grain.freeze = t > 3.4f && t < 13.0f; });

    std::printf("\n%s: %d failure(s)\n", gFailures == 0 ? "ALL PASSED" : "FAILED", gFailures);
    return gFailures == 0 ? 0 : 1;
}
