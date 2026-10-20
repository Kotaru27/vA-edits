/** Pure bitrate planning and FFmpeg argument construction; no DOM dependence. */
export const MB = 1000 * 1000;
export const MIB = 1024 * 1024;
export const MAX_INPUT_BYTES = 450 * MB;
export const MAX_TARGET_MB = 1024;

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B','KB','MB','GB'];
  let value = bytes, i = 0;
  while (value >= 1000 && i < units.length - 1) { value /= 1000; i++; }
  return `${value.toFixed(i === 0 ? 0 : value < 10 ? 2 : 1)} ${units[i]}`;
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Unknown';
  const x = Math.round(seconds);
  const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = x % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}

export function parseDuration(logText) {
  const match = logText.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return NaN;
  return Number(match[1])*3600 + Number(match[2])*60 + Number(match[3]);
}

export function parseVideoInfo(logText) {
  const line = logText.split('\n').find(s => /Stream #.*Video:/.test(s)) || '';
  const dims = line.match(/(?:^|\s)(\d{2,5})x(\d{2,5})(?:[\s,]|$)/);
  const fpsMatch = line.match(/(\d+(?:\.\d+)?)\s*fps/);
  return {width: dims ? Number(dims[1]) : 0, height: dims ? Number(dims[2]) : 0, fps: fpsMatch ? Number(fpsMatch[1]) : 0};
}

export function parseAudioInfo(logText) {
  const line = logText.split('\n').find(s => /Stream #.*Audio:/.test(s)) || '';
  const codec = line.match(/Audio:\s*([a-z0-9_-]+)/i)?.[1]?.toLowerCase() || '';
  const rate = line.match(/(\d+(?:\.\d+)?)\s*kb\/s/);
  return {codec, kbps: rate ? Number(rate[1]) : 0};
}

export function makePlan({duration, targetMB, originalBytes, width = 0, height = 0, fps = 0, audioPresent = true, sourceAudio = null}) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not determine the video duration.');
  if (!Number.isFinite(targetMB) || targetMB < 0.1 || targetMB > MAX_TARGET_MB) throw new Error('Enter a target between 0.1 and 1024 MB.');
  const targetBytes = Math.floor(targetMB * MB);
  if (Number.isFinite(originalBytes) && targetBytes >= originalBytes) {
    throw new Error('The target must be smaller than the original file.');
  }
  // Keep buffer for MP4 metadata, audio bit rate variance, and encoder/muxer overhead.
  const totalBps = Math.floor(targetBytes * 8 / duration);
  const audioKbps = !audioPresent ? 0 : totalBps >= 1800000 ? 192 : totalBps >= 750000 ? 160 : totalBps >= 390000 ? 128 : totalBps >= 235000 ? 96 : 64;
  const copyAudio = audioPresent && sourceAudio?.codec === 'aac' && Number.isFinite(sourceAudio.kbps)
    && sourceAudio.kbps > 0 && sourceAudio.kbps <= audioKbps;
  const budgetAudioKbps = copyAudio ? sourceAudio.kbps : audioKbps;
  const videoKbps = Math.floor((totalBps * 0.955 - budgetAudioKbps * 1000) / 1000);
  if (videoKbps < 70) throw new Error('Target is too small for this video’s length and usable picture/audio quality. Increase the target size.');
  const bpp = width && height ? (videoKbps * 1000)/(width * height * (fps || 30)) : null;
  const warning = (bpp !== null && bpp < 0.04) || videoKbps < 320
    ? 'This target is very aggressive; visible quality loss is likely.'
    : (bpp !== null && bpp < 0.07)
      ? 'Fine details may soften at this target size.'
      : 'Resolution and frame timing will be preserved.';
  return {targetBytes, totalBps, audioKbps:budgetAudioKbps, copyAudio, videoKbps, bpp, warning};
}

export function passArgs({input, output = 'compressed.mp4', videoKbps, audioKbps, pass, audioPresent = true, copyAudio = false}) {
  if (!/^[A-Za-z0-9_.-]+$/.test(input) || !/^[A-Za-z0-9_.-]+$/.test(output)) throw new Error('Invalid internal filename.');
  if (!Number.isFinite(videoKbps) || videoKbps < 70 || videoKbps > 1000000) throw new Error('Invalid video bitrate.');
  if (pass !== 1 && pass !== 2) throw new Error('Invalid pass.');
  const args = ['-hide_banner','-nostdin','-y','-i', input,
    '-map','0:v:0', '-c:v','libx264','-preset','medium',
    '-b:v',`${videoKbps}k`, '-pix_fmt','yuv420p', '-pass',String(pass),
    '-passlogfile','ratepass','-threads','1'];
  if (pass === 1) return [...args,'-an','-f','null','/dev/null'];
  if (audioPresent) {
    args.push('-map','0:a:0?','-c:a',copyAudio ? 'copy' : 'aac');
    if (!copyAudio) args.push('-b:a',`${audioKbps}k`);
  }
  else args.push('-an');
  return [...args,'-movflags','+faststart','-avoid_negative_ts','make_zero',output];
}

export function safeDownloadName(filename) {
  const stem = filename.replace(/\.[^/.]+$/, '').replace(/[\\/\0-\x1f<>:"|?*]+/g, '_').trim().slice(0,140) || 'video';
  return `${stem}-compressed.mp4`;
}

export function shouldRetry(outputBytes, targetBytes, attemptsSoFar) {
  return attemptsSoFar < 2 && outputBytes > targetBytes;
}

export function retryBitrate(currentKbps, targetBytes, outputBytes) {
  return Math.max(70, Math.floor(currentKbps * (targetBytes / outputBytes) * 0.94));
}
