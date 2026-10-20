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
