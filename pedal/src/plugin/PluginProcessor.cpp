#include "PluginProcessor.h"

namespace {

enum class Kind { Float, Bool, Choice };

struct Descriptor
{
    const char* id;
    const char* name;
    Kind kind;
    float min, max, def, centre; // centre > 0 skews the knob around that value
    const char* unit;
};

// One row per YardSaleProcessor::Param, same order. Defaults mirror PedalSettings.
constexpr Descriptor kParams[] = {
    { "inputGain",     "Input",              Kind::Float,  -24.0f,  24.0f,   0.0f,    0.0f, "dB" },
    { "outputGain",    "Output",             Kind::Float,  -24.0f,  12.0f,   0.0f,    0.0f, "dB" },
    { "routing",       "Routing",            Kind::Choice,   0.0f,   5.0f,   0.0f,    0.0f, "" },

    { "tapeOn",        "Tape On",            Kind::Bool,     0.0f,   1.0f,   1.0f,    0.0f, "" },
    { "tapeDrive",     "Tape Drive",         Kind::Float,    0.0f,  18.0f,   6.0f,    0.0f, "dB" },
    { "tapeWow",       "Tape Wow",           Kind::Float,    0.0f,   1.0f,   0.35f,   0.0f, "" },
    { "tapeFlutter",   "Tape Flutter",       Kind::Float,    0.0f,   1.0f,   0.3f,    0.0f, "" },
    { "tapeAge",       "Tape Age",           Kind::Float,    0.0f,   1.0f,   0.4f,    0.0f, "" },
    { "tapeHiss",      "Tape Hiss",          Kind::Float,    0.0f,   1.0f,   0.3f,    0.0f, "" },
    { "tapeDropouts",  "Tape Dropouts",      Kind::Float,    0.0f,   1.0f,   0.15f,   0.0f, "" },
    { "tapeOutput",    "Tape Output",        Kind::Float,  -24.0f,  12.0f,   0.0f,    0.0f, "dB" },

    { "grainOn",       "Grain On",           Kind::Bool,     0.0f,   1.0f,   1.0f,    0.0f, "" },
    { "grainMix",      "Grain Mix",          Kind::Float,    0.0f,   1.0f,   0.35f,   0.0f, "" },
    { "grainSize",     "Grain Size",         Kind::Float,   20.0f, 500.0f, 180.0f,  120.0f, "ms" },
    { "grainDensity",  "Grain Density",      Kind::Float,    1.0f,  40.0f,  12.0f,   10.0f, "/s" },
    { "grainPosition", "Grain Position",     Kind::Float,    0.0f, 2000.0f, 350.0f, 400.0f, "ms" },
    { "grainScatter",  "Grain Scatter",      Kind::Float,    0.0f,   1.0f,   0.4f,    0.0f, "" },
    { "grainPitch",    "Grain Pitch",        Kind::Float,  -12.0f,  12.0f,   0.0f,    0.0f, "st" },
    { "grainJitter",   "Grain Pitch Jitter", Kind::Float,    0.0f, 100.0f,  12.0f,   25.0f, "ct" },
    { "grainAsync",    "Grain Async",        Kind::Float,    0.0f,   1.0f,   0.7f,    0.0f, "" },
    { "grainSpread",   "Grain Spread",       Kind::Float,    0.0f,   1.0f,   0.8f,    0.0f, "" },
    { "grainReverse",  "Grain Reverse",      Kind::Float,    0.0f,   1.0f,   0.25f,   0.0f, "" },
    { "grainShimmer",  "Grain Shimmer",      Kind::Float,    0.0f,   1.0f,   0.15f,   0.0f, "" },
    { "grainSwirl",    "Grain Swirl",        Kind::Float,    0.0f,   1.0f,   0.5f,    0.0f, "" },
    { "grainFeedback", "Grain Feedback",     Kind::Float,    0.0f,   0.9f,   0.35f,   0.0f, "" },
    { "grainTone",     "Grain Tone",         Kind::Float, 1000.0f, 16000.0f, 6000.0f, 4000.0f, "Hz" },
    { "grainFreeze",   "Grain Freeze",       Kind::Bool,     0.0f,   1.0f,   0.0f,    0.0f, "" },

    { "verbOn",        "Verb On",            Kind::Bool,     0.0f,   1.0f,   1.0f,    0.0f, "" },
    { "verbMix",       "Verb Mix",           Kind::Float,    0.0f,   1.0f,   0.45f,   0.0f, "" },
    { "verbPreDelay",  "Verb Pre-delay",     Kind::Float,    0.0f, 500.0f,  30.0f,   80.0f, "ms" },
    { "verbSize",      "Verb Size",          Kind::Float,    0.0f,   1.0f,   0.8f,    0.0f, "" },
    { "verbDecay",     "Verb Decay",         Kind::Float,    0.3f,  60.0f,   8.0f,    5.0f, "s" },
    { "verbDiffusion", "Verb Diffusion",     Kind::Float,    0.0f,   1.0f,   0.75f,   0.0f, "" },
    { "verbModDepth",  "Verb Mod Depth",     Kind::Float,    0.0f,   1.0f,   0.45f,   0.0f, "" },
    { "verbModRate",   "Verb Mod Rate",      Kind::Float,    0.05f,  4.0f,   0.45f,   0.6f, "Hz" },
    { "verbLowCut",    "Verb Low Cut",       Kind::Float,   20.0f, 1000.0f, 120.0f, 150.0f, "Hz" },
    { "verbHighCut",   "Verb High Cut",      Kind::Float,  500.0f, 20000.0f, 5500.0f, 4000.0f, "Hz" },
    { "verbWidth",     "Verb Width",         Kind::Float,    0.0f,   1.0f,   1.0f,    0.0f, "" },
};

static_assert(sizeof(kParams) / sizeof(kParams[0]) == YardSaleProcessor::NumParams,
              "parameter table out of sync with YardSaleProcessor::Param");

} // namespace

YardSaleProcessor::YardSaleProcessor()
    : AudioProcessor(BusesProperties()
                         .withInput("Input", juce::AudioChannelSet::stereo(), true)
                         .withOutput("Output", juce::AudioChannelSet::stereo(), true)),
      parameters(*this, nullptr, "YardSale", createLayout())
{
    for (size_t i = 0; i < raw.size(); ++i)
    {
        raw[i] = parameters.getRawParameterValue(kParams[i].id);
        jassert(raw[i] != nullptr);
    }
}

juce::AudioProcessorValueTreeState::ParameterLayout YardSaleProcessor::createLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;

    for (const Descriptor& d : kParams)
    {
        const juce::ParameterID id { d.id, 1 };
        switch (d.kind)
        {
            case Kind::Bool:
                layout.add(std::make_unique<juce::AudioParameterBool>(id, d.name, d.def >= 0.5f));
                break;

            case Kind::Choice:
                layout.add(std::make_unique<juce::AudioParameterChoice>(
                    id, d.name,
                    juce::StringArray { "Tape > Grain > Verb", "Tape > Verb > Grain", "Grain > Tape > Verb",
                                        "Grain > Verb > Tape", "Verb > Tape > Grain", "Verb > Grain > Tape" },
                    static_cast<int>(d.def)));
                break;

            case Kind::Float:
            {
                juce::NormalisableRange<float> range { d.min, d.max };
                if (d.centre > 0.0f)
                    range.setSkewForCentre(d.centre);
                if (juce::String(d.unit) == "st")
                    range.interval = 1.0f; // semitone steps
                layout.add(std::make_unique<juce::AudioParameterFloat>(
                    id, d.name, range, d.def, juce::AudioParameterFloatAttributes().withLabel(d.unit)));
                break;
            }
        }
    }

    return layout;
}

yardsale::PedalSettings YardSaleProcessor::readSettings() const
{
    yardsale::PedalSettings s;
    s.inputGainDb = value(InputGain);
    s.outputGainDb = value(OutputGain);
    s.routing = static_cast<yardsale::Routing>(juce::jlimit(0, 5, static_cast<int>(value(RoutingChoice))));

    s.tape.enabled = flag(TapeOn);
    s.tape.driveDb = value(TapeDrive);
    s.tape.wow = value(TapeWow);
    s.tape.flutter = value(TapeFlutter);
    s.tape.age = value(TapeAge);
    s.tape.hiss = value(TapeHiss);
    s.tape.dropouts = value(TapeDropouts);
    s.tape.outputDb = value(TapeOutput);

    s.grain.enabled = flag(GrainOn);
    s.grain.mix = value(GrainMix);
    s.grain.sizeMs = value(GrainSize);
    s.grain.density = value(GrainDensity);
    s.grain.positionMs = value(GrainPosition);
    s.grain.scatter = value(GrainScatter);
    s.grain.pitch = value(GrainPitch);
    s.grain.pitchJitterCents = value(GrainJitter);
    s.grain.async = value(GrainAsync);
    s.grain.spread = value(GrainSpread);
    s.grain.reverse = value(GrainReverse);
    s.grain.shimmer = value(GrainShimmer);
    s.grain.swirl = value(GrainSwirl);
    s.grain.feedback = value(GrainFeedback);
    s.grain.toneHz = value(GrainTone);
    s.grain.freeze = flag(GrainFreeze);

    s.verb.enabled = flag(VerbOn);
    s.verb.mix = value(VerbMix);
    s.verb.preDelayMs = value(VerbPreDelay);
    s.verb.size = value(VerbSize);
    s.verb.decaySeconds = value(VerbDecay);
    s.verb.diffusion = value(VerbDiffusion);
    s.verb.modDepth = value(VerbModDepth);
    s.verb.modRateHz = value(VerbModRate);
    s.verb.lowCutHz = value(VerbLowCut);
    s.verb.highCutHz = value(VerbHighCut);
    s.verb.width = value(VerbWidth);
    return s;
}

void YardSaleProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    chain.prepare(sampleRate, samplesPerBlock);
    chain.setSettings(readSettings());
    chain.reset(); // start from the current knob positions, no glide
}

bool YardSaleProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
    const auto in = layouts.getMainInputChannelSet();
    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo()
        && (in == juce::AudioChannelSet::mono() || in == juce::AudioChannelSet::stereo());
}

void YardSaleProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    const int numSamples = buffer.getNumSamples();
    if (buffer.getNumChannels() < 2 || numSamples == 0)
        return;

    // Mono guitar input: feed it to both sides of the stereo chain.
    if (getTotalNumInputChannels() == 1)
        buffer.copyFrom(1, 0, buffer, 0, 0, numSamples);

    chain.setSettings(readSettings());
    chain.processBlock(buffer.getWritePointer(0), buffer.getWritePointer(1), numSamples);
}

double YardSaleProcessor::getTailLengthSeconds() const
{
    // RT60 plus the furthest a grain can reach back into its buffer.
    return static_cast<double>(value(VerbDecay)) + 6.0;
}

void YardSaleProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    if (const auto xml = parameters.copyState().createXml())
        copyXmlToBinary(*xml, destData);
}

void YardSaleProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    if (const auto xml = getXmlFromBinary(data, sizeInBytes))
        if (xml->hasTagName(parameters.state.getType()))
            parameters.replaceState(juce::ValueTree::fromXml(*xml));
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new YardSaleProcessor();
}
