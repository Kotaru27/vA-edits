# Video Compressor v6 — stability verification (2026-10-20)

## Source and scope

Baseline GitHub `main`: `eacaa7dad6a5db03f26f59c6c52da64ad0879257`. Stability-only update: no changes to layout, output naming for normal files, 8 MB default, batch size controls or ZIP format.

## Tests performed

- **45/45 Node unit and contract tests passed** under Node v22 with `--experimental-vm-modules`. Coverage includes multi-audio parsing, bitrate allocation, long-filename collisions, target edit preservation, explicit recompression, unload warning, existing encoder and ZIP behavior.
- **Four simulated Chromium browser runs passed** at 2560, 1440, 1080 and 390px. Each completed two files, showed progress, preserved names and links, tested batch ZIP and target wheel behavior. At 1440px, a deliberately failed re-encode retained the previous download. Encoder engine was a stub, not real FFmpeg.wasm.
- **Real native FFmpeg tests passed** on a 3-second synthetic video with two AAC tracks: input 570,188 bytes; new encoded MP4 351,904 bytes containing one H.264 video and **two AAC tracks**. Short decode at beginning and near the end exited 0. Another test copied both AAC tracks and produced a 258,375-byte MP4.
- Syntax validation passed for `app.mjs` and `codec.mjs`. No modified test fixtures or screenshots are required for the static release.

## Unverified and remaining risks

- Full, deployed ffmpeg.wasm end-to-end encoding, especially the new stream probe and sampled decode commands, is **not verified**. This environment blocks local/browser navigation and remote CDN downloads. Native FFmpeg success is not equivalent to WebAssembly success.
- The source file can contain broken frames in the middle while short samples decode correctly. Full-file decoding would detect more defects but would be slower; users can optionally Preview.
- Runtime FFmpeg wrapper/core are loaded from version-pinned CDNs without executable-content integrity pinning. A strict CSP/self-hosted package is deferred pending a live browser test.
- Actual low-RAM behavior and sudden browser termination are not covered. Unload warnings cannot protect against crashes; browser permission UX varies.
- Extra subtitle/metadata streams are not retained. Multi-track video preservation is limited to video + audio as documented.

## Release gate

**Conditional candidate:** commit only with a reversible parent and verify a real video on Chrome (including multi-audio and failed recompression) before claiming production certification.

## Hotfix addendum — valid videos falsely marked as missing streams (2026-10-20)

- Cause identified in released `app.mjs`: `probeDetails()` used `ffmpeg.exec(['-hide_banner','-i',input])` and rejected input solely if captured log text did not match `/Stream #.*Video:/`. A browser with absent/delayed FFmpeg log messages could wrongly fail all queued MP4s before encoding.
- Replaced log-based source and output inspection with `FFmpeg.ffprobe()` writing structured JSON into the FFmpeg virtual filesystem. Introduced `probe.mjs` for JSON parsing, all audio tracks and source duration/frame data. A fallback checks decoded video-frame success and audio map operations by FFmpeg exit status, even with empty logs.
- **50/50 local Node tests passed** with the worker-test `--experimental-vm-modules` flag, including new JSON parser and fallback contract tests.
- **Two headless Chromium simulations passed** with console logging disabled: nine-file batch using structured FFprobe metadata and nine-file batch with FFprobe deliberately disabled. In both, all nine video items completed and produced download links. The FFmpeg engine was simulated; these are not real WebAssembly encodes.
- Native `ffprobe` wrote and parsed a real 4-second H.264/AAC sample into JSON via `-o` without relying on logs; confirmed one video stream and one audio stream.
- The previous v6 live failure has not been reproduced with an actual 56 MB source file inside a deployed browser. This is a targeted, source-backed fix with remaining live verification required.

## v7 candidate evidence (2026-10-21)

- Verified against source baseline `b336b07427ddbf20dd1a4cfbee8c5d41176bb96a`. Changed session lifecycle, encoder strategy and tests; layout and CDN loader remain unchanged.
- Native FFmpeg 6-second 640x360/24fps moving sample, ~429KB matched file size: single-pass veryfast SSIM All 0.959456; two-pass medium SSIM All 0.960352. Encode CPU wall time 0.55 sec vs ~1.29 sec. This illustrates a small improvement on this fixture only; quality is content-dependent.
- Strategy logic, 5-video limits, completed MP4 passthrough, FFmpeg argument construction are checked in source and the additional regression tests. GitHub-hosted CI and real WebAssembly/browser encodes are not yet verified in this candidate.
- Existing browser CDN restrictions remain; a strict integrity-verified vendored core is a separate release risk. No quality score is claimed without comparing output to the original video.
