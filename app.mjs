import {MB, MAX_INPUT_BYTES, formatBytes, formatTime, parseDuration, parseVideoInfo, makePlan, parseAudioInfo, passArgs, safeDownloadName, shouldRetry, retryBitrate} from './codec.mjs';

const WRAPPER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/umd';
const CORE_CDN = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
const $ = id => document.getElementById(id);
const els = {
  input: $('fileInput'), drop: $('dropzone'), uploadTitle: $('uploadTitle'),
  fileInfo: $('fileInfo'), fileName: $('fileName'), fileMeta: $('fileMeta'), clear: $('clearFile'),
  target: $('targetSize'), button: $('compressButton'), actionLabel: $('actionLabel'),
  insight: $('planInsight'), outlook: $('qualityOutlook'),
  error: $('errorBox'), progress: $('progressBlock'), status: $('statusText'),
  progressValue: $('progressValue'), progressFill: $('progressFill'), progressTrack: $('progressTrack'), cancel: $('cancelButton'),
  preview: $('previewVideo'), placeholder: $('stagePlaceholder'), stageMessage: $('stageMessage'),
  previewState: $('previewState'), tabs: $('previewTabs'), originalTab: $('originalTab'), outputTab: $('outputTab'),
  result: $('result'), origSize: $('originalSize'), compressedSize: $('compressedSize'), reduction: $('reduction'),
  resultNote: $('resultNote'), download: $('downloadLink'), previewHelp: $('previewHelp')
};
const state = { file: null, duration: NaN, width: 0, height: 0, fps: 0, audioPresent: true, sourceAudio: null,
  originalURL: '', outputURL: '', busy: false, generation: 0, ffmpeg: null, log: '', phase: null, pendingOperation: false };

function setError(message) { els.error.textContent = message; els.error.hidden = !message; }
function progress(value, text) {
  const safe = Math.min(100, Math.max(0, Math.round(value)));
  els.progress.hidden = false;
  els.status.textContent = text;
  els.progressValue.textContent = `${safe}%`;
  els.progressFill.style.width = `${safe}%`;
  els.progressTrack.setAttribute('aria-valuenow', String(safe));
}
function setBusy(busy) {
  state.busy = busy;
  els.target.disabled = busy;
  els.clear.disabled = busy;
  els.drop.setAttribute('aria-disabled', String(busy));
  els.button.disabled = busy || !state.file || !validTarget();
  els.actionLabel.textContent = busy ? 'Compressing…' : 'Compress video';
}
function validTarget() {
  const target = Number(els.target.value);
  return Number.isFinite(target) && target >= 0.1 && target <= 1024 && (!state.file || target * MB < state.file.size);
}
function resetOutput() {
  if (state.outputURL) URL.revokeObjectURL(state.outputURL);
  state.outputURL = '';
  els.result.hidden = true;
  els.download.removeAttribute('href');
  els.tabs.hidden = true;
  els.outputTab.classList.remove('active');
  els.outputTab.setAttribute('aria-pressed','false');
  els.originalTab.classList.add('active');
  els.originalTab.setAttribute('aria-pressed','true');
}
function clearSelected() {
  if (state.busy) return;
  resetOutput();
  if (state.originalURL) URL.revokeObjectURL(state.originalURL);
  state.originalURL = '';
  state.file = null; state.duration = NaN; state.width = 0; state.height = 0; state.fps = 0;
  els.input.value = '';
  els.fileInfo.hidden = true;
  els.uploadTitle.textContent = 'Drop a video here';
  els.preview.removeAttribute('src'); els.preview.load(); els.preview.hidden = true;
  els.placeholder.hidden = false; els.stageMessage.hidden = true;
  els.previewState.textContent = 'NO VIDEO SELECTED';
  els.previewHelp.textContent = 'Your video stays on your device. Nothing is uploaded.';
  els.insight.hidden = true; els.progress.hidden = true;
  setError(''); setBusy(false);
}
function setSource(url, label) {
  els.preview.pause();
  els.preview.src = url;
  els.preview.hidden = false;
  els.placeholder.hidden = true;
  els.stageMessage.hidden = true;
  els.previewState.textContent = label;
  els.preview.load();
}
function selectFile(file) {
  if (state.busy) return;
  clearSelected();
  if (!file) return;
  const supportedExtension = /\.(mp4|mov|m4v|webm|mkv|avi|ts|mts|mpeg|mpg|wmv|3gp)$/i.test(file.name);
  if (!file.type.startsWith('video/') && !supportedExtension) { setError('Select a video file (MP4, MOV, WebM, MKV, or AVI).'); return; }
  if (file.size <= 0) { setError('The selected video is empty.'); return; }
  if (file.size > MAX_INPUT_BYTES) { setError(`This browser version accepts up to ${formatBytes(MAX_INPUT_BYTES)} per file. Larger videos risk exhausting browser memory; they are not processed.`); return; }
  state.file = file;
  state.originalURL = URL.createObjectURL(file);
  els.fileName.textContent = file.name;
  els.fileMeta.textContent = `${formatBytes(file.size)} · Reading video details…`;
  els.fileInfo.hidden = false;
  els.uploadTitle.textContent = 'Choose a different video';
  els.previewHelp.textContent = 'Original preview. After compression, compare both versions here.';
  setSource(state.originalURL, 'ORIGINAL');
  const probe = document.createElement('video');
  probe.preload = 'metadata';
  probe.muted = true;
  probe.src = state.originalURL;
  const selected = file;
  probe.onloadedmetadata = () => {
    if (state.file !== selected) return;
    state.duration = probe.duration;
    state.width = probe.videoWidth;
    state.height = probe.videoHeight;
    updateFileInfo();
    updatePlan();
    probe.removeAttribute('src'); probe.load();
  };
  probe.onerror = () => {
    if (state.file !== selected) return;
    els.fileMeta.textContent = `${formatBytes(file.size)} · Browser preview may be unavailable`;
    els.preview.hidden = true;
    els.stageMessage.hidden = false;
    els.stageMessage.textContent = 'This source format cannot be previewed here. Compression may still work.';
    updatePlan();
  };
  setBusy(false); updatePlan();
}
function updateFileInfo() {
  if (!state.file) return;
  const resolution = state.width && state.height ? `${state.width} × ${state.height}` : 'Video';
  els.fileMeta.textContent = `${formatBytes(state.file.size)} · ${formatTime(state.duration)} · ${resolution}`;
}
function updatePlan() {
  setBusy(state.busy);
  els.insight.hidden = true;
  if (!state.file || !validTarget()) return;
  if (!Number.isFinite(state.duration)) {
    els.insight.hidden = false;
    els.outlook.textContent = 'Duration will be read during compression if the browser cannot preview this format.';
    return;
  }
  try {
    const p = makePlan({duration:state.duration,targetMB:Number(els.target.value),originalBytes:state.file.size,width:state.width,height:state.height,fps:state.fps});
    els.insight.hidden = false;
    els.outlook.textContent = p.warning;
  } catch (err) { els.insight.hidden = false; els.outlook.textContent = err.message; }
}

async function urlToBlobURL(url, mime) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed loading the video engine (${response.status}).`);
  const blob = await response.blob();
  return URL.createObjectURL(new Blob([blob], {type:mime}));
}
function loadScript(url) {
  return new Promise((resolve,reject) => {
    if (window.FFmpegWASM?.FFmpeg) return resolve();
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Unable to load the video engine. Check your network and browser restrictions.'));
    document.head.append(script);
  });
}
async function ensureEngine(token) {
  if (state.ffmpeg?.loaded) return state.ffmpeg;
  progress(1, 'Loading compression engine…');
  await loadScript(`${WRAPPER_CDN}/ffmpeg.min.js`);
  if (!window.FFmpegWASM?.FFmpeg) throw new Error('The compression engine library did not initialize.');
  const ffmpeg = new window.FFmpegWASM.FFmpeg();
  state.ffmpeg = ffmpeg;
  ffmpeg.on('log', ({message}) => { state.log = (state.log + message + '\n').slice(-48000); });
  ffmpeg.on('progress', ({progress:p, time}) => {
    if (token !== state.generation || !state.phase) return;
    const phase = state.phase;
    const fraction = Number.isFinite(time) && time > 0 && Number.isFinite(state.duration)
      ? time / 1e6 / state.duration : p;
    if (Number.isFinite(fraction) && fraction >= 0 && fraction <= 1.12) {
      progress(phase.from + Math.min(1, fraction) * (phase.to-phase.from), phase.label);
    }
  });
  let classWorkerURL, coreURL, wasmURL;
  try {
    [classWorkerURL,coreURL,wasmURL] = await Promise.all([
      urlToBlobURL(`${WRAPPER_CDN}/814.ffmpeg.min.js`,'text/javascript'),
      urlToBlobURL(`${CORE_CDN}/ffmpeg-core.js`,'text/javascript'),
      urlToBlobURL(`${CORE_CDN}/ffmpeg-core.wasm`,'application/wasm')
    ]);
    if (token !== state.generation) throw new Error('Operation canceled.');
    const loaded = await ffmpeg.load({classWorkerURL,coreURL,wasmURL});
    if (!ffmpeg.loaded && !loaded) throw new Error('Failed to initialize the video encoder.');
    return ffmpeg;
  } catch(err) { try { ffmpeg.terminate(); } catch {} state.ffmpeg = null; throw err; }
  // Blob URLs remain active for the life of this page because FFmpeg workers can reload core assets.
}
async function safeDelete(ffmpeg, file) { try { await ffmpeg.deleteFile(file); } catch {} }
function sourceVirtualName(file) {
  const ext = (file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'mp4').toLowerCase();
  return `input.${ext}`;
}
async function probeDetails(ffmpeg, input, token) {
  state.log = '';
  await ffmpeg.exec(['-hide_banner','-i',input]);
  if (token !== state.generation) throw new Error('Compression canceled.');
  const details = parseVideoInfo(state.log);
  if (!Number.isFinite(state.duration) || state.duration <= 0) state.duration = parseDuration(state.log);
  if (!state.width) state.width = details.width;
  if (!state.height) state.height = details.height;
  state.fps = details.fps;
  state.sourceAudio = parseAudioInfo(state.log);
  state.audioPresent = /Stream #.*Audio:/.test(state.log);
  if (!/Stream #.*Video:/.test(state.log)) throw new Error('This file does not contain a readable video stream.');
  if (!Number.isFinite(state.duration) || state.duration <= 0) throw new Error('Could not identify the duration of this video.');
  updateFileInfo();
}
async function executePass(ffmpeg, args, token, phase) {
  if (token !== state.generation) throw new Error('Compression canceled.');
  state.phase = phase;
  state.log = '';
  progress(phase.from, phase.label);
  const code = await ffmpeg.exec(args);
  state.phase = null;
  if (token !== state.generation) throw new Error('Compression canceled.');
  if (code !== 0) {
    const lines = state.log.split('\n').filter(Boolean);
    const hint = lines.filter(s => /error|invalid|unknown encoder|failed|out of memory/i.test(s)).slice(-3).join(' ');
    throw new Error(`Encoding failed during ${phase.label.toLowerCase()}.${hint ? ` ${hint.slice(0,350)}` : ' This file or codec may not be supported.'}`);
  }
  progress(phase.to, phase.label);
}
async function verifyOutput(ffmpeg, virtualOutput, bytes, token) {
  progress(93,'Checking video and audio streams…');
  // Full stream decode catches bitstream/container errors, not subjective visual quality.
  state.log = '';
  const code = await ffmpeg.exec(['-v','error','-xerror','-i',virtualOutput,'-map','0:v:0','-map','0:a:0?','-f','null','/dev/null']);
  if (token !== state.generation) throw new Error('Compression canceled.');
  if (code !== 0) throw new Error('The compressed file did not pass the full video/audio decode check.');
  if (bytes.length < 12 || String.fromCharCode(...bytes.slice(4,8)) !== 'ftyp') throw new Error('The encoded file is not a valid MP4 container.');
  progress(97,'Checking browser playback…');
}
async function checkBrowserPlayback(url) {
  // This proves decoding starts, not that every frame will play smoothly on every device.
  const test = document.createElement('video');
  test.muted = true; test.playsInline = true; test.preload = 'auto';
  return new Promise((resolve,reject) => {
    let finished = false;
    const finish = (err) => {
      if (finished) return;
      finished = true; clearTimeout(timeout);
      test.pause(); test.removeAttribute('src'); test.load();
      err ? reject(err) : resolve();
    };
    const timeout = setTimeout(() => finish(new Error('Browser playback could not be verified in time.')), 15000);
    test.onerror = () => finish(new Error('The browser could not decode the compressed MP4.'));
    test.onloadeddata = () => finish(null);
    test.src = url;
    test.load();
    if (test.readyState >= 2) finish(null);
  });
}
async function compress() {
  if (state.busy || !state.file) return;
  if (!validTarget()) { setError('Choose a target size smaller than the original video, between 0.1 and 1024 MB.'); return; }
  const token = ++state.generation;
  const file = state.file;
  const requestedMB = Number(els.target.value);
  const input = sourceVirtualName(file), output = 'compressed.mp4';
  resetOutput(); setError(''); setBusy(true); els.cancel.hidden = false; progress(0, 'Preparing video…');
  try {
    const ffmpeg = await ensureEngine(token);
    progress(7, 'Reading source video…');
    await ffmpeg.writeFile(input, new Uint8Array(await file.arrayBuffer()));
    if (token !== state.generation) throw new Error('Compression canceled.');
    progress(9,'Inspecting video streams…');
    await probeDetails(ffmpeg, input, token);
    const plan = makePlan({duration:state.duration,targetMB:requestedMB,originalBytes:file.size,width:state.width,height:state.height,fps:state.fps,audioPresent:state.audioPresent,sourceAudio:state.sourceAudio});
    updatePlan();
    let videoKbps = plan.videoKbps, outputBytes;
    let data;
    for (let attempt = 1; attempt <= 2; attempt++) {
      await safeDelete(ffmpeg,output);
      await safeDelete(ffmpeg,'ratepass-0.log');
      await safeDelete(ffmpeg,'ratepass-0.log.mbtree');
      const first = attempt === 1 ? {from:12,to:46,label:'Analyzing video (pass 1 of 2)…'} : {from:69,to:79,label:'Refining target size (analysis)…'};
      const second = attempt === 1 ? {from:46,to:90,label:'Encoding compressed MP4 (pass 2 of 2)…'} : {from:79,to:92,label:'Refining target size (encoding)…'};
      await executePass(ffmpeg,passArgs({input,output,videoKbps,audioKbps:plan.audioKbps,pass:1,audioPresent:state.audioPresent,copyAudio:plan.copyAudio}),token,first);
      await executePass(ffmpeg,passArgs({input,output,videoKbps,audioKbps:plan.audioKbps,pass:2,audioPresent:state.audioPresent,copyAudio:plan.copyAudio}),token,second);
      data = await ffmpeg.readFile(output);
      if (!(data instanceof Uint8Array) || !data.length) throw new Error('The encoder produced an empty file.');
      outputBytes = data.length;
      if (!shouldRetry(outputBytes,plan.targetBytes,attempt)) break;
      videoKbps = retryBitrate(videoKbps,plan.targetBytes,outputBytes);
      if (videoKbps <= 70) break;
      progress(69,'Fine-tuning output size…');
    }
    if (!data) throw new Error('No compressed output was produced.');
    await verifyOutput(ffmpeg,output,data,token);
    const mp4 = new Blob([data],{type:'video/mp4'});
    const url = URL.createObjectURL(mp4);
    try { await checkBrowserPlayback(url); }
    catch (err) { URL.revokeObjectURL(url); throw err; }
    if (token !== state.generation) { URL.revokeObjectURL(url); return; }
    state.outputURL = url;
    els.download.href = url;
    els.download.download = safeDownloadName(file.name);
    els.origSize.textContent = formatBytes(file.size);
    els.compressedSize.textContent = formatBytes(outputBytes);
    els.reduction.textContent = `${Math.max(0, Math.round((1-outputBytes/file.size)*100))}%`;
    els.resultNote.textContent = outputBytes > plan.targetBytes
      ? 'The output is slightly above your target. The browser encoder could not reach the size in two attempts.'
      : 'MP4 structure, full stream decoding and browser startup playback checked. Compare quality before sharing.';
    els.result.hidden = false;
    els.tabs.hidden = false;
    showPreview('output');
    progress(100,'Compression complete');
    els.cancel.hidden = true;
    els.previewHelp.textContent = 'Check the picture and sound in the compressed preview before downloading.';
  } catch(err) {
    if (token === state.generation) setError(err instanceof Error ? err.message : String(err));
  } finally {
    if (token === state.generation) {
      state.phase = null;
      els.progress.hidden = !state.outputURL;
      els.cancel.hidden = true;
      // Keep controls locked during cleanup so a second run cannot lose its input/output files.
      if (state.ffmpeg?.loaded) {
        for (const f of [input,output,'ratepass-0.log','ratepass-0.log.mbtree']) await safeDelete(state.ffmpeg,f);
      }
      setBusy(false);
    }
  }
}
function showPreview(mode) {
  if (!state.file) return;
  const output = mode === 'output' && state.outputURL;
  setSource(output ? state.outputURL : state.originalURL, output ? 'COMPRESSED · MP4' : 'ORIGINAL');
  els.originalTab.classList.toggle('active',!output);
  els.outputTab.classList.toggle('active',!!output);
  els.originalTab.setAttribute('aria-pressed',String(!output));
  els.outputTab.setAttribute('aria-pressed',String(!!output));
}
function cancel() {
  if (!state.busy) return;
  ++state.generation;
  state.phase = null;
  if (state.ffmpeg) { try { state.ffmpeg.terminate(); } catch {} state.ffmpeg = null; }
  setBusy(false); els.progress.hidden = true;
  setError('Compression canceled. Your original video is unchanged.');
}

els.drop.addEventListener('click', () => { if (!state.busy) els.input.click(); });
els.drop.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !state.busy) { e.preventDefault(); els.input.click(); } });
els.input.addEventListener('change', () => selectFile(els.input.files?.[0]));
els.clear.addEventListener('click', clearSelected);
els.target.addEventListener('input',() => { if (!state.busy) { resetOutput(); updatePlan(); setError(''); if (state.originalURL) showPreview('original'); } });
els.button.addEventListener('click', compress);
els.cancel.addEventListener('click',cancel);
els.originalTab.addEventListener('click',()=>showPreview('original'));
els.outputTab.addEventListener('click',()=>showPreview('output'));
['dragenter','dragover'].forEach(type => els.drop.addEventListener(type,e => { e.preventDefault(); if (!state.busy) els.drop.classList.add('drag-over'); }));
['dragleave','drop'].forEach(type => els.drop.addEventListener(type,e => { e.preventDefault(); els.drop.classList.remove('drag-over'); }));
els.drop.addEventListener('drop',e => { if (!state.busy) selectFile(e.dataTransfer?.files?.[0]); });
window.addEventListener('dragover',e=>e.preventDefault());
window.addEventListener('drop',e=>e.preventDefault());
window.addEventListener('beforeunload',() => { if (state.originalURL) URL.revokeObjectURL(state.originalURL); if (state.outputURL) URL.revokeObjectURL(state.outputURL); });
clearSelected();
