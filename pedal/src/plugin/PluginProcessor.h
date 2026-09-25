// Thin JUCE adapter around yardsale::PedalChain. No editor: hosts show their
// generic parameter UI. All DSP lives in src/dsp and builds without JUCE.

#pragma once

#include "dsp/PedalChain.h"

#include <juce_audio_processors/juce_audio_processors.h>

#include <array>

class YardSaleProcessor final : public juce::AudioProcessor
{
public:
    // Order must match the descriptor table in PluginProcessor.cpp.
    enum Param
    {
        InputGain, OutputGain, RoutingChoice,
        TapeOn, TapeDrive, TapeWow, TapeFlutter, TapeAge, TapeHiss, TapeDropouts, TapeOutput,
        GrainOn, GrainMix, GrainSize, GrainDensity, GrainPosition, GrainScatter, GrainPitch,
        GrainJitter, GrainAsync, GrainSpread, GrainReverse, GrainShimmer, GrainSwirl,
        GrainFeedback, GrainTone, GrainFreeze,
        VerbOn, VerbMix, VerbPreDelay, VerbSize, VerbDecay, VerbDiffusion, VerbModDepth,
        VerbModRate, VerbLowCut, VerbHighCut, VerbWidth,
        NumParams
    };

    YardSaleProcessor();

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override;
    using juce::AudioProcessor::processBlock;

    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }

    const juce::String getName() const override { return "Yard Sale"; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override;

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    juce::AudioProcessorValueTreeState parameters;

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();

    // Snapshot of every parameter, taken at the top of each block.
    yardsale::PedalSettings readSettings() const;
    float value(Param p) const { return raw[static_cast<size_t>(p)]->load(std::memory_order_relaxed); }
    bool flag(Param p) const { return value(p) >= 0.5f; }

    // Resolved once in the constructor: looking parameters up by string on
    // the audio thread would build juce::Strings, i.e. allocate.
    std::array<std::atomic<float>*, NumParams> raw {};

    yardsale::PedalChain chain;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(YardSaleProcessor)
};
