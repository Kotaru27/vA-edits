# Video Compressor — browser edition v6

Private video compression directly in the browser, hosted as a static site on GitHub Pages.

## Workflow

1. Select one or multiple video files (up to **12**, maximum **450 MB each** on capable devices (lower limit on devices reporting 2–4 GB RAM), **900 MB total**).
2. Enter a target **in decimal MB per video**. The same target applies to every selected file.
3. Click **Compress videos**. Videos are processed sequentially with one FFmpeg WebAssembly worker to reduce memory spikes.
4. Download each finished MP4 with the same filename as its original MP4. Other source containers are exported with an `.mp4` extension and the same base name, since the encoded container is MP4.
5. When two or more files are completed, choose **Download all as ZIP** (maximum 300 MB combined compressed size), or download files individually if the ZIP is too large.
6. Click **Preview** on an individual item to open the video dialog. No preview player is shown or autoplayed by default.

## Performance

The v1 mandatory two-pass H.264 `medium` encode, full decode and playback verification has been replaced with **single-pass `veryfast` H.264 plus AAC/copy-audio** and MP4 box validation plus FFmpeg media-stream and short-sample decoding checks. It automatically retries once with a reduced bitrate only if the requested target is exceeded. Result size can sometimes exceed the target after both attempts, in which case the UI shows a warning. Higher speed and less size-accuracy/quality efficiency are an intentional tradeoff.

- Source resolution and frame cadence are preserved by avoiding forced resize or frame-rate filters. Uncommon input streams can behave differently.
- Every detected audio stream is preserved in the MP4 when its codec is supported; compatible AAC tracks are all copied if the bitrate budget allows it, otherwise every audio track is re-encoded as AAC. Targets too small to budget for every audio stream are refused. Additional non-video/audio streams (subtitles and chapters) are not preserved.
- Browser FFmpeg WebAssembly is substantially slower than native desktop FFmpeg. A single-thread core is used for compatibility with unmodified GitHub Pages. Multithreaded cores need cross-origin isolation headers, unavailable in standard GitHub Pages settings.
- First processing requires internet connectivity to download pinned FFmpeg wrapper/core. Video data remains in the local browser (not uploaded).
- Full-length output decoding remains intentionally omitted to reduce processing time. The tool checks MP4 top-level boxes, probes actual H.264/AAC stream counts, confirms all input audio streams are present, and decodes short video/audio samples near the beginning and end. This does not catch corruption in the middle of long recordings. Automated browser playback is not required for the file to be retained: a 15-second video loading timeout previously discarded successful encodes when browser decoding was slow or busy. A structurally valid MP4 still does not guarantee flawless playback or identical visual quality. Use the optional Preview button to test picture, audio and seeking before sharing important content. Preview playback errors are shown inside the dialog; the generated file is not automatically discarded.
- Original files are never overwritten by the application. Browsers may append download suffixes if an existing file with the same name is present.

## Deployment

Serve `index.html`, `app.mjs`, `codec.mjs`, `zip.mjs`, `styles.css`, `video-worker.js`, and `.nojekyll` together from the root of an HTTPS static site. The HTML uses versioned JS/CSS URLs for safe cache invalidation. GitHub Pages branch `gh-pages` is used for the published site.

## Tests

`tests/codec.test.mjs`, `tests/mp4.test.mjs`, `tests/worker.test.mjs` and `tests/zip.test.mjs` cover planner, filenames, fast commands, worker contract and ZIP structure. See `QA.md` for evidence and important browser verification limits.

## Desktop workspace

The v3 layout uses the full available browser width rather than a centered 1300px container. Controls stay in a narrow left column; a five-column file queue fills the right with video, original size, compressed size, status and actions. Below 1380px the queue condenses; below 1060px the settings stack above it. The preview remains opt-in.

## v4 queue controls and visual progress

The per-video target defaults to **8 MB**. Target entry, Compress and Cancel are
in the queue header on desktop, making the primary operation accessible without
scrolling back to the upload panel. While the number field has focus, wheel/trackpad
events do not change its value; typing and native Up/Down arrows still work.

The active queue row fills from left to right with a green progress background,
driven by the percentages reported by the running encoder rather than a simulated
timer. Progress values may pause during engine loading, file I/O or heavy encoding;
the display never treats visual progress as proof of a completed or playable file.
On completion or cancellation the working-row fill disappears.

## v5 queue-first screen and per-file quality estimate

The large marketing introduction is removed so the upload field and video queue
appear immediately below the header, reducing initial scrolling. The previous
combined **Quality outlook** paragraph is gone. Each video displays its own
estimate directly below its name, including expected detail softening, likely
severe quality loss, targets at or above source size, or an indication that
metadata is not yet available. Estimations update as browser or FFmpeg
metadata becomes available and whenever the batch target is changed.
These are bitrate-based predictions, not a measured quality score or a playback guarantee.
The encoder, downloaded filenames, 8 MB default, and progress animation are unchanged.

## v6 stability hardening

- Editing the shared target does **not** erase completed downloads. The target recorded under each completed video refers to its last successful encode; quality estimates for completed results remain tied to that target. Use **Recompress** on an individual completed file to queue a replacement at the new size. Its prior download remains available until the new result passes validation; a failed or canceled replacement preserves the previous file.
- MP4 verification now validates actual encoded H.264 and AAC streams, the original audio-track count, and short decode samples near start/end. It does not verify every frame, preserve HDR characteristics, or guarantee smooth playback on every device. The browser Preview button remains optional. This verification adds some processing time.
- The maximum input size is lowered for browsers reporting 2 GB RAM or less (120 MB) or 4 GB or less (240 MB), and is capped at 450 MB on higher-memory/unknown devices. This is a heuristic; low-memory crashes are still possible. The engine is reset after a file above 140 MB to release its WASM heap.
- A browser leave warning protects unfinished work and completed downloads from accidental navigation or refresh. Forced termination, browser crashes or declined dialogs cannot guarantee restoration. Output videos are only held in memory and are not automatically uploaded/persisted.
- Download filenames remain unchanged when safe and below 230 UTF-8 bytes. Exceptionally long names are truncated with a stable hash to avoid collisions; non-MP4 source extensions become `.mp4`. ZIP names still deduplicate if necessary.
- Remote FFmpeg resources remain HTTPS and version-pinned; executable bytes are **not** SRI/hash-verified. Adding a strict CSP or self-hosted engine without a real hosted browser test could break the working worker, so that supply-chain risk remains open. Third-party CDN availability is required on the first load.
