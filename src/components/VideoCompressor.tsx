import React, { useState, useRef, useCallback } from 'react';
import { formatBytes } from '../utils/formatters';
import { getVideoMetadata } from '../utils/videoProcessing';
import { Upload, Download, Check, X, Loader2, FileText, ExternalLink } from 'lucide-react';

interface VideoCompressorProps {
  onSelectAnotherTool: () => void;
}

interface BatchItem {
  id: string;
  file: File;
  meta?: { duration: number; width: number; height: number };
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  outputBlob?: Blob;
  outputUrl?: string;
  outputSize?: number;
  outputFormat?: 'mp4' | 'webm';
  error?: string;
}

const PRESETS = [5, 8];
const MAX_FILES = 5;

export const VideoCompressor: React.FC<VideoCompressorProps> = () => {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [targetSizeMB, setTargetSizeMB] = useState<number>(8);
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const hiddenLinkRef = useRef<HTMLAnchorElement | null>(null);

  // ── helpers ──────────────────────────────────────────────

  const updateItem = useCallback(
    (id: string, patch: Partial<BatchItem>) =>
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it))),
    [],
  );

  const addFiles = async (files: File[]) => {
    setGlobalError('');
    const remaining = MAX_FILES - items.length;
    if (remaining <= 0) {
      setGlobalError(`Maximum ${MAX_FILES} videos at a time.`);
      return;
    }
    const toAdd = files.slice(0, remaining);
    if (files.length > remaining)
      setGlobalError(`Only ${remaining} slot(s) left – ${files.length - remaining} skipped.`);

    const batch: BatchItem[] = toAdd.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      status: 'pending' as const,
      progress: 0,
    }));

    setItems((p) => [...p, ...batch]);

    for (const b of batch) {
      try {
        const url = URL.createObjectURL(b.file);
        const meta = await getVideoMetadata(url);
        URL.revokeObjectURL(url);
        setItems((p) => p.map((it) => (it.id === b.id ? { ...it, meta } : it)));
      } catch {
        /* metadata optional */
      }
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const it = prev.find((x) => x.id === id);
      if (it?.outputUrl) URL.revokeObjectURL(it.outputUrl);
      return prev.filter((x) => x.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach((it) => { if (it.outputUrl) URL.revokeObjectURL(it.outputUrl); });
    setItems([]);
    setGlobalError('');
  };

  // ── compression core ────────────────────────────────────

  const compressOne = async (item: BatchItem, target: number): Promise<BatchItem> => {
    const fileUrl = URL.createObjectURL(item.file);
    try {
      const video = document.createElement('video');
      video.src = fileUrl;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';

      await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = () => rej(new Error('Load failed')); });

      const meta = item.meta ?? {
        duration: video.duration || 10,
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720,
      };

      /*
       * ── Bitrate calculation ──
       * Keep original resolution & 30fps for maximum quality.
       * Use 85% of target size as budget (15% margin for container overhead).
       * Browser MediaRecorder treats videoBitsPerSecond as a hint —
       * the output may be slightly over or under, but quality stays high.
       */
      const targetBytes = target * 1024 * 1024;
      const audioBps = 64000; // 64 kbps audio
      const usableBits = targetBytes * 8 * 0.85;
      const videoBps = Math.max(200000, Math.floor((usableBits - audioBps * meta.duration) / meta.duration));

      const canvas = document.createElement('canvas');
      canvas.width = meta.width;
      canvas.height = meta.height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('No canvas');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // combined stream (video from canvas + audio from source)
      const canvasStream = canvas.captureStream(30);
      const combined = new MediaStream();
      canvasStream.getVideoTracks().forEach((t) => combined.addTrack(t));
      try {
        const src = video as HTMLVideoElement & { captureStream?: () => MediaStream };
        if (src.captureStream) src.captureStream().getAudioTracks().forEach((t) => combined.addTrack(t));
      } catch { /* silent fallback */ }

      // codec preference
      let mime = '';
      let ext: 'mp4' | 'webm' = 'mp4';
      for (const c of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1.640028', 'video/mp4']) {
        if (MediaRecorder.isTypeSupported(c)) { mime = c; ext = 'mp4'; break; }
      }
      if (!mime) {
        for (const c of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
          if (MediaRecorder.isTypeSupported(c)) { mime = c; ext = 'webm'; break; }
        }
      }

      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: videoBps, audioBitsPerSecond: audioBps });
      } catch {
        rec = new MediaRecorder(combined, { videoBitsPerSecond: videoBps, audioBitsPerSecond: audioBps });
      }

      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      let resolveStop: () => void = () => {};
      const stopped = new Promise<void>((r) => { resolveStop = r; });
      rec.onstop = () => resolveStop();

      rec.start(200);
      await video.play();

      await new Promise<void>((done) => {
        const tick = () => {
          if (video.ended || video.paused) {
            if (rec.state === 'recording') { try { rec.requestData(); } catch {} rec.stop(); }
            done();
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          updateItem(item.id, { progress: Math.min(99, Math.floor((video.currentTime / meta.duration) * 100)) });
          requestAnimationFrame(tick);
        };
        tick();
      });
      await stopped;

      const blob = new Blob(chunks, { type: mime || 'video/webm' });
      if (blob.size === 0) throw new Error('Empty output');

      return {
        ...item,
        status: 'done',
        progress: 100,
        outputBlob: blob,
        outputUrl: URL.createObjectURL(blob),
        outputSize: blob.size,
        outputFormat: ext,
      };
    } catch (err) {
      return { ...item, status: 'error', progress: 0, error: err instanceof Error ? err.message : 'Failed' };
    } finally {
      URL.revokeObjectURL(fileUrl);
    }
  };

  const handleCompressAll = async () => {
    setIsProcessing(true);
    setGlobalError('');
    const target = targetSizeMB;

    for (const item of items) {
      if (item.status === 'done') continue;
      updateItem(item.id, { status: 'processing', progress: 0, error: undefined });
      const result = await compressOne(item, target);
      setItems((p) => p.map((it) => (it.id === item.id ? result : it)));
    }
    setIsProcessing(false);
  };

  // ── download helpers ────────────────────────────────────

  const triggerDownload = (url: string, name: string) => {
    const a = hiddenLinkRef.current ?? document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    if (!hiddenLinkRef.current) document.body.appendChild(a);
    a.click();
    if (!hiddenLinkRef.current) requestAnimationFrame(() => document.body.removeChild(a));
  };

  const handleSave = async (item: BatchItem) => {
    if (!item.outputBlob || !item.outputUrl) return;
    const name = item.file.name; // keep original filename

    const picker = (window as Window & {
      showSaveFilePicker?: (o: { suggestedName: string; types?: { description: string; accept: Record<string, string[]> }[] }) =>
        Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }>;
    }).showSaveFilePicker;

    try {
      if (picker) {
        const h = await picker({ suggestedName: name, types: [{ description: 'Video', accept: { 'video/mp4': ['.mp4'], 'video/webm': ['.webm'] } }] });
        const w = await h.createWritable();
        await w.write(item.outputBlob);
        await w.close();
        return;
      }
      triggerDownload(item.outputUrl, name);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      triggerDownload(item.outputUrl, name);
    }
  };

  const handleDownloadAll = async () => {
    for (const it of items) {
      if (it.status === 'done' && it.outputUrl) {
        triggerDownload(it.outputUrl, it.file.name);
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  };

  // ── derived state ───────────────────────────────────────

  const doneCount = items.filter((i) => i.status === 'done').length;
  const hasUnprocessed = items.some((i) => i.status === 'pending' || i.status === 'error');

  // ── render ──────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <a ref={hiddenLinkRef} className="hidden" />

      <h1 className="text-2xl font-bold mb-1">Video Compressor</h1>
      <p className="text-zinc-500 text-sm mb-6">
        Add up to {MAX_FILES} videos • compressed one after another • output kept as original filename
      </p>

      {/* ── Target size selector ─────────────────── */}
      {items.length > 0 && (
        <div className="mb-5">
          <label className="text-xs uppercase tracking-wider text-zinc-500 mb-2.5 block">Target size</label>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((mb) => (
              <button
                key={mb}
                disabled={isProcessing}
                onClick={() => setTargetSizeMB(mb)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-40
                  ${targetSizeMB === mb
                    ? 'bg-white text-black'
                    : 'bg-zinc-800/80 text-zinc-400 hover:text-white border border-zinc-700/60'
                  }`}
              >
                {mb}MB
              </button>
            ))}
            <div className="flex items-center bg-zinc-800/80 border border-zinc-700/60 rounded-lg px-3 py-2 gap-1.5">
              <input
                type="number"
                min={1}
                max={999}
                disabled={isProcessing}
                value={targetSizeMB}
                onChange={(e) => setTargetSizeMB(Math.max(1, parseInt(e.target.value || '1', 10)))}
                className="w-16 bg-transparent text-white text-sm outline-none disabled:opacity-40 tabular-nums"
              />
              <span className="text-zinc-500 text-sm">MB</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload zone ──────────────────────────── */}
      {items.length < MAX_FILES && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const v = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('video/')); addFiles(v); }}
          className="border border-dashed border-zinc-700 rounded-xl p-8 text-center hover:border-zinc-500 transition-colors mb-5"
        >
          <input
            type="file"
            accept="video/*"
            multiple
            onChange={(e) => { if (e.target.files?.length) { addFiles(Array.from(e.target.files)); e.target.value = ''; } }}
            className="hidden"
            id="batchInput"
          />
          <label htmlFor="batchInput" className="cursor-pointer block">
            <Upload className="w-9 h-9 mx-auto mb-2.5 text-zinc-600" />
            <p className="font-medium text-sm mb-0.5">Drop videos or click to add</p>
            <p className="text-zinc-600 text-xs">
              {items.length === 0 ? `Up to ${MAX_FILES} files` : `${MAX_FILES - items.length} slot${MAX_FILES - items.length > 1 ? 's' : ''} left`}
            </p>
          </label>
        </div>
      )}

      {globalError && (
        <p className="text-amber-400 text-xs mb-4 bg-amber-950/30 px-3 py-2 rounded-lg border border-amber-900/50">
          {globalError}
        </p>
      )}

      {/* ── File list ────────────────────────────── */}
      {items.length > 0 && (
        <div className="space-y-3 mb-6">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="bg-zinc-900/70 rounded-xl px-4 py-3.5 border border-zinc-800/80"
            >
              {/* top row */}
              <div className="flex items-center gap-3">
                {/* index pill */}
                <span className="flex-shrink-0 w-7 h-7 rounded-md bg-zinc-800 flex items-center justify-center text-[11px] text-zinc-500 font-medium">
                  {idx + 1}
                </span>

                <FileText className="w-5 h-5 text-zinc-600 flex-shrink-0" />

                {/* file info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate leading-tight">{item.file.name}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5 leading-tight">
                    {formatBytes(item.file.size)}
                    {item.meta ? ` • ${item.meta.duration.toFixed(1)}s • ${item.meta.width}×${item.meta.height}` : ''}
                    {item.status === 'done' && item.outputSize != null && (
                      <span className="text-green-400"> → {formatBytes(item.outputSize)}</span>
                    )}
                  </p>
                </div>

                {/* right side actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.status === 'pending' && (
                    <span className="text-[11px] text-zinc-600 italic">Queued</span>
                  )}

                  {item.status === 'processing' && (
                    <div className="flex items-center gap-1.5">
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                      <span className="text-[11px] text-zinc-400 tabular-nums w-7 text-right">{item.progress}%</span>
                    </div>
                  )}

                  {item.status === 'done' && (
                    <>
                      <Check className="w-4 h-4 text-green-500" />
                      <button
                        onClick={() => handleSave(item)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white/10 hover:bg-white/20 border border-zinc-700 text-white text-xs font-medium rounded-lg cursor-pointer transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        Save
                      </button>
                      {item.outputUrl && (
                        <a
                          href={item.outputUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open in new tab"
                          className="p-1.5 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </>
                  )}

                  {item.status === 'error' && (
                    <span className="text-[11px] text-red-400 max-w-[120px] truncate">{item.error}</span>
                  )}

                  {!isProcessing && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-1 text-zinc-600 hover:text-white cursor-pointer transition-colors"
                      aria-label="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* progress bar */}
              {item.status === 'processing' && (
                <div className="mt-2.5 h-[3px] bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-white/90 transition-all duration-200" style={{ width: `${item.progress}%` }} />
                </div>
              )}

              {/* output format label */}
              {item.status === 'done' && item.outputFormat && (
                <p className="text-[11px] text-zinc-600 mt-1.5 ml-10">Output: {item.outputFormat.toUpperCase()}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Action bar ───────────────────────────── */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={isProcessing || !hasUnprocessed}
            onClick={handleCompressAll}
            className="flex-1 min-w-[180px] py-3 bg-white text-black text-sm font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:bg-zinc-200 transition-colors"
          >
            {isProcessing
              ? 'Compressing…'
              : hasUnprocessed
                ? `Compress ${items.filter((i) => i.status !== 'done').length} video${items.filter((i) => i.status !== 'done').length > 1 ? 's' : ''} → ${targetSizeMB}MB`
                : 'All done'}
          </button>

          {doneCount > 0 && !isProcessing && (
            <button
              onClick={handleDownloadAll}
              className="flex items-center gap-2 px-5 py-3 border border-zinc-700 text-white text-sm font-semibold rounded-xl hover:bg-zinc-800 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              Download all ({doneCount})
            </button>
          )}

          {!isProcessing && items.length > 0 && (
            <button onClick={clearAll} className="px-4 py-3 text-zinc-500 hover:text-white text-xs cursor-pointer transition-colors">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
};
