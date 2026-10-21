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

export function parseAudioTracks(logText) {
  return logText.split('\n').filter(line => /Stream #\d+:\d+[^:\n]*: Audio:/.test(line)).map(line => {
    const codec = line.match(/Audio:\s*([a-z0-9_-]+)/i)?.[1]?.toLowerCase() || '';
    const rate = line.match(/(\d+(?:\.\d+)?)\s*kb\/s/);
    return {codec, kbps: rate ? Number(rate[1]) : 0};
  });
}

export function parseAudioInfo(logText) {
  return parseAudioTracks(logText)[0] || {codec:'', kbps:0};
}

export function parseOutputStreams(logText) {
  const lines = logText.split('\n');
  const video = lines.filter(line => /Stream #\d+:\d+[^:\n]*: Video:/.test(line));
  const audio = parseAudioTracks(logText);
  return {videoCount:video.length, videoCodec:video[0]?.match(/Video:\s*([a-z0-9_-]+)/i)?.[1]?.toLowerCase()||'', audioCount:audio.length, audioCodecs:audio.map(a=>a.codec)};
}

/** All source audio tracks are retained. Each AAC bitrate consumes part of the size budget. */
export function makePlan({duration, targetMB, originalBytes, width=0, height=0, fps=0, audioPresent=true, sourceAudio=null, audioTracks=null}) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not determine the video duration.');
  if (!Number.isFinite(targetMB) || targetMB < 0.1 || targetMB > MAX_TARGET_MB) throw new Error('Enter a target between 0.1 and 1024 MB.');
  const targetBytes=Math.floor(targetMB*MB);
  if (Number.isFinite(originalBytes) && targetBytes >= originalBytes) throw new Error('The target must be smaller than the original file.');
  const totalBps=Math.floor(targetBytes*8/duration);
  const tracks=!audioPresent?[]:(Array.isArray(audioTracks)?audioTracks:(sourceAudio?[sourceAudio]:[{codec:'',kbps:0}]));
  const count=tracks.length;
  if (count>16) throw new Error('This video has too many audio tracks for reliable browser compression.');
  const idealAudioKbps=count===0?0:totalBps>=1800000?192:totalBps>=750000?160:totalBps>=390000?128:totalBps>=235000?96:64;
  const availableKbps=Math.floor(totalBps*0.955/1000)-70;
  if (count && availableKbps < count*48) throw new Error(`Target too small to retain all ${count} audio track(s) and usable video. Increase the target size.`);
  const encodeKbps=count?Math.min(idealAudioKbps,Math.floor(availableKbps/count)):0;
  const copyKbps=tracks.reduce((sum,a)=>sum+(Number.isFinite(a.kbps)?a.kbps:0),0);
  const copyAudio=!!count && tracks.every(a=>a.codec==='aac'&&Number.isFinite(a.kbps)&&a.kbps>0) && copyKbps <= encodeKbps*count;
  const audioTotalKbps=copyAudio?copyKbps:encodeKbps*count;
  const audioKbps=copyAudio?Math.ceil(copyKbps/count):encodeKbps;
  const videoKbps=Math.floor(totalBps*0.955/1000-audioTotalKbps);
  if (videoKbps<70) throw new Error('Target is too small for this video’s length and usable picture/audio quality. Increase the target size.');
  const bpp=width&&height?(videoKbps*1000)/(width*height*(fps||30)):null;
  const baseWarning=(bpp!==null&&bpp<0.04)||videoKbps<320?'This target is very aggressive; visible quality loss is likely.'
    :(bpp!==null&&bpp<0.07)?'Fine details may soften at this target size.':'Resolution and frame timing will be preserved.';
  const warning=count>1?`${baseWarning} All ${count} audio tracks will be retained.`:baseWarning;
  return {targetBytes,totalBps,audioKbps,audioTotalKbps,audioCount:count,copyAudio,videoKbps,bpp,warning};
}

/** Choose a quality-first strategy without claiming to detect motion from metadata alone. */
export function chooseEncodingStrategy(plan,{duration=0,sourceBytes=0,deviceMemory=0}={}) {
  const gb=Number(deviceMemory);
  const lowMemory=Number.isFinite(gb)&&gb>0&&gb<=4;
  const constrained=Number.isFinite(plan.bpp)?plan.bpp<0.075:plan.videoKbps<600;
  // Two-pass x264 improves bitrate allocation for demanding size targets, but
  // is expensive in browser WASM; fall back to a fast single pass on large/low-RAM files.
  const reasonable=duration>0&&duration<=120&&sourceBytes>0&&sourceBytes<=150*MB;
  if(constrained&&reasonable&&!lowMemory)return {twoPass:true,preset:'medium'};
  return {twoPass:false,preset:constrained?'fast':'veryfast'};
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
    args.push('-map','0:a?','-c:a',copyAudio ? 'copy' : 'aac');
    if (!copyAudio) args.push('-b:a',`${audioKbps}k`);
  }
  else args.push('-an');
  return [...args,'-movflags','+faststart','-avoid_negative_ts','make_zero',output];
}

/** Preserve the original downloadable filename for MP4 inputs. For other inputs,
 *  the extension must represent the actual MP4 container, not the source format. */
/** Validate the top-level MP4 box structure before exposing the result as a download.
 * A valid container is not proof that every frame can be decoded on every device.
 */
export function validateMp4(data) {
  if (!(data instanceof Uint8Array) || data.byteLength < 32) throw new Error('Encoder returned an incomplete MP4.');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 0, hasFtyp = false, hasMoov = false, hasMdat = false;
  while (pos < data.byteLength) {
    if (data.byteLength - pos < 8) throw new Error('MP4 contains a truncated box header.');
    let length = view.getUint32(pos, false);
    const type = String.fromCharCode(data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]);
    let header = 8;
    if (length === 1) {
      if (data.byteLength - pos < 16) throw new Error('MP4 extended box header is truncated.');
      length = view.getUint32(pos + 8, false) * 4294967296 + view.getUint32(pos + 12, false);
      header = 16;
    } else if (length === 0) length = data.byteLength - pos;
    if (!Number.isSafeInteger(length) || length < header || length > data.byteLength - pos) {
      throw new Error('MP4 container contains a damaged box.');
    }
    if (pos === 0 && type !== 'ftyp') throw new Error('Encoded output is not an MP4.');
    if (type === 'ftyp') hasFtyp = true;
    if (type === 'moov') hasMoov = true;
    if (type === 'mdat' && length > header) hasMdat = true;
    pos += length;
  }
  if (!hasFtyp || !hasMoov || !hasMdat) throw new Error('MP4 container is missing required video data or metadata.');
  return true;
}

function stableNameHash(value) {
  let hash=2166136261;
  for (const point of value) {const n=point.codePointAt(0);hash=Math.imul(hash^(n&65535),16777619);hash=Math.imul(hash^(n>>>16),16777619);}
  return (hash>>>0).toString(16).padStart(8,'0');
}
export function safeDownloadName(filename) {
  const original=String(filename??'').split(/[\\/]/).pop() || 'video.mp4';
  const cleaned=original.replace(/[\x00-\x1f<>:"|?*]/g,'_').trim().replace(/[. ]+$/g,'')||'video.mp4';
  const suffix=cleaned.match(/\.([a-z0-9]{2,8})$/i);
  const ext=suffix?.[1]?.toLowerCase()==='mp4'?suffix[0]:'.mp4';
  const stem=(suffix?cleaned.slice(0,-suffix[0].length):cleaned)||'video';
  const candidate=stem+ext;
  const bytes=new TextEncoder();
  if(bytes.encode(candidate).length<=230)return candidate;
  const hash='~'+stableNameHash(cleaned);
  let prefix='';
  for(const char of stem){if(bytes.encode(prefix+char+hash+ext).length>230)break;prefix+=char;}
  return (prefix||'video')+hash+ext;
}

/** Fast size-aware single-pass H.264 output; retry uses the same path with adjusted bitrate.
 *  Faster than mandatory two-pass, but size accuracy can be lower on unusual content. */
export function fastArgs({input, output = 'compressed.mp4', videoKbps, audioKbps, audioPresent = true, copyAudio = false, preset = 'veryfast'}) {
  if (!/^[A-Za-z0-9_.-]+$/.test(input) || !/^[A-Za-z0-9_.-]+$/.test(output)) throw new Error('Invalid internal filename.');
  if (!Number.isFinite(videoKbps) || videoKbps < 70 || videoKbps > 1000000) throw new Error('Invalid video bitrate.');
  if (!['veryfast','fast','medium'].includes(preset)) throw new Error('Invalid encoder preset.');
  const args = ['-hide_banner','-nostdin','-y','-i',input,
    '-map','0:v:0','-c:v','libx264','-preset',preset,
    '-b:v',`${Math.floor(videoKbps)}k`, '-maxrate',`${Math.ceil(videoKbps * 1.3)}k`,
    '-bufsize',`${Math.ceil(videoKbps * 2)}k`, '-pix_fmt','yuv420p', '-threads','1'];
  if (audioPresent) {
    args.push('-map','0:a?','-c:a',copyAudio ? 'copy' : 'aac');
    if (!copyAudio) args.push('-b:a',`${audioKbps}k`);
  } else args.push('-an');
  return [...args,'-movflags','+faststart','-avoid_negative_ts','make_zero',output];
}

export function shouldRetry(outputBytes, targetBytes, attemptsSoFar) {
  return attemptsSoFar < 2 && outputBytes > targetBytes;
}

export function retryBitrate(currentKbps, targetBytes, outputBytes) {
  return Math.max(70, Math.floor(currentKbps * (targetBytes / outputBytes) * 0.94));
}
