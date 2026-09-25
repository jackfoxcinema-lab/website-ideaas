cmake_minimum_required(VERSION 3.16)
project(YardSalePedal VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release)
endif()

option(YARDSALE_BUILD_TESTS "Build the offline render/test harness" ON)
option(YARDSALE_BUILD_PLUGIN "Build the JUCE VST3/Standalone wrapper (needs JUCE_DIR)" OFF)
set(YARDSALE_PI_CPU "" CACHE STRING "Tune for a Raspberry Pi core, e.g. cortex-a72 (Pi 4) or cortex-a76 (Pi 5)")

# --- DSP core: no framework dependencies -------------------------------------
add_library(yardsale_dsp STATIC
    src/dsp/TapeStage.cpp
    src/dsp/GranularSwirl.cpp
    src/dsp/LushReverb.cpp
    src/dsp/PedalChain.cpp)
target_include_directories(yardsale_dsp PUBLIC src)

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(yardsale_dsp PRIVATE -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wno-sign-conversion)
    if(YARDSALE_PI_CPU)
        target_compile_options(yardsale_dsp PUBLIC -mcpu=${YARDSALE_PI_CPU})
    endif()
endif()

# --- Offline harness ----------------------------------------------------------
if(YARDSALE_BUILD_TESTS)
    add_executable(yardsale_tests tests/render_and_test.cpp)
    target_link_libraries(yardsale_tests PRIVATE yardsale_dsp)
endif()

# --- JUCE plugin wrapper ------------------------------------------------------
if(YARDSALE_BUILD_PLUGIN)
    if(NOT JUCE_DIR)
        message(FATAL_ERROR "Set -DJUCE_DIR=/path/to/JUCE to build the plugin")
    endif()
    enable_language(C) # JUCE compiles a few C sources
    add_subdirectory(${JUCE_DIR} juce)

    juce_add_plugin(YardSale
        COMPANY_NAME "Yard Sale Audio"
        PLUGIN_MANUFACTURER_CODE Ysal
        PLUGIN_CODE Ysp1
        FORMATS VST3 Standalone
        PRODUCT_NAME "Yard Sale"
        IS_SYNTH FALSE
        NEEDS_MIDI_INPUT FALSE
        NEEDS_MIDI_OUTPUT FALSE
        COPY_PLUGIN_AFTER_BUILD FALSE)

    target_sources(YardSale PRIVATE src/plugin/PluginProcessor.cpp)
    target_compile_definitions(YardSale PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0)
    target_link_libraries(YardSale
        PRIVATE yardsale_dsp juce::juce_audio_utils
        PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)
endif()
