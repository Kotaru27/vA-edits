# Video Compressor v3 — release evidence (2026-10-20)

## Reproduced and repaired

The v2 app treated `checkBrowserPlayback()` timeout after 15 seconds as a fatal encoding error, revoked the output blob URL and marked the row `Failed`. This could discard an encoded MP4 even though FFmpeg had returned successfully. v3 removes that mandatory post-encode browser start check. It validates the full MP4 top-level box chain (ftyp, moov, mdat and length bounds) before preserving the download. User-requested preview shows native player errors within the dialog, without discarding the file. Incomplete or invalid MP4 structures still fail.

## Executed verification

- **28/28** Node tests passed using `node --experimental-vm-modules --test tests/*.test.mjs`. Includes 5 new MP4-container rejection/acceptance tests and all prior bitrate/filename/worker/ZIP tests.
- `node --check` passed for `app.mjs` and `codec.mjs`.
- The locally available native FFmpeg test output `tests/compressed.mp4` passed the new `validateMp4` check. Real full-length playback of users' files was not available.
- Chromium Playwright with simulated FFmpeg encoded two videos, displayed both as Completed, kept `One.MP4` and `Two.mp4` as download filenames, and downloaded a ZIP containing those exact names with valid CRC; zero page errors. It did not require automatic playback-ready events.
- Responsive Chromium DOM/layout checks at 390, 1080, 1440, 1920, and 2560 pixels showed no document-level horizontal overflow. At 1440px the queue bounds were x=428..1395; at 2560px x=522..2482. Full-width design screenshots were captured locally.

## Not verified

- Real WebAssembly FFmpeg compression on deployed GitHub Pages, long 24-second user video, or playback/seek on the user's device. Synthetic browser tests do not substitute for native ffmpeg.wasm behavior.
- User-perceived performance, atypical encoders, full visual/auditory quality and large-batch memory behavior are not established by these tests.

## Verdict

**Conditional release candidate** until a real 56.1 MB input completes, downloads and plays/ seeks in the user's browser.
