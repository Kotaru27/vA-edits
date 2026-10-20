# Video Compressor v4 — release check (2026-10-20)

## Scope

- Moved target-size input, Compress and Cancel into the queue header; removed duplicate controls from the left panel. Default size is 8 MB per video.
- Prevented focused number field from changing under a mouse-wheel or trackpad scroll. Native keyboard arrow stepping and direct input remain available.
- Added a green left-to-right background fill on the active video row, synced with FFmpeg progress reports. The percentage label remains legible, and the fill resets on completion or cancellation.
- No codec, playback-validator, naming, ZIP, batch-processing or worker changes.

## Verified in this cloud workspace

- Node unit tests: **32/32 passed** (`node --experimental-vm-modules --test tests/*.test.mjs`). Four new source-contract assertions cover the relocated controls, 8 MB default, focus-aware wheel suppression, and progress fill.
- Chromium browser tests (mock FFmpeg, real UI): at 2560×1440, 1440×900, 1080×900 and 390×844 all four sizes verified: no horizontal overflow; size field and action buttons inside header; action visible within viewport before scrolling; default 8; wheel did not change field; keyboard ArrowUp increased it to 8.1; two queued files completed; fill advanced while compressing; buttons and progress reset afterward. No page errors.
- Simulated batch ZIP download unzipped with correct filenames and valid ZIP CRC.
- Screenshots: `tests/v4-2560.png`, `tests/v4-1440.png`, `tests/v4-1080.png`, `tests/v4-390.png` are local QA artifacts, not deployed application assets.

## Still unverified

- End-to-end real ffmpeg.wasm compression and playback of the user's actual videos on GitHub Pages. Chromium runs above used a simulated encoder, not a full WebAssembly encode.
- Trackpad-device hardware-specific scrolling outside the focused input; verified equivalent Chromium wheel input.

**Release classification:** Conditional until a real browser compression is checked.
