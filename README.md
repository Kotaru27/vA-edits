# Video Compressor — browser edition v5

Private video compression directly in the browser, hosted as a static site on GitHub Pages.

## Workflow

1. Select one or multiple video files (up to **12**, maximum **450 MB each**, **900 MB total**).
2. Enter a target **in decimal MB per video**. The same target applies to every selected file.
3. Click **Compress videos**. Videos are processed sequentially with one FFmpeg WebAssembly worker to reduce memory spikes.
4. Download each finished MP4 with the same filename as its original MP4. Other source containers are exported with an `.mp4` extension and the same base name, since the encoded container is MP4.
5. When two or more files are completed, choose **Download all as ZIP** (maximum 300 MB combined compressed size), or download files individually if the ZIP is too large.
6. Click **Preview** on an individual item to open the video dialog. No preview player is shown or autoplayed by default.

## Performance

The v1 mandatory two-pass H.264 `medium` encode, full decode and playback verification has been replaced with **single-pass `veryfast` H.264 plus AAC/copy-audio** and strict MP4 top-level box validation. It automatically retries once with a reduced bitrate only if the requested target is exceeded. Result size can sometimes exceed the target after both attempts, in which case the UI shows a warning. Higher speed and less size-accuracy/quality efficiency are an intentional tradeoff.

- Source resolution and frame cadence are preserved by avoiding forced resize or frame-rate filters. Uncommon input streams can behave differently.
- Compatible AAC audio is copied unchanged when the bitrate budget allows it, otherwise re-encoded.
- Browser FFmpeg WebAssembly is substantially slower than native desktop FFmpeg. A single-thread core is used for compatibility with unmodified GitHub Pages. Multithreaded cores need cross-origin isolation headers, unavailable in standard GitHub Pages settings.
- First processing requires internet connectivity to download pinned FFmpeg wrapper/core. Video data remains in the local browser (not uploaded).
- Full output decoding was deliberately removed to reduce processing time. The MP4 file structure is checked for complete top-level boxes including file type, movie metadata and media payload. Automated browser playback is not required for the file to be retained: a 15-second video loading timeout previously discarded successful encodes when browser decoding was slow or busy. A structurally valid MP4 still does not guarantee flawless playback or identical visual quality. Use the optional Preview button to test picture, audio and seeking before sharing important content. Preview playback errors are shown inside the dialog; the generated file is not automatically discarded.
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
