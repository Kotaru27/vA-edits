# Video Compressor — browser edition

Upload a file, select a target size in decimal MB (1 MB = 1,000,000 bytes), encode to H.264/AAC MP4 with a two-pass bitrate budget, verify the output, and download it. All file contents remain on the user's device. The browser contacts CDN providers only to load FFmpeg code; the selected video is never sent to a server.

## Publish

Upload the contents of this folder to any static HTTPS host such as GitHub Pages. Serve `index.html` at the site root. No build step, Node, native software, account, API key or backend is needed by the end user. The first use requires Internet access to retrieve the pinned FFmpeg engine from cdnjs and jsDelivr; network policies that block those CDNs prevent transcoding. The `video-worker.js` loader is hosted alongside `app.mjs` on the same origin (including the repository subpath on GitHub Pages); its native classic-worker/ESM import avoids the upstream bundled worker `blob:` module resolution error. Do not remove `video-worker.js` from deployment.

**Do not open via `file://`**: browsers restrict workers on local file origins. Publish on HTTPS.

## Limits

- Strict per-file input limit: **450 MB** (browser WASM memory); practical constraints vary by browser and RAM.
- The app enforces target size lower than input and refuses targets below a minimal video bitrate. Lower targets can visibly damage fine detail; there is no guarantee of lossless quality at an arbitrary size.
- Duration is read via browser metadata or FFmpeg probe.
- The original resolution and source cadence are preserved by omitting resize/FPS filters, unless the encoder itself cannot represent an unusual source format.
- The first video stream and first audio stream are encoded; additional tracks/subtitles/chapters are not carried over.
- Two-pass H.264 with AAC protects compatibility. Compatible source AAC audio is stream-copied when its bitrate fits the size budget. Other audio is re-encoded to AAC.
- Most outputs aim under the target with a 4.5% muxing reserve; if oversize, a second two-pass attempt is made. Some inputs can still exceed the target, and the UI declares that.
- Output verification checks full stream decodability in FFmpeg and browser playback startup, **not guaranteed smooth playback of every frame on every device**, and not objective image fidelity.
- Multiple-pass software encoding in a WebAssembly worker can take considerable time. Cancellation terminates and resets the FFmpeg worker.
- Core files are from `@ffmpeg/core@0.12.10` and wrapper from `@ffmpeg/ffmpeg@0.12.15`. See upstream licenses at https://github.com/ffmpegwasm/ffmpeg.wasm . The wrapper is MIT; the core includes FFmpeg and other codec licenses and may be GPL-covered.

## Test coverage

Developer unit tests and source examples are included under `tests/`. End users do not need to run commands or install anything.

Browser tests must run in a served HTTPS or localhost origin with engine CDN access. Native FFmpeg can validate command construction and compressed-file behavior, but is not proof that WebAssembly FFmpeg is working in a deployed browser.

## Worker-loader fix (2026-10-20)

- Hosted `video-worker.js` replaces the Webpack-generated `814.ffmpeg` class worker. It speaks FFmpeg.wasm's v0.12 message protocol and supports the main workflow's file, encode and event operations.
- UMD core is loaded with native `importScripts` in classic workers; ESM core uses native dynamic import in module workers. Pinned FFmpeg.wasm versions are unchanged.
- New unit tests mock both worker execution paths; this **is not** a verified end-to-end WASM encode on GitHub Pages.
- `app.mjs?v=2` in `index.html` prompts browsers to fetch the updated loader instead of reusing a cached script.
- To test the deployment, compress a real sample in a modern browser, play the output with audio, download it and confirm file size and full playback.
