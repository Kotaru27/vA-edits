# Video Compressor v2 — release evidence (2026-10-20)

## Checked in this build

- **23/23** Node.js tests passed (`node --experimental-vm-modules --test tests/*.test.mjs`): existing encoding-planner and worker contract checks; new fast-encode command, exact original MP4 filename, non-MP4 extension, and ZIP checks.
- JavaScript syntax checks passed for `app.mjs`, `codec.mjs`, `zip.mjs`.
- Native FFmpeg comparative **4-second synthetic fixture**: new one-pass `veryfast` H.264/AAC 0.518 seconds, previous medium two-pass plus full decode 0.364 + 0.774 + 0.185 = **1.323 seconds**, ~2.55x relative difference **on that short native test only**. Both outputs report 640×360 at 24 fps with H.264 video and AAC audio. Native timings are not a browser/WebAssembly speed guarantee.
- Browser DOM test via Playwright `page.set_content` (no navigation) passed: 2 selected video files, no preview open by default, optional preview opens and closes, target input and removal work; zero JS page errors.
- Browser UI integration with **mocked FFmpeg backend** passed: two jobs completed in sequence, suggested filenames remained `One.MP4` and `Two.mp4`, batch ZIP was downloaded; Python standard-library ZIP verification confirmed both member filenames and CRC validity. This does **not** prove the actual ffmpeg.wasm engine compressed these files.
- Standalone ZIP builder test produced a valid archive with unicode filenames and deterministic collision handling.

## Not verified

- Real browser ffmpeg.wasm v2 end-to-end encoding on GitHub Pages: browser navigation to local test origin is blocked by `net::ERR_BLOCKED_BY_ADMINISTRATOR`. The deployed HTTPS page, worker/CDN loading, actual downloads, cancellation under heavy files, and playback through the entire video remain to be checked on a user browser.
- Typical speedup on long videos and user hardware has not been measured; input complexity, CPU, browser memory, and whether a second encoding pass is triggered can change performance dramatically.
- Visual quality equivalence is not guaranteed. One-pass compression can be less accurate near a strict target than two-pass compression; aggressive size settings may compromise fidelity.

## Status

**Conditional upgrade** pending real-world browser compression verification. Tests in this document distinguish real native media checks, browser DOM/mocked integration and unverified CDN/WebAssembly production behavior.
