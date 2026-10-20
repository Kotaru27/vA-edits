# Video Compressor v5 — release check (2026-10-20)

## Changes

- Removed the tall introductory headline and supporting marketing copy to bring the upload and queue into the first screen.
- Removed the combined Quality outlook banner in the queue header.
- Added a file-specific outlook beneath each queued video's name, with risk severity and recalculation on size or metadata updates.
- Kept existing size controls (8 MB default, wheel blocking), per-row green progress, MP4 compression, worker loader, download names, ZIP exports and optional preview intact.

## Checks executed in this cloud workspace

- Node regression tests: 36 assertions/test cases via `node --experimental-vm-modules --test tests/*.test.mjs`, including new quality/header contracts.
- Chromium visual and simulated-batch tests: 2560×1440, 1440×900, 1080×900 and 390×844; tested controls above the fold, number wheel guard, arrow keys, progress fill, two-video completion, preserved filenames and ZIP download.
- Independent Chromium quality-forecast tests at the same four widths: one sample shows detail-softening risk, a second displays severe quality loss; the rows show their own warnings, target edits recalculate their messages, no global combined banner, no horizontal page overflow or JavaScript exceptions.
- Screenshots: `tests/v5-quality-1440.png`, `tests/v5-1440.png` are **local QA assets only**.

## Not yet verified

- Live ffmpeg.wasm encoding, visual fidelity or smooth playback of real client footage in the deployed GitHub Pages browser. Browser encoding tests used a simulated encoder; the underlying codec logic is unchanged.
- How the actual user's browser reports duration and FPS for all MP4 variants. A pending estimate is shown when metadata is not yet available, and updated after FFmpeg probing.

**Release status: Conditional** until live browser checks are completed.
