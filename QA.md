# Release verification — Browser Video Compressor v1.0 (2026-10-20)

## Evidence

- **13/13 unit tests passed** using Node's built-in test runner (`codec.test.mjs`). Tested: target calculation, too-small targets, AAC copy/encode selection, input filename safety, FFmpeg arguments, optional audio, retry behavior, metadata parsing, bytes formatting.
- **Syntax checks passed** for `app.mjs` and `codec.mjs`.
- **Native FFmpeg transcoding tests passed** on generated synthetic video: two-pass x264 + AAC output 560,969 bytes for an earlier 576,716-byte test target with 640x360 resolution at 24 fps; full stream decoding exited 0.
- **AAC copy test passed** at the updated decimal target: output 1,048,000 bytes approximately for 1.1 MB target; actual copied AAC stream SHA-256 was identical between original and output (`eda9f2ddad904be62ec13f0520d828ff69b116fa9ace87969c202449ccc8804a`).
- **No-audio test passed**: output 294,078 bytes under 300,000-byte target; decode exited 0.
- **HTML references checked**: all local JS/CSS references existed; 35 DOM IDs had no duplicates.

## Not verified

- **Real ffmpeg.wasm encoding inside a browser** was not executed: the browser automation environment rejected localhost navigation with `net::ERR_BLOCKED_BY_ADMINISTRATOR`.
- CDN availability, Web Worker creation and browser playback in a deployed GitHub Pages origin require live browser verification; do not equate native FFmpeg tests with WASM proof.
- Subjective image/audio fidelity, HDR handling, variable-frame-rate sources, uncommon codecs, long recordings and the upper browser memory limit are unverified.
- This artifact is not deployed to a live URL or committed to a GitHub repository.

## Release status

**Conditional candidate**, not production certified. It is safe to inspect and deploy to a test GitHub Pages origin; test a real video and download/seek/play through output on the target browser before sharing broadly.

## Worker-loader hotfix (2026-10-20)

- User reported on GitHub Pages: `Cannot find module 'blob:https://kotaru27.github.io/...'`.
- Analysis: the prebuilt UMD `814.ffmpeg` worker can route a dynamic core import to Webpack's internal loader; this cannot resolve runtime `blob:` URLs. The issue is documented upstream as ffmpegwasm/ffmpeg.wasm#619.
- Patch: same-origin `video-worker.js` runs native classic/ESM core loading and responds using FFmpeg.wasm's message protocol; core and wrapper versions and output settings are unchanged.
- Tests: **17/17 passed** (`node --experimental-vm-modules --test tests/*.test.mjs`). The four new tests use stubbed FFmpeg factories in Node VM; they cover both worker types and response/error/file/exec protocol, **not** a real WASM encode.
- Source syntax checked with `node --check app.mjs` and `node --check video-worker.js`.
- Headless Chromium navigation remained **blocked by environment policy**, including `data:` pages, so an actual browser-side FFmpeg boot/encode/playback test was **NOT RUN**.
- Release status: **conditional hotfix**, pending browser verification on the deployed Pages URL.
