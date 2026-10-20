import { MB, MAX_INPUT_BYTES, MAX_TARGET_MB, formatBytes, formatTime, parseDuration, parseVideoInfo, makePlan, parseAudioInfo, fastArgs, safeDownloadName, shouldRetry, retryBitrate, validateMp4 } from './codec.mjs';
import { makeZip, MAX_BATCH_ZIP_BYTES } from './zip.mjs';

const WRAPPER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/ffmpeg/0.12.15/umd';
const CORE_CDN = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
const CORE_ESM_CDN = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
const CLASS_WORKER_URL = new URL('./video-worker.js', import.meta.url).href;
const MAX_FILES = 12;
const MAX_BATCH_BYTES = 900 * MB;
const $ = id => document.getElementById(id);
const els = {
  input:$('fileInput'), drop:$('dropzone'), target:$('targetSize'), button:$('compressButton'),
  actionLabel:$('actionLabel'), error:$('errorBox'), insight:$('planInsight'), outlook:$('qualityOutlook'),
  progress:$('progressBlock'), progressFill:$('progressFill'), progressValue:$('progressValue'),
  progressTrack:$('progressTrack'), status:$('statusText'), cancel:$('cancelButton'),
  list:$('batchList'), empty:$('emptyState'), count:$('batchCount'), footer:$('batchFooter'),
  summary:$('batchSummary'), downloadAll:$('downloadAll'),
  dialog:$('previewDialog'), video:$('previewVideo'), dialogTitle:$('dialogTitle'),
  originalTab:$('originalTab'), outputTab:$('outputTab'), previewHelp:$('previewHelp'), close:$('closePreview')
};
const state = {
  items:[], nextId:1, busy:false, cancelRequested:false, token:0, ffmpeg:null,
  engineURLs:[], phase:null, active:null, log:'', previewItem:null, previewSourceURL:'',
  zipBusy:false, progressValue:-1
};

function setError(message) { els.error.textContent=message; els.error.hidden=!message; }
function targetMB() { return Number(els.target.value); }
function validTarget() { return els.target.value.trim() !== '' && Number.isFinite(targetMB()) && targetMB() >= 0.1 && targetMB() <= MAX_TARGET_MB; }
function candidates() { return state.items.filter(item => item.status !== 'done'); }
function updateControls() {
  els.target.disabled=state.busy || state.zipBusy;
  els.input.disabled=state.busy || state.zipBusy;
  els.drop.setAttribute('aria-disabled',String(state.busy || state.zipBusy));
  els.button.disabled=state.busy || state.zipBusy || !state.items.length || !validTarget() || !candidates().length;
  els.actionLabel.textContent=state.busy ? 'Compressing…' : `Compress ${candidates().length === 1 ? 'video' : 'videos'}`;
  els.cancel.hidden=!state.busy;
  els.count.textContent=`${state.items.length} selected`;
}
function activeProgress(percent, label) {
  const p=Math.min(100,Math.max(0,Math.round(percent)));
  els.progress.hidden=false;
  els.progressValue.textContent=`${p}%`;
  els.progressFill.style.width=`${p}%`;
  els.progressTrack.setAttribute('aria-valuenow',String(p));
  els.status.textContent=label;
  if (state.active && p !== state.progressValue && (p%3===0 || p===100)) {
    state.active.percent=p;
    const value=$(`row-progress-${state.active.id}`);
    if (value) value.textContent=`${p}%`;
  }
  state.progressValue=p;
}
function releaseOutput(item) {
  if (item.outputURL) URL.revokeObjectURL(item.outputURL);
  item.outputURL=''; item.outputBlob=null; item.resultBytes=0; item.note=''; item.percent=0;
  if (item.status==='done') item.status='queued';
}
function releaseEngineURLs() { for(const u of state.engineURLs) URL.revokeObjectURL(u); state.engineURLs=[]; }
function terminateEngine() { if(state.ffmpeg) { try{state.ffmpeg.terminate();}catch{} state.ffmpeg=null; } releaseEngineURLs(); }

function renderQueue() {
  els.list.replaceChildren();
  const frag=document.createDocumentFragment();
  let completed=0;
  for(let i=0;i<state.items.length;i++) {
    const item=state.items[i]; if(item.status==='done') completed++;
    const row=document.createElement('article'); row.className=`batch-item ${item.status==='working'?'is-working':''}`;
    const file=document.createElement('div'); file.className='item-file';
    const num=document.createElement('div'); num.className='item-number'; num.textContent=String(i+1).padStart(2,'0');
    const copy=document.createElement('div'); copy.className='item-copy';
    const name=document.createElement('div'); name.className='item-name'; name.textContent=item.file.name;name.title=item.file.name;
    const meta=document.createElement('div'); meta.className='item-meta';
    const info=[];
    if(Number.isFinite(item.duration) && item.duration>0) info.push(formatTime(item.duration));
    if(item.status==='done') info.push(`${Math.max(0,Math.round((1-item.resultBytes/item.file.size)*100))}% smaller`);
    meta.textContent=info.join(' · ')||'Video file';
    const mobileSize=document.createElement('span');mobileSize.className='mobile-sizes';
    mobileSize.textContent=` · ${formatBytes(item.file.size)}${item.status==='done'?` → ${formatBytes(item.resultBytes)}`:''}`;
    meta.append(mobileSize);
    copy.append(name,meta);file.append(num,copy);
    const inputBytes=document.createElement('div');inputBytes.className='item-size source-size';inputBytes.textContent=formatBytes(item.file.size);
    const outputBytes=document.createElement('div');outputBytes.className='item-size result-size';
    outputBytes.textContent=item.status==='done'?formatBytes(item.resultBytes):'—';
    const status=document.createElement('span'); status.className='item-status';
    const labels={queued:'Queued',working:'Compressing',done:'Completed',failed:'Failed',canceled:'Canceled'};
    status.textContent=item.status==='working' ? `${item.percent||0}%` : labels[item.status];
    if(item.status==='working'){status.id=`row-progress-${item.id}`;status.classList.add('active');}
    if(item.status==='done') status.classList.add('ok');
    if(item.status==='failed') status.classList.add('error');
    const actions=document.createElement('div');actions.className='item-actions';
    const preview=document.createElement('button');preview.type='button';preview.textContent='Preview';
    preview.disabled=state.busy || state.zipBusy;preview.addEventListener('click',()=>openPreview(item.id));actions.append(preview);
    if(item.status==='done' && item.outputURL){
      const a=document.createElement('a');a.href=item.outputURL;a.download=safeDownloadName(item.file.name);
      a.textContent='Download ↓';a.className='download-one';actions.append(a);
    }
    const remove=document.createElement('button');remove.type='button';remove.className='remove-item';
    remove.textContent='Remove';remove.disabled=state.busy || state.zipBusy;
    remove.addEventListener('click',()=>removeItem(item.id));actions.append(remove);
    row.append(file,inputBytes,outputBytes,status,actions);
    if(item.note){const note=document.createElement('p');note.className=`item-note ${item.status==='failed'?'error':''}`;note.textContent=item.note;row.append(note);}
    frag.append(row);
  }
  els.list.append(frag);
  els.empty.hidden=state.items.length>0;
  els.footer.hidden=state.items.length===0;
  els.summary.textContent=`${completed} of ${state.items.length} completed`;
  els.downloadAll.hidden=completed<2;
  const total=state.items.filter(item=>item.status==='done').reduce((sum,item)=>sum+item.resultBytes,0);
  els.downloadAll.disabled=state.busy||state.zipBusy||total>MAX_BATCH_ZIP_BYTES;
  els.downloadAll.title=total>MAX_BATCH_ZIP_BYTES?'Batch ZIP exceeds 300 MB. Download individual videos.':'';
  if(total>MAX_BATCH_ZIP_BYTES && completed>1) els.summary.textContent+=' · ZIP too large; download individually';
  updateControls();
}
function releaseAll() { for(const item of state.items) releaseOutput(item); }
function removeItem(id) {
  if(state.busy || state.zipBusy) return;
  const index=state.items.findIndex(item=>item.id===id); if(index<0)return;
  if(state.previewItem?.id===id) els.dialog.close();
  releaseOutput(state.items[index]);state.items.splice(index,1);setError('');renderQueue();updateOutlook();
}
function addFiles(files) {
  if(state.busy || state.zipBusy) return;
  setError('');const errors=[];
  const seen=new Set(state.items.map(item=>`${item.file.name}|${item.file.size}|${item.file.lastModified}`));
  let sum=state.items.reduce((n,item)=>n+item.file.size,0);
  for(const file of files) {
    if(state.items.length>=MAX_FILES){errors.push(`Limit: ${MAX_FILES} videos per batch.`);break;}
    const ext=/\.(mp4|mov|m4v|webm|mkv|avi|ts|mts|mpeg|mpg|wmv|3gp)$/i.test(file.name);
    if(!file.type.startsWith('video/')&&!ext){errors.push(`${file.name}: not a recognized video.`);continue;}
    if(!file.size || file.size>MAX_INPUT_BYTES){errors.push(`${file.name}: file must be between 1 byte and ${formatBytes(MAX_INPUT_BYTES)}.`);continue;}
    if(sum+file.size>MAX_BATCH_BYTES){errors.push(`Batch limit: ${formatBytes(MAX_BATCH_BYTES)} total. Remove some videos.`);break;}
    const key=`${file.name}|${file.size}|${file.lastModified}`;
    if(seen.has(key))continue;
    seen.add(key);sum+=file.size;
    const item={id:state.nextId++,file,status:'queued',duration:NaN,width:0,height:0,fps:0,
      audioPresent:false,sourceAudio:null,outputURL:'',outputBlob:null,resultBytes:0,note:'',percent:0};
    state.items.push(item);probeBrowserMetadata(item);
  }
  renderQueue();updateOutlook();
  if(errors.length) setError(errors.slice(0,4).join('\n'));
}
function probeBrowserMetadata(item) {
  const url=URL.createObjectURL(item.file);const video=document.createElement('video');video.preload='metadata';
  let ended=false;
  const finish=()=>{if(ended)return;ended=true;clearTimeout(timer);video.removeAttribute('src');video.load();URL.revokeObjectURL(url);};
  const timer=setTimeout(finish,12000);
  video.onloadedmetadata=()=>{
    item.duration=video.duration;item.width=video.videoWidth;item.height=video.videoHeight;
    finish();if(state.items.includes(item)){renderQueue();updateOutlook();}
  };
  video.onerror=finish;video.src=url;
}
function updateOutlook() {
  els.insight.hidden=true;if(!state.items.length||!validTarget()) return;
  const warnings=[];
  for(const item of state.items) {
    if(item.file.size<=targetMB()*MB) {warnings.push(`${item.file.name}: target must be smaller than original.`);continue;}
    if(Number.isFinite(item.duration)&&item.duration>0){
      try{const p=makePlan({duration:item.duration,targetMB:targetMB(),originalBytes:item.file.size,width:item.width,height:item.height,fps:item.fps});
        if(/loss|soften/i.test(p.warning))warnings.push(`${item.file.name}: ${p.warning}`);
      }catch(e){warnings.push(`${item.file.name}: ${e.message}`);}
    }
  }
  if(warnings.length){els.insight.hidden=false;els.outlook.textContent=warnings.slice(0,2).join(' ')+(warnings.length>2?' More videos may need a higher target.':'');}
}
async function urlToBlobURL(url,mime){const res=await fetch(url);if(!res.ok)throw new Error(`Unable to fetch encoder (${res.status}).`);return URL.createObjectURL(new Blob([await res.blob()],{type:mime}));}
function loadScript(url){return new Promise((resolve,reject)=>{if(window.FFmpegWASM?.FFmpeg)return resolve();const script=document.createElement('script');script.src=url;script.onload=resolve;script.onerror=()=>reject(new Error('Unable to load video engine. Check CDN/network access.'));document.head.append(script);});}
async function ensureEngine(token){
  if(state.ffmpeg?.loaded)return state.ffmpeg;
  await loadScript(`${WRAPPER_CDN}/ffmpeg.min.js`);
  if(token!==state.token)throw new Error('Canceled.');
  if(!window.FFmpegWASM?.FFmpeg)throw new Error('Video engine wrapper did not initialize.');
  const ffmpeg=new window.FFmpegWASM.FFmpeg();state.ffmpeg=ffmpeg;
  ffmpeg.on('log',({message})=>{state.log=(state.log+message+'\n').slice(-50000);});
  ffmpeg.on('progress',({progress:ratio,time})=>{
    if(token!==state.token||!state.phase)return;
    const p=state.phase;
    const fraction=Number.isFinite(time)&&time>0&&state.active&&Number.isFinite(state.active.duration)
      ?time/1e6/state.active.duration:ratio;
    if(Number.isFinite(fraction)&&fraction>=0&&fraction<=1.12)activeProgress(p.from+Math.min(1,fraction)*(p.to-p.from),p.label);
  });
  let timer;
  try{
    state.engineURLs=await Promise.all([
      urlToBlobURL(`${CORE_CDN}/ffmpeg-core.js`,'text/javascript'),
      urlToBlobURL(`${CORE_ESM_CDN}/ffmpeg-core.js`,'text/javascript'),
      urlToBlobURL(`${CORE_CDN}/ffmpeg-core.wasm`,'application/wasm')]);
    if(token!==state.token)throw new Error('Canceled.');
    const [coreURL,moduleCoreURL,wasmURL]=state.engineURLs;
    await Promise.race([ffmpeg.load({classWorkerURL: CLASS_WORKER_URL,coreURL,moduleCoreURL,wasmURL}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Video engine startup timed out (90 seconds).')),90000);})]);
    if(!ffmpeg.loaded)throw new Error('Video engine did not initialize.');
    return ffmpeg;
  }catch(e){terminateEngine();throw e;}finally{clearTimeout(timer);}
}
async function safeDelete(ffmpeg,name){try{await ffmpeg.deleteFile(name);}catch{}}
function virtualName(item){const ext=item.file.name.match(/\.([a-z0-9]{2,6})$/i)?.[1]?.toLowerCase()||'mp4';return `input.${ext}`;}
async function probeDetails(ffmpeg,input,item,token){
  state.log='';await ffmpeg.exec(['-hide_banner','-i',input]);if(token!==state.token)throw new Error('Canceled.');
  const meta=parseVideoInfo(state.log);
  if(!Number.isFinite(item.duration)||item.duration<=0)item.duration=parseDuration(state.log);
  item.width ||= meta.width;item.height ||=meta.height;item.fps=meta.fps;
  item.sourceAudio=parseAudioInfo(state.log);item.audioPresent=/Stream #.*Audio:/.test(state.log);
  if(!/Stream #.*Video:/.test(state.log))throw new Error('No valid video stream found.');
  if(!Number.isFinite(item.duration)||item.duration<=0)throw new Error('Video duration could not be determined.');
}
async function encode(ffmpeg,args,token,phase){
  if(token!==state.token)throw new Error('Canceled.');
  state.log='';state.phase=phase;activeProgress(phase.from,phase.label);
  const code=await ffmpeg.exec(args);state.phase=null;
  if(token!==state.token)throw new Error('Canceled.');
  if(code!==0){const hint=state.log.split('\n').filter(line=>/error|failed|unknown encoder|invalid|memory/i.test(line)).slice(-3).join(' ');
    throw new Error(`Encoding failed.${hint?' '+hint.slice(0,240):' Unsupported format or codec.'}`);}
  activeProgress(phase.to,phase.label);
}
async function compressOne(item,token,index,total){
  const input=virtualName(item),output='compressed.mp4';let ffmpeg;
  item.status='working';item.note='';item.percent=0;state.active=item;state.progressValue=-1;renderQueue();
  try{
    if(item.file.size<=targetMB()*MB)throw new Error('Target must be smaller than the original file.');
    activeProgress(1,`Video ${index} of ${total} · Loading engine…`);
    ffmpeg=await ensureEngine(token);
    activeProgress(6,`Video ${index} of ${total} · Reading source…`);
    await ffmpeg.writeFile(input,new Uint8Array(await item.file.arrayBuffer()));
    if(token!==state.token)throw new Error('Canceled.');
    activeProgress(9,`Video ${index} of ${total} · Inspecting streams…`);
    await probeDetails(ffmpeg,input,item,token);
    const plan=makePlan({duration:item.duration,targetMB:targetMB(),originalBytes:item.file.size,width:item.width,height:item.height,fps:item.fps,audioPresent:item.audioPresent,sourceAudio:item.sourceAudio});
    let kbps=plan.videoKbps;let data;
    for(let attempt=1;attempt<=2;attempt++){
      await safeDelete(ffmpeg,output);
      const phase=attempt===1?{from:12,to:89,label:`Video ${index} of ${total} · Fast encoding…`}:{from:89,to:97,label:`Video ${index} of ${total} · Adjusting file size…`};
      await encode(ffmpeg,fastArgs({input,output,videoKbps:kbps,audioKbps:plan.audioKbps,audioPresent:item.audioPresent,copyAudio:plan.copyAudio}),token,phase);
      data=await ffmpeg.readFile(output);
      validateMp4(data);
      if(!shouldRetry(data.length,plan.targetBytes,attempt))break;
      const retry=retryBitrate(kbps,plan.targetBytes,data.length);
      if(retry<70||retry>=kbps)break;
      kbps=retry;
    }
    activeProgress(97,`Video ${index} of ${total} · Finalizing MP4…`);
    // Browser media decoding may be slow under WASM memory pressure. It must not
    // destroy an otherwise complete MP4 or incorrectly label encoding as failed.
    // Playback is available on demand through the Preview button.
    if(token!==state.token)throw new Error('Canceled.');
    const blob=new Blob([data],{type:'video/mp4'});
    const url=URL.createObjectURL(blob);
    item.outputBlob=blob;item.outputURL=url;item.resultBytes=blob.size;item.status='done';item.percent=100;
    item.note=blob.size>plan.targetBytes
      ? 'The output is above your requested size after retry. Try a larger target. Preview to check playback.'
      : 'Saved as MP4. Preview if you want to check picture, audio, and seeking.';
    activeProgress(100,`Video ${index} of ${total} · Complete`);
  }catch(e){
    item.status=state.cancelRequested?'canceled':'failed';item.note=e instanceof Error?e.message:String(e);
    if(/memory|terminated|Cannot load|core|engine/i.test(item.note)&&!state.cancelRequested)terminateEngine();
  }finally{
    state.phase=null;
    if(ffmpeg&&ffmpeg===state.ffmpeg){await safeDelete(ffmpeg,input);await safeDelete(ffmpeg,output);}
    state.active=null;renderQueue();updateOutlook();
  }
}
async function compressBatch(){
  if(state.busy||state.zipBusy||!validTarget()||!candidates().length)return;
  setError('');state.busy=true;state.cancelRequested=false;
  const token=++state.token;
  const pending=candidates();renderQueue();
  try{
    for(let i=0;i<pending.length;i++){
      if(state.cancelRequested||token!==state.token)break;
      await compressOne(pending[i],token,i+1,pending.length);
    }
    if(!state.cancelRequested){const fail=pending.filter(item=>item.status==='failed');if(fail.length)setError(`${fail.length} video(s) could not be compressed. See the message beside each file. You can retry them.`);}
  }finally{
    if(state.cancelRequested){for(const item of pending){if(item.status==='queued'){item.status='canceled';item.note='Not processed (batch canceled).';}}}
    state.busy=false;state.active=null;state.phase=null;els.progress.hidden=true;
    state.cancelRequested=false;renderQueue();
  }
}
function cancelBatch(){
  if(!state.busy||state.cancelRequested)return;
  state.cancelRequested=true;++state.token;
  if(state.active){state.active.status='canceled';state.active.note='Canceled; original video unchanged.';}
  terminateEngine();activeProgress(0,'Canceling current video…');renderQueue();
}
function closePreview(){els.video.pause();els.video.removeAttribute('src');els.video.load();if(state.previewSourceURL)URL.revokeObjectURL(state.previewSourceURL);state.previewSourceURL='';state.previewItem=null;}
function setPreviewMode(mode){
  const item=state.previewItem;if(!item)return;
  const output=mode==='output'&&item.outputURL;
  els.video.pause();
  if(state.previewSourceURL)URL.revokeObjectURL(state.previewSourceURL);
  state.previewSourceURL='';
  els.video.src=output?item.outputURL:(state.previewSourceURL=URL.createObjectURL(item.file));
  els.video.load();
  els.originalTab.classList.toggle('active',!output);els.outputTab.classList.toggle('active',!!output);
  els.originalTab.setAttribute('aria-pressed',String(!output));els.outputTab.setAttribute('aria-pressed',String(!!output));
  els.previewHelp.textContent=output?'Compressed MP4 preview. Check image, audio, and seeking before sharing.':'Original video preview (if supported by your browser).';
}
function openPreview(id){
  if(state.busy)return;
  const item=state.items.find(x=>x.id===id);if(!item)return;
  state.previewItem=item;els.dialogTitle.textContent=item.file.name;
  els.outputTab.hidden=item.status!=='done';
  setPreviewMode(item.outputURL?'output':'original');els.dialog.showModal();
}
async function downloadAll(){
  if(state.zipBusy||state.busy)return;
  const completed=state.items.filter(x=>x.status==='done');if(completed.length<2)return;
  if(completed.reduce((n,x)=>n+x.resultBytes,0)>MAX_BATCH_ZIP_BYTES){setError('Batch ZIP exceeds 300 MB. Download the videos individually.');return;}
  state.zipBusy=true;renderQueue();setError('');
  try{
    const blob=await makeZip(completed.map(item=>({name:safeDownloadName(item.file.name),blob:item.outputBlob})));
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='compressed-videos.zip';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){setError(`ZIP download failed: ${e instanceof Error?e.message:String(e)}`);}
  finally{state.zipBusy=false;renderQueue();}
}
els.drop.addEventListener('click',()=>{if(!state.busy && !state.zipBusy)els.input.click();});
els.drop.addEventListener('keydown',e=>{if(!state.busy && !state.zipBusy && (e.key==='Enter'||e.key===' ')){e.preventDefault();els.input.click();}});
els.input.addEventListener('change',()=>{addFiles([...els.input.files]);els.input.value='';});
els.button.addEventListener('click',compressBatch);els.cancel.addEventListener('click',cancelBatch);
els.target.addEventListener('input',()=>{
  if(state.busy || state.zipBusy)return;
  // Changing the size invalidates prior results; never present stale outputs as current.
  releaseAll();for(const item of state.items){item.status='queued';item.note='';}
  setError('');renderQueue();updateOutlook();
});
['dragenter','dragover'].forEach(event=>els.drop.addEventListener(event,e=>{e.preventDefault();if(!state.busy && !state.zipBusy)els.drop.classList.add('drag-over');}));
['dragleave','drop'].forEach(event=>els.drop.addEventListener(event,e=>{e.preventDefault();els.drop.classList.remove('drag-over');}));
els.drop.addEventListener('drop',e=>{if(!state.busy && !state.zipBusy)addFiles([...e.dataTransfer.files]);});
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
els.originalTab.addEventListener('click',()=>setPreviewMode('original'));
els.outputTab.addEventListener('click',()=>setPreviewMode('output'));
els.close.addEventListener('click',()=>els.dialog.close());els.dialog.addEventListener('close',closePreview);
els.video.addEventListener('error',()=>{if(state.previewItem)els.previewHelp.textContent='This browser could not open this video preview. The downloaded file is still available; check it in your preferred player.';});
els.downloadAll.addEventListener('click',downloadAll);
window.addEventListener('beforeunload',()=>{closePreview();for(const item of state.items)releaseOutput(item);terminateEngine();});
renderQueue();
