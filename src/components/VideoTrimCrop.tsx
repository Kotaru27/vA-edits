import React, { useState, useRef, useCallback } from 'react';
import { formatBytes, formatTime } from '../utils/formatters';
import { getVideoMetadata } from '../utils/videoProcessing';
import { Download, Check, X, Loader2, FileText, ExternalLink, Scissors } from 'lucide-react';

const MAX_FILES = 5;

interface BatchItem {
  id: string;
  file: File;
  meta?: { duration: number; width: number; height: number };
  startTime: number;
  endTime: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  outputBlob?: Blob;
  outputUrl?: string;
  outputSize?: number;
  outputFormat?: string;
  error?: string;
}

export const VideoTrimCrop: React.FC = () => {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [globalStart, setGlobalStart] = useState(0);
  const [globalEnd, setGlobalEnd] = useState(0);
  const linkRef = useRef<HTMLAnchorElement | null>(null);

  const updateItem = useCallback(
    (id: string, patch: Partial<BatchItem>) =>
      setItems((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it))),
    [],
  );

  const addFiles = async (files: File[]) => {
    setGlobalError('');
    const remaining = MAX_FILES - items.length;
    if (remaining <= 0) { setGlobalError(`Max ${MAX_FILES} files.`); return; }
    const toAdd = files.slice(0, remaining);
    if (files.length > remaining) setGlobalError(`${files.length - remaining} file(s) skipped.`);
    const batch: BatchItem[] = toAdd.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: f, startTime: 0, endTime: 0, status: 'pending', progress: 0,
    }));
    setItems((p) => [...p, ...batch]);
    for (const b of batch) {
      try {
        const url = URL.createObjectURL(b.file);
        const meta = await getVideoMetadata(url);
        URL.revokeObjectURL(url);
        setItems((p) => p.map((it) => (it.id === b.id ? { ...it, meta, endTime: meta.duration } : it)));
      } catch { /* skip */ }
    }
  };

  const removeItem = (id: string) => {
    setItems((p) => { const it = p.find((x) => x.id === id); if (it?.outputUrl) URL.revokeObjectURL(it.outputUrl); return p.filter((x) => x.id !== id); });
  };
  const clearAll = () => { items.forEach((it) => { if (it.outputUrl) URL.revokeObjectURL(it.outputUrl); }); setItems([]); setGlobalError(''); };

  const applyGlobalTimes = () => {
    setItems((p) => p.map((it) => {
      if (it.status === 'done') return it;
      const end = globalEnd > globalStart ? Math.min(globalEnd, it.meta?.duration ?? globalEnd) : it.endTime;
      return { ...it, startTime: Math.max(0, globalStart), endTime: end };
    }));
  };

  const trimOne = async (item: BatchItem): Promise<BatchItem> => {
    const fileUrl = URL.createObjectURL(item.file);
    try {
      const video = document.createElement('video');
      video.src = fileUrl; video.muted = true; video.playsInline = true; video.preload = 'auto';
      await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = () => rej(new Error('Load failed')); });

      const meta = item.meta ?? { duration: video.duration || 10, width: video.videoWidth || 1280, height: video.videoHeight || 720 };
      const st = Math.max(0, item.startTime);
      const et = Math.min(meta.duration, item.endTime || meta.duration);

      const canvas = document.createElement('canvas');
      canvas.width = meta.width; canvas.height = meta.height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('No canvas');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';

      const stream = canvas.captureStream(30);
      const combined = new MediaStream();
      stream.getVideoTracks().forEach((t) => combined.addTrack(t));
      try { const src = video as HTMLVideoElement & { captureStream?: () => MediaStream }; if (src.captureStream) src.captureStream().getAudioTracks().forEach((t) => combined.addTrack(t)); } catch { /* silent */ }

      let mime = '';
      let ext = 'mp4';
      for (const c of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']) { if (MediaRecorder.isTypeSupported(c)) { mime = c; ext = 'mp4'; break; } }
      if (!mime) { for (const c of ['video/webm;codecs=vp9', 'video/webm']) { if (MediaRecorder.isTypeSupported(c)) { mime = c; ext = 'webm'; break; } } }

      let rec: MediaRecorder;
      try { rec = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 4000000 }); } catch { rec = new MediaRecorder(combined, { videoBitsPerSecond: 4000000 }); }

      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      let resolveStop: () => void = () => {};
      const stopped = new Promise<void>((r) => { resolveStop = r; });
      rec.onstop = () => resolveStop();

      video.currentTime = st;
      await new Promise<void>((res) => { video.onseeked = () => res(); });
      rec.start(200);
      await video.play();

      await new Promise<void>((done) => {
        const tick = () => {
          if (video.ended || video.paused || video.currentTime >= et) {
            video.pause();
            if (rec.state === 'recording') { try { rec.requestData(); } catch {} rec.stop(); }
            done(); return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          updateItem(item.id, { progress: Math.min(99, Math.floor(((video.currentTime - st) / (et - st)) * 100)) });
          requestAnimationFrame(tick);
        };
        tick();
      });
      await stopped;

      const blob = new Blob(chunks, { type: mime || 'video/webm' });
      if (blob.size === 0) throw new Error('Empty output');
      return { ...item, status: 'done', progress: 100, outputBlob: blob, outputUrl: URL.createObjectURL(blob), outputSize: blob.size, outputFormat: ext };
    } catch (err) {
      return { ...item, status: 'error', progress: 0, error: err instanceof Error ? err.message : 'Failed' };
    } finally { URL.revokeObjectURL(fileUrl); }
  };

  const handleTrimAll = async () => {
    setIsProcessing(true); setGlobalError('');
    for (const item of items) {
      if (item.status === 'done') continue;
      updateItem(item.id, { status: 'processing', progress: 0, error: undefined });
      const result = await trimOne(item);
      setItems((p) => p.map((it) => (it.id === item.id ? result : it)));
    }
    setIsProcessing(false);
  };

  const triggerDownload = (url: string, name: string) => {
    const a = linkRef.current ?? document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    if (!linkRef.current) document.body.appendChild(a);
    a.click();
    if (!linkRef.current) requestAnimationFrame(() => document.body.removeChild(a));
  };
  const handleSave = (item: BatchItem) => { if (item.outputUrl) triggerDownload(item.outputUrl, item.file.name); };
  const handleDownloadAll = async () => { for (const it of items) { if (it.status === 'done' && it.outputUrl) { triggerDownload(it.outputUrl, it.file.name); await new Promise((r) => setTimeout(r, 400)); } } };

  const doneCount = items.filter((i) => i.status === 'done').length;
  const hasUnprocessed = items.some((i) => i.status === 'pending' || i.status === 'error');

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <a ref={linkRef} className="hidden" />
      <h1 className="text-2xl font-bold mb-1">Video Trimmer</h1>
      <p className="text-zinc-500 text-sm mb-6">Trim up to {MAX_FILES} videos at once</p>

      {/* Global trim times */}
      {items.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-zinc-500 mb-1.5 block">Start (sec)</label>
            <input type="number" min={0} step={0.1} value={globalStart} onChange={(e) => setGlobalStart(parseFloat(e.target.value) || 0)} disabled={isProcessing}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-40" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-zinc-500 mb-1.5 block">End (sec)</label>
            <input type="number" min={0.1} step={0.1} value={globalEnd} onChange={(e) => setGlobalEnd(parseFloat(e.target.value) || 0)} disabled={isProcessing}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm disabled:opacity-40" />
          </div>
          <button onClick={applyGlobalTimes} disabled={isProcessing} className="col-span-2 text-xs text-zinc-400 hover:text-white cursor-pointer disabled:opacity-40 text-left">Apply times to all queued files</button>
        </div>
      )}

      {/* Upload */}
      {items.length < MAX_FILES && (
        <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('video/'))); }}
          className="border border-dashed border-zinc-700 rounded-xl p-8 text-center hover:border-zinc-500 transition-colors mb-5">
          <input type="file" accept="video/*" multiple onChange={(e) => { if (e.target.files?.length) { addFiles(Array.from(e.target.files)); e.target.value = ''; } }} className="hidden" id="vtInput" />
          <label htmlFor="vtInput" className="cursor-pointer block">
            <Scissors className="w-9 h-9 mx-auto mb-2.5 text-zinc-600" />
            <p className="font-medium text-sm mb-0.5">Drop videos or click to add</p>
            <p className="text-zinc-600 text-xs">{items.length === 0 ? `Up to ${MAX_FILES} files` : `${MAX_FILES - items.length} left`}</p>
          </label>
        </div>
      )}
      {globalError && <p className="text-amber-400 text-xs mb-4 bg-amber-950/30 px-3 py-2 rounded-lg border border-amber-900/50">{globalError}</p>}

      {/* File list */}
      {items.length > 0 && (
        <div className="space-y-3 mb-6">
          {items.map((item, idx) => (
            <div key={item.id} className="bg-zinc-900/70 rounded-xl px-4 py-3.5 border border-zinc-800/80">
              <div className="flex items-center gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-md bg-zinc-800 flex items-center justify-center text-[11px] text-zinc-500 font-medium">{idx + 1}</span>
                <FileText className="w-5 h-5 text-zinc-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate leading-tight">{item.file.name}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5 leading-tight">
                    {formatBytes(item.file.size)}{item.meta ? ` • ${item.meta.duration.toFixed(1)}s • ${item.meta.width}×${item.meta.height}` : ''}
                    {' '} [{formatTime(item.startTime)} – {formatTime(item.endTime)}]
                    {item.status === 'done' && item.outputSize != null && <span className="text-green-400"> → {formatBytes(item.outputSize)}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.status === 'pending' && <span className="text-[11px] text-zinc-600 italic">Queued</span>}
                  {item.status === 'processing' && <><Loader2 className="w-4 h-4 animate-spin text-zinc-400" /><span className="text-[11px] text-zinc-400 tabular-nums">{item.progress}%</span></>}
                  {item.status === 'done' && <>
                    <Check className="w-4 h-4 text-green-500" />
                    <button onClick={() => handleSave(item)} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white/10 hover:bg-white/20 border border-zinc-700 text-white text-xs font-medium rounded-lg cursor-pointer"><Download className="w-3 h-3" />Save</button>
                    {item.outputUrl && <a href={item.outputUrl} target="_blank" rel="noreferrer" className="p-1.5 text-zinc-500 hover:text-white cursor-pointer"><ExternalLink className="w-3.5 h-3.5" /></a>}
                  </>}
                  {item.status === 'error' && <span className="text-[11px] text-red-400 max-w-[120px] truncate">{item.error}</span>}
                  {!isProcessing && <button onClick={() => removeItem(item.id)} className="p-1 text-zinc-600 hover:text-white cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
                </div>
              </div>
              {item.status === 'processing' && <div className="mt-2.5 h-[3px] bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-white/90 transition-all duration-200" style={{ width: `${item.progress}%` }} /></div>}
              {item.status === 'done' && item.outputFormat && <p className="text-[11px] text-zinc-600 mt-1.5 ml-10">Output: {item.outputFormat.toUpperCase()}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={isProcessing || !hasUnprocessed} onClick={handleTrimAll}
            className="flex-1 min-w-[180px] py-3 bg-white text-black text-sm font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:bg-zinc-200 transition-colors">
            {isProcessing ? 'Trimming…' : hasUnprocessed ? `Trim ${items.filter((i) => i.status !== 'done').length} video(s)` : 'All done'}
          </button>
          {doneCount > 0 && !isProcessing && <button onClick={handleDownloadAll} className="flex items-center gap-2 px-5 py-3 border border-zinc-700 text-white text-sm font-semibold rounded-xl hover:bg-zinc-800 cursor-pointer"><Download className="w-4 h-4" />Download all ({doneCount})</button>}
          {!isProcessing && <button onClick={clearAll} className="px-4 py-3 text-zinc-500 hover:text-white text-xs cursor-pointer">Clear</button>}
        </div>
      )}
    </div>
  );
};
