# Capstan CS-1

A tape recorder for voice notes on iPhone, as an installable web app.
Press REC, talk, press STOP. Spin the platter to scrub, hear it rewind.

**Install:** open the app's link in Safari on the iPhone → Share → **Add to Home Screen**.
Install first, then record: the Home Screen app keeps its own tapes, separate from Safari.

- `PLAN.md`: the full plan, research and design rationale.
- No build step. Every file here is served as-is.

## Develop

```bash
npx http-server . -p 8123 -c-1        # localhost counts as secure, so the mic works
node tests/dsp.test.js                # tape model checks
NODE_PATH=$(npm root -g) node tests/e2e.cjs http://localhost:8123/ voice.wav out/   # headless iPhone run
```

`tests/make_voice.py out.wav` makes the synthetic voice used as the fake microphone.

Bump `VERSION` in `sw.js` on every deploy so installed copies pick up the new files.
