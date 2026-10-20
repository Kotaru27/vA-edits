# Video Compressor — browser edition v2

Private video compression directly in the browser, hosted as a static site on GitHub Pages.

## Workflow

1. Select one or multiple video files (up to **12**, maximum **450 MB each**, **900 MB total**).
2. Enter a target **in decimal MB per video**. The same target applies to every selected file.
3. Click **Compress videos**. Videos are processed sequentially with one FFmpeg WebAssembly worker to reduce memory spikes.
4. Download each finished MP4 with the same filename as its original MP4. Other source containers are exported with an `.mp4` extension and the same base name, since the encoded container is MP4.
5. When two or more files are completed, choose **Download all as ZIP** (maximum 300 MB combined compressed size), or download files individually if the ZIP is too large.
6. Click **Preview** on an individual item to open the video dialog. No preview player is shown or autoplayed by default.

## Performance

The v1 mandatory two-pass H.264 `medium` encode, full decode and playback verification has been replaced with **single-pass `veryfast` H.264 plus AAC/copy-audio** and an output MP4/browser-startup playback check. It automatically retries once with a reduced bitrate only if the requested target is exceeded. Result size can sometimes exceed the target after both attempts, in which case the UI shows a warning. Higher speed and less size-accuracy/quality efficiency are an intentional tradeoff.

- Source resolution and frame cadence are preserved by avoiding forced resize or frame-rate filters. Uncommon input streams can behave differently.
- Compatible AAC audio is copied unchanged when the bitrate budget allows it, otherwise re-encoded.
- Browser FFmpeg WebAssembly is substantially slower than native desktop FFmpeg. A single-thread core is used for compatibility with unmodified GitHub Pages. Multithreaded cores need cross-origin isolation headers, unavailable in standard GitHub Pages settings.
- First processing requires internet connectivity to download pinned FFmpeg wrapper/core. Video data remains in the local browser (not uploaded).
- Full output decoding was deliberately removed to reduce processing time. Container signature and browser decoding startup are checked, but this cannot guarantee flawless full-length playback or identical visual quality. Use the optional preview before sharing important content.
- Original files are never overwritten by the application. Browsers may append download suffixes if an existing file with the same name is present.

## Deployment

Serve `index.html`, `app.mjs`, `codec.mjs`, `zip.mjs`, `styles.css`, `video-worker.js`, and `.nojekyll` together from the root of an HTTPS static site. The HTML uses versioned JS/CSS URLs for safe cache invalidation. GitHub Pages branch `gh-pages` is used for the published site.

## Tests

`tests/codec.test.mjs`, `tests/worker.test.mjs` and `tests/zip.test.mjs` cover planner, filenames, fast commands, worker contract and ZIP structure. See `QA.md` for evidence and important browser verification limits.
