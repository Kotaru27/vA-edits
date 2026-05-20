# PROMPT FOR GOOGLE AI STUDIO

Copy everything below this line and paste it into Google AI Studio:

---

I have a React + Vite + Tailwind CSS media editing tool called "VA Edits". It currently uses browser MediaRecorder for video compression which gives inconsistent file sizes and poor quality. I need you to replace ONLY the Video Compressor's encoding engine with FFmpeg.wasm so it produces real H.264 MP4 output with accurate file size targeting.

## WHAT TO CHANGE

Replace `src/components/VideoCompressor.tsx` — swap out the MediaRecorder-based `compressOne` function with FFmpeg.wasm. Keep everything else (UI, batch logic, download helpers, all other tools) exactly as-is.

## PACKAGES TO INSTALL

```
npm install @ffmpeg/ffmpeg@0.12.15 @ffmpeg/util@0.12.2
```

## FFMPEG INTEGRATION REQUIREMENTS

1. Create a shared FFmpeg instance (singleton). Load it lazily on first compression.
2. Load FFmpeg core from CDN using toBlobURL:
```ts
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const CORE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
```
3. For each video in the batch, do this inside `compressOne`:
```ts
await ffmpeg.writeFile('input.mp4', await fetchFile(file));

// Calculate bitrate
const totalBitrate = Math.floor((targetMB * 8192) / duration); // kbps
const audioBitrate = 96; // kbps
const videoBitrate = Math.max(200, totalBitrate - audioBitrate);

await ffmpeg.exec([
  '-i', 'input.mp4',
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-b:v', `${videoBitrate}k`,
  '-maxrate', `${Math.round(videoBitrate * 1.2)}k`,
  '-bufsize', `${Math.round(videoBitrate * 2)}k`,
  '-c:a', 'aac',
  '-b:a', '96k',
  '-movflags', '+faststart',
  'output.mp4'
]);

const data = await ffmpeg.readFile('output.mp4');
const blob = new Blob([data], { type: 'video/mp4' });
```
4. Track progress via `ffmpeg.on('progress', ({ progress }) => ...)` — update the item's progress percentage.
5. Clean up virtual filesystem after each file: `ffmpeg.deleteFile('input.mp4')` and `ffmpeg.deleteFile('output.mp4')`.
6. Output must always be `.mp4` — set `outputFormat: 'mp4'` on the result.
7. Show "Loading FFmpeg engine..." status when loading FFmpeg for the first time.

## CRITICAL RULES

- Do NOT change any other file except `src/components/VideoCompressor.tsx`
- Keep the exact same BatchItem interface, batch UI, card layout, Save/Download All/Open in new tab buttons
- Keep presets as `[5, 8]` plus custom input box
- Keep original filename for downloads (`item.file.name`)
- Keep AMOLED black theme, all existing Tailwind classes
- The tool name is "VA Edits" everywhere
- Do NOT edit package.json or vite.config.ts
- The app must work on GitHub Pages (static hosting, no custom headers)
- Use the single-threaded UMD build of ffmpeg-core (does NOT need SharedArrayBuffer headers)

## COMPLETE CURRENT CODEBASE

### FILE: index.html
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VA Edits - Video Compressor & Audio Tools</title>
    <meta name="description" content="Free browser-based video compressor, video trimmer, audio converter, audio trimmer. 100% client-side." />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### FILE: package.json
```json
{
  "name": "react-vite-tailwind",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "clsx": "2.1.1",
    "framer-motion": "^12.39.0",
    "lucide-react": "^1.16.0",
    "react": "19.2.6",
    "react-dom": "19.2.6",
    "tailwind-merge": "3.4.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "4.1.17",
    "@types/node": "22.19.17",
    "@types/react": "19.2.7",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "5.1.1",
    "tailwindcss": "4.1.17",
    "typescript": "5.9.3",
    "vite": "7.3.2",
    "vite-plugin-singlefile": "2.3.0"
  }
}
```

### FILE: vite.config.ts
```ts
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

### FILE: tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "types": ["node"],
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "vite.config.ts"]
}
```

### FILE: src/main.tsx
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

### FILE: src/index.css
```css
@import "tailwindcss";

@layer base {
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #000000;
    color: #ffffff;
    overflow-x: hidden;
  }
  
  * {
    box-sizing: border-box;
  }
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: #000000;
}
::-webkit-scrollbar-thumb {
  background: #333333;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #555555;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out;
}
```

### FILE: src/types.ts
```ts
export type ToolType = 'compressor' | 'audio-converter' | 'video-trim-crop' | 'audio-trimmer';

export interface FileMetadata {
  name: string;
  size: number;
  type: string;
  url: string;
  duration?: number;
  width?: number;
  height?: number;
  audioSampleRate?: number;
  audioChannels?: number;
}

export type CompressionPreset = '8mb' | '5mb' | 'custom' | '50percent' | 'whatsapp';

export interface CompressionSettings {
  preset: CompressionPreset;
  targetSizeMB: number;
  resolutionScale: number;
  audioMuted: boolean;
  qualityMode: 'speed' | 'balanced' | 'high';
}

export type AudioFormat = 'mp3' | 'wav' | 'm4a' | 'ogg' | 'flac';

export interface AudioConverterSettings {
  targetFormat: AudioFormat;
  bitrate: number;
  sampleRate: number;
  channels: 1 | 2;
  volumeBoost: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  reverse: boolean;
}

export type AspectRatio = 'free' | '16:9' | '9:16' | '1:1' | '4:3';

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VideoTrimCropSettings {
  startTime: number;
  endTime: number;
  aspectRatio: AspectRatio;
  cropBox: CropBox;
  muteAudio: boolean;
}

export interface AudioTrimmerSettings {
  startTime: number;
  endTime: number;
  fadeIn: number;
  fadeOut: number;
  volume: number;
  speed: number;
  pitchShift: number;
}

export interface ProcessingState {
  status: 'idle' | 'processing' | 'success' | 'error';
  progress: number;
  message: string;
  outputUrl?: string;
  outputName?: string;
  outputSize?: number;
  originalSize?: number;
  timeTakenMs?: number;
}
```

### FILE: src/utils/formatters.ts
```ts
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatTime(seconds: number, showMs = false): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  const formattedMins = String(mins).padStart(2, '0');
  const formattedSecs = String(secs).padStart(2, '0');
  if (showMs) return `${formattedMins}:${formattedSecs}.${ms}`;
  return `${formattedMins}:${formattedSecs}`;
}

export function extractFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length <= 1) return '';
  return parts[parts.length - 1].toLowerCase();
}

export function getEstimatedBitrate(sizeBytes: number, durationSeconds: number): number {
  if (!durationSeconds || durationSeconds <= 0) return 1000000;
  return Math.floor((sizeBytes * 8) / durationSeconds);
}

export function downloadBlob(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  requestAnimationFrame(() => {
    document.body.removeChild(a);
  });
}
```

### FILE: src/utils/videoProcessing.ts
```ts
import { CompressionSettings, VideoTrimCropSettings } from '../types';

export async function getVideoMetadata(fileUrl: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = fileUrl;
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration || 10,
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720
      });
    };
    video.onerror = () => reject(new Error('Failed to load video metadata'));
  });
}
```
(Note: This file also has processVideoCompression and processVideoTrimCrop functions but they are NOT used by any component — only getVideoMetadata is imported.)

### FILE: src/App.tsx
```tsx
import { useState } from 'react';
import { ToolType } from './types';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ToolSelector } from './components/ToolSelector';
import { VideoCompressor } from './components/VideoCompressor';
import { AudioConverter } from './components/AudioConverter';
import { VideoTrimCrop } from './components/VideoTrimCrop';
import { AudioTrimmer } from './components/AudioTrimmer';

export default function App() {
  const [activeTool, setActiveTool] = useState<ToolType | null>(null);

  const handleSelectTool = (tool: ToolType | null) => {
    setActiveTool(tool);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-black text-white selection:bg-white selection:text-black">
      <Header activeTool={activeTool} onSelectTool={handleSelectTool} />
      <main className="flex-grow">
        {!activeTool ? (
          <ToolSelector onSelectTool={(tool) => handleSelectTool(tool)} />
        ) : (
          <div className="animate-fadeIn">
            {activeTool === 'compressor' && (
              <VideoCompressor onSelectAnotherTool={() => handleSelectTool(null)} />
            )}
            {activeTool === 'audio-converter' && <AudioConverter />}
            {activeTool === 'video-trim-crop' && <VideoTrimCrop />}
            {activeTool === 'audio-trimmer' && <AudioTrimmer />}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
```

### FILE: src/components/VideoCompressor.tsx (THIS IS THE FILE TO REPLACE)
```tsx
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
  // ... current MediaRecorder-based implementation
  // REPLACE THE compressOne FUNCTION WITH FFMPEG.WASM
  // KEEP EVERYTHING ELSE (UI, batch logic, downloads) EXACTLY THE SAME
};
```

## OUTPUT FORMAT

Give me the COMPLETE updated `src/components/VideoCompressor.tsx` file. Do not abbreviate any code. Do not use "// ... rest stays same" comments. Give me the entire file content I can copy-paste directly.

Also tell me the exact npm install command and any other files that need changes (there should be none).
