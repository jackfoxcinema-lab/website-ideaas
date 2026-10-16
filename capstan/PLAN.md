# CAPSTAN CS-1 — build plan

A voice-notes recorder for iPhone that looks and behaves like a portable tape machine.
You press REC, speak, and your voice goes "onto tape". A big metal platter spins while it plays.
Grab the platter and the tape follows your finger: drag back and you hear it rewind, pitch and all.

Named after the capstan, the spindle in a tape machine that pulls tape past the heads at a constant speed.

---

## 1. Decisions (no maybes)

| Question | Decision | Why |
|---|---|---|
| Native app or web app? | **Installable web app (PWA)**: plain HTML/CSS/JS, no build step. | A native iOS app cannot be AirDropped. It needs Xcode on a Mac, code signing, and re-signing every 7 days on a free account. A web app over HTTPS can be AirDropped as a link, added to the Home Screen, and then runs full-screen and offline like an app, microphone included. |
| Where does it live? | **GitHub Pages**, `gh-pages` branch of `jackfoxcinema-lab/website-ideaas`, folder `/capstan/`. | Free HTTPS, which iPhone mic access requires. A separate branch leaves the site code on the default branch untouched. |
| Install path | AirDrop the URL (or scan the QR) → Safari → Share → **Add to Home Screen**. | Home Screen web apps keep their storage. Safari tabs can have script storage evicted after 7 days of disuse. |
| Recording format | 16-bit PCM, mono, at the device rate (48 kHz on iPhone). Stored raw in IndexedDB in 2-second chunks while recording. | Lossless. No decode step, so a tape is scrubbable the instant you hit STOP. Chunking means a crash loses at most 2 s. |
| Tape length | **C30: 15 minutes a side.** At 15:00 recording rolls over onto the next tape with no gap. | Caps memory per tape (about 86 MB) so scrubbing stays smooth on a phone, and nothing is ever lost. |
| Tape character | **Non-destructive.** Saved audio is clean. The tape model runs live on playback and is "printed" into exported files. | You can change stock and drive after recording, while listening (forgiveness/undo, B). |
| Sound controls | Two only: **STOCK** (formulation) and **DRIVE** (how hard you hit the tape). | Less but better. Wow, flutter, hiss and bandwidth are properties of the stock, not knobs (Hick's law, B; Occam's razor, B). |
| Export | WAV with the tape printed in, via the iOS share sheet (AirDrop, Files, Messages). | Universal format. The share sheet is the native iOS pattern (Jakob's law, B). |

## 2. The job and the user

- **User:** you, on an iPhone, often one-handed, capturing ideas: melodies, lyrics, voice notes.
- **Job:** "Catch this idea now, and let me find and replay it fast later."
- **Feeling:** a physical object you want to touch. Pressing REC feels like committing something to tape.
- **Success metric:** time from opening the app to recording is under 1 second, one tap.
- **Guardrail:** zero lost recordings (crash, call interruption, app switch).

## 3. The device face (one screen)

The whole screen is the machine. There's one screen and no tab bar.

```
┌───────────────────────────────────────┐
│  CS-1               ┌─────────────┐   │  model engraving · LED + mic hole
│  • •                │ TODAY       │   │  OLED, 96×32 pixels, white on black
│                     │ 0.01.37 [05]│   │  day / position / tape number
│                     └─────────────┘   │
│        ╭───────────────────────╮      │
│      ╱   48/16  ╲               ╲     │  flat platter, rotates with
│     │        ╲   ( hub )         │    │  the tape, 1 revolution = 1.8 s
│     │         ╲          TYPE II │    │  tape pack grows around the hub
│      ╲         ╲                ╱     │  progress ring in the recess
│        ╰───────────────────────╯      │
│  (≡) TAPES    [ TYPE II ]    ◀◀ ╱▶▶   │  library · stock · cue rocker
│ ┌────────┬────────┬────────┐ ║ ║      │
│ │   ●    │   ▶    │   ■    │ ║▓║DRIVE │  transport keys + drive fader
│ │  REC   │  PLAY  │  STOP  │ ║ ║      │
│ └────────┴────────┴────────┘          │
└───────────────────────────────────────┘
```

Visual language, taken from your three references:
- **TP-7:** the platter with its single diagonal line and tiny printed specs, the black OLED with chunky pixel type and an inverted number badge, three big transport keys, a two-groove fader, and orange used only for record. Rendered flat: solid fills and hairlines, no textures, gradients or shadows.
- **Beat app:** warm greys, flat fills, latched keys that turn solid ink, a monospaced font for data (`0:01:37 · TYPE II`), a waveform with handles.
- **Calendar:** huge bold numerals, a dot grid, a single orange "today" dot, a short motto in spaced capitals.

Principles applied:
- **One primary action (Von Restorff, B):** the REC dot is the only orange thing on the idle screen.
- **Thumb zone (Fitts's law, A):** all transport keys sit in the bottom third and are at least 88×110 pt. Every target is at least 44 pt.
- **Match the real world (Nielsen #2, B):** the tape pack on the platter grows as you record or play through, so how much tape is wound shows progress without a progress bar.
- **Signifiers (B):** the platter is printed "SPIN TO SCRUB", like the TP-7 prints its specs. There's no tooltip and no onboarding tour (vanilla trap, rejected).
- **Visibility of status (B):** the OLED always says what the machine is doing: REC, PAUSE, ◀◀ 8.0x, DRIVE 62, SAVED.
- **Contrast (WCAG):** secondary text #5D5D59 on #E9E8E4 is 5.3:1. OLED white on black is 18:1.

## 4. Controls, and exactly what they do

| Control | Tap | Hold / drag |
|---|---|---|
| **● REC** | Start a new tape. While recording, tap again to pause or resume. | — |
| **▶ PLAY** | Play or pause. The motor spins up in 60 ms with a tiny pitch rise. At the end of the tape, it plays from the top. | — |
| **■ STOP** | Stop (short tape-stop slide). Stopping a recording saves it and the tape **auto-rewinds audibly** to the top. Tap STOP again while stopped to return to zero. | — |
| **Platter** | — | Drag to scrub. The tape follows your finger 1:1: back means reverse audio, slow means low pitch. Flick it and it keeps spinning, then the motor grabs it again (playing) or friction stops it (stopped). Hold it still to stop the tape. Locked while recording. |
| **◀◀ / ▶▶** | Jump 5 s back or forward, with an audible "zip". | Cue: 4× after 0 s, 12× after 1 s, audible like a cassette deck in review mode. |
| **STOCK** | Cycle TYPE I → TYPE II → REEL 15 → WORN → DIRECT. Applies to the loaded tape live and becomes the default for new tapes. | — |
| **DRIVE fader** | — | 0–100. Sets how hard the signal hits the tape. Loudness stays matched, so you hear character, not volume. |
| **TAPES** | Open the library. | — |
| **OLED** | Open the library. | — |

Keyboard/VoiceOver: every key is a real `<button>` with a label. The platter and fader are `role="slider"` and respond to arrow keys. ◀◀/▶▶ give a single-pointer alternative to dragging (WCAG 2.5.7).

## 5. The library ("TAPES")

A sheet slides up over the device:
- **Header:** a giant tape count (`07`), the month and year, and a dot calendar. Days you recorded on are filled, today is the orange dot, future days are hollow. Tap a filled day to jump to its tapes.
- **Rows:** big mono number `05`, name (defaults to the time of day, e.g. "15:42"), `0:01:37 · TYPE II`, and a 48-bar mini waveform. Tap a row to load it onto the platter.
- **Row actions (⋯):** RENAME (inline), SHARE (WAV through the share sheet), DELETE. Delete is instant with **UNDO** for 6 s, never "Are you sure?" (forgiveness, B).
- **Empty state:** a huge `00`, "No tapes yet", and one button: **Start recording**. It closes the sheet and starts REC (state reframing).
- **Footer:** storage used, three deck settings (key sounds, auto-rewind, export with tape on/off), and the motto **PRESS REC. THINK LATER.**

## 6. Every state

| State | OLED line 1 / line 2 | Device |
|---|---|---|
| First launch, no tapes | `READY` / `PRESS REC` | Platter idle, REC dot lit |
| Asking for mic | `ARMING` / `ALLOW MIC` | REC LED blinks |
| Mic denied | `NO MIC` / `SEE SETTINGS` | Label on the device explains the fix in one sentence |
| Recording | `● REC` / `0.00.12 [05]` + level meter | Platter spins, LED glows with level, tape pack grows |
| Rec paused | `PAUSE` blinking | Platter stops |
| 1 minute before side end | `1 MIN LEFT` flashes | — |
| Side full (15:00) | `SIDE B` | Seamless rollover onto the next tape |
| Saved | `SAVED` / tape number | Audible auto-rewind to the top |
| Playing | day / time | Platter at 33⅓ rpm |
| Scrubbing | `SCRUB` / speed `-2.4x` | — |
| Cue | `◀◀ 12x` | — |
| App sent to background while recording | Recording is saved immediately | On return: `RECOVERED` |
| Crash mid-recording | On next launch, unfinished chunks are rebuilt | `RECOVERED` |
| Phone call / audio interruption | Same as background | — |
| Running in a Safari tab | — | A paper "sticker" on the device: "Add to Home Screen so your tapes stay safe." Dismissible. |
| Reduced motion | Sheets fade instead of slide, the REC light is steady instead of blinking | — |

**Peak and end (peak-end rule, A).** The peak is the first scrub: grab the platter and hear your own voice go backwards. The end of every recording is the audible auto-rewind and `SAVED`. It's physical proof the take is safe.

## 7. Tape simulation: the research and the model

A real tape machine colours sound in a few specific, well-understood ways. Each one is modelled.

**Record path (what gets "printed")**
1. **Drive.** Input gain into the tape, −10 to +20 dB, with matched makeup gain afterwards.
2. **Record pre-emphasis.** A high shelf boosts the treble before the tape and the playback EQ cuts it back after. Net: flat at low levels. Because treble hits the tape harder, **loud highs saturate first**: the classic soft, rounded "tape top end". The corner follows the real equalisation time constants: 120 µs (TYPE I, about 1.3 kHz), 70 µs (TYPE II, about 2.3 kHz), 50 µs (REEL 15, about 3.2 kHz).
3. **Magnetic hysteresis (Jiles–Atherton model).** Tape is a magnetic material. Its magnetisation M follows the field H through a hysteresis loop, solved per sample: anhysteretic curve M_an = M_s·L((H+αM)/a), with L the Langevin function coth(x) − 1/x, plus irreversible (k) and reversible (c) terms. A second-order Runge–Kutta step runs at 2× oversampling. This is the same physics Chowdhury used in the open-source CHOW Tape Model (DAFx 2019). It produces:
   - soft compression that rises with level,
   - mostly odd harmonics (3rd, 5th), which sound warm rather than fizzy,
   - level- and frequency-dependent phase, the "glue" a static waveshaper cannot do.

**Medium**

4. **Hiss.** Noise is **tied to tape position, not time.** Stop the tape and the hiss stops. Scrub slowly and the hiss drops in pitch with the audio, as it does on a real machine.
5. **Dropouts** (WORN only). Short level dips with treble loss, also fixed to tape position, so the same flaw recurs at the same spot.

**Playback path**

6. **Playback de-emphasis.** The inverse shelf. It also darkens the hiss, which is why tape hiss sounds soft.
7. **Head bump.** A low-frequency resonance from the playback head's contour, about +1.5 to +3 dB. It **scales with tape speed**: on pro machines the bump falls an octave from 30 to 15 ips (roughly 100 → 50 Hz). Modelled as a peak with a roll-off below it.
8. **Gap and spacing loss.** Treble roll-off that also **scales with speed**, because recorded wavelength = speed ÷ frequency. Scrub slowly and the sound gets muffled; cue fast and it gets brighter and chattery, as a deck in review mode does.
9. **Wow and flutter.** Speed wobble applied directly to the transport velocity, so it is true pitch modulation and not a chorus effect. Wow is below 6 Hz (capstan eccentricity plus slow drift). Flutter is 6–100 Hz (scrape flutter). Measured figures: pro reel machines are under 0.04 %, cassette decks around 0.1 % or more.

**The stocks**

| Stock | Models | Bandwidth | Hiss | Wow & flutter | Head bump | Saturation |
|---|---|---|---|---|---|---|
| TYPE I | Ferric cassette | 11 kHz | −56 dB | 0.15 % | 48 Hz +1.5 dB | early, warm |
| TYPE II | Chrome cassette (default) | 14 kHz | −62 dB | 0.10 % | 48 Hz +1.5 dB | medium |
| REEL 15 | ¼″ reel-to-reel, 15 ips | 20 kHz | −70 dB | 0.04 % | 55 Hz +2.5 dB | high headroom, punchy |
| WORN | Old dictaphone or walkman | 6.5 kHz | −46 dB | 0.8 % + dropouts | 90 Hz +2 dB | crunchy |
| DIRECT | Bypass | full | none | none | none | none |

## 8. The platter engine (the non-negotiable)

- **Transport** runs in an AudioWorklet on the audio thread, never the UI thread, so it doesn't glitch when the UI is busy.
- Reads the tape at any velocity, forwards or **backwards**, with 4-point Hermite interpolation. Above 1× it averages the samples it skips over, an anti-alias filter, so cueing sounds like tape and not digital grit.
- **One revolution = 1.8 s of tape** (33⅓ rpm at 1×). The platter angle and the tape position are the same number, so what you see is what you hear.
- **Finger physics.** The finger sets a target position. The tape follows with a two-stage smoother (about 30 ms) so pitch glides instead of zipper-stepping. On release the tape keeps its velocity. Then either the motor grabs it back to 1× (time constant 150 ms) or friction stops it (600 ms).
- **Motor.** Spin-up 60 ms, spin-down 80 ms. Short enough to feel instant (under the 400 ms Doherty threshold, B), long enough to hear the tape.
- **Seeks** (skip, rewind to zero) fly through the tape at up to 400×, finishing in under a second, so you hear the rewind.
- The UI draws the platter from the audio thread's reported position, extrapolated every frame. While your finger is down it draws your finger directly, for zero visual lag.

## 9. iPhone specifics, handled

- **Silent switch:** audio session set to `playback`, so the app plays with the ringer off. During recording it's set to `play-and-record`.
- **Mic routing:** the mic is released the moment recording stops, so playback returns to the loud speaker (not the earpiece) and the orange privacy dot goes away.
- **Raw mic:** echo cancellation, noise suppression and auto-gain are off. You get the real room.
- **Screen lock:** a screen wake lock holds the screen on during recording. iOS suspends web audio in the background, so if the app is backgrounded anyway the take is saved instantly and the app says so.
- **Persistence:** `navigator.storage.persist()` is requested. Home Screen apps are exempt from Safari's 7-day storage eviction.
- **Offline:** a service worker caches the whole app. It works in airplane mode.
- **Haptics:** iOS has no Vibration API. The app uses the iOS 18 "switch" haptic as a best-effort extra, plus synthesized key clicks (which can be turned off). Haptics may not fire on every iOS version, so nothing depends on them.

## 10. Files

```
capstan/
  index.html             device markup, a11y labels, PWA meta
  styles.css             aluminium + graphite finishes (light/dark), all tokens
  app.js                 state machine, UI, gestures, OLED renderer, library, storage
  dsp.js                 tape model (shared by worklet, export worker, tests)
  worklet.js             transport + recorder AudioWorklet processors
  export-worker.js       offline "print to tape" WAV renderer
  sw.js                  offline cache
  manifest.webmanifest   install metadata
  icons/                 home-screen icons
  tests/dsp.test.js      DSP checks (stability, levels, harmonics, reverse reads)
  tests/e2e.mjs          headless iPhone-viewport run: record → stop → play → scrub → library
```

## 11. Build order

1. DSP and transport, tested in Node: no NaNs at any drive or frequency, unity small-signal gain, rising THD with drive, hiss level per stock, exact reverse reads.
2. Device face: layout, platter, OLED font, keys, fader. Checked in screenshots at iPhone 15/16 size, light and dark.
3. Recording: worklet capture, chunked IndexedDB writes, rollover, recovery.
4. Playback and scrub: wire the platter physics to the worklet.
5. Library: list, calendar, rename, share, delete with undo.
6. PWA: manifest, icons, service worker, install sticker.
7. End-to-end headless test with a fake microphone.
8. Deploy to GitHub Pages and confirm it's live.

## 12. What to watch once it's on your phone (test plan)

| Risk | How to check | Pass |
|---|---|---|
| Scrub feel on real hardware | Drag the platter back and forth on speech | Pitch glides with no clicks or stutter |
| Recording survives interruptions | Record, then take a call or swipe home | Take is there with `RECOVERED` |
| Playback loud with silent switch on | Ringer off, play | Audible through the speaker |
| Storage persists | Record, then don't open for a week | Tapes still there (Home Screen install) |
