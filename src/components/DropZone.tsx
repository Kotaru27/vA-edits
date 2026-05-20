import React, { useRef, useState } from 'react';
import { UploadCloud, FileVideo, FileAudio, Sparkles } from 'lucide-react';
import { FileMetadata } from '../types';

interface DropZoneProps {
  accept: string;
  label: string;
  sublabel: string;
  onFileSelect: (file: FileMetadata) => void;
  allowedTypes: 'video' | 'audio' | 'both';
}

// Reliable sample media URLs for instant testing
const DEMO_VIDEO_URL = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
const FALLBACK_DEMO_AUDIO = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

export const DropZone: React.FC<DropZoneProps> = ({ accept, label, sublabel, onFileSelect, allowedTypes }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processSelectedFile = (file: File) => {
    const url = URL.createObjectURL(file);
    onFileSelect({
      name: file.name,
      size: file.size,
      type: file.type || (file.name.endsWith('.mp3') ? 'audio/mp3' : 'video/mp4'),
      url: url,
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const loadDemoFile = async (type: 'video' | 'audio') => {
    setLoadingDemo(true);
    try {
      const url = type === 'video' ? DEMO_VIDEO_URL : FALLBACK_DEMO_AUDIO;
      const res = await fetch(url);
      const blob = await res.blob();
      const filename = type === 'video' ? 'BigBuckBunny_Demo.mp4' : 'SoundHelix_Sample.mp3';
      const file = new File([blob], filename, { type: blob.type || (type === 'video' ? 'video/mp4' : 'audio/mp3') });
      processSelectedFile(file);
    } catch (err) {
      console.error('Failed to load demo file', err);
      alert('Could not download demo file. Please upload a local file.');
    } finally {
      setLoadingDemo(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto my-8">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-500/10 scale-[1.02] glow-blue'
            : 'border-slate-700 bg-slate-900/60 hover:bg-slate-800/60 hover:border-slate-500'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-4 pointer-events-none">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-600/20 via-indigo-600/20 to-purple-600/20 flex items-center justify-center border border-blue-500/30 shadow-inner">
            <UploadCloud className="w-10 h-10 text-blue-400 animate-bounce" />
          </div>

          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-white tracking-wide">{label}</h3>
            <p className="text-slate-400 text-sm max-w-md mx-auto">{sublabel}</p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <span className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold text-sm shadow-md shadow-blue-500/20 hover:bg-blue-500 transition-all pointer-events-auto">
              Choose File
            </span>
            <span className="text-slate-500 text-xs">or drag and drop here</span>
          </div>

          <div className="flex flex-wrap justify-center gap-2 pt-4">
            {(allowedTypes === 'video' || allowedTypes === 'both') && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs border border-slate-700">
                <FileVideo className="w-3.5 h-3.5 text-blue-400" /> MP4, WEBM, MOV, MKV
              </span>
            )}
            {(allowedTypes === 'audio' || allowedTypes === 'both') && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs border border-slate-700">
                <FileAudio className="w-3.5 h-3.5 text-purple-400" /> MP3, WAV, M4A, FLAC, OGG
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Demo files launcher */}
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3 text-sm">
        <span className="text-slate-400 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-400" /> Don't have a file ready? Try a sample:
        </span>
        <div className="flex gap-2">
          {(allowedTypes === 'video' || allowedTypes === 'both') && (
            <button
              disabled={loadingDemo}
              onClick={(e) => { e.stopPropagation(); loadDemoFile('video'); }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <FileVideo className="w-3.5 h-3.5 text-blue-400" />
              {loadingDemo ? 'Loading...' : 'Sample Video'}
            </button>
          )}
          {(allowedTypes === 'audio' || allowedTypes === 'both') && (
            <button
              disabled={loadingDemo}
              onClick={(e) => { e.stopPropagation(); loadDemoFile('audio'); }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <FileAudio className="w-3.5 h-3.5 text-purple-400" />
              {loadingDemo ? 'Loading...' : 'Sample Audio'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
