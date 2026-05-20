import React from 'react';
import { ToolType } from '../types';

interface ToolSelectorProps {
  onSelectTool: (tool: ToolType) => void;
}

export const ToolSelector: React.FC<ToolSelectorProps> = ({ onSelectTool }) => {
  const tools = [
    { id: 'compressor' as ToolType, title: 'Video Compressor', desc: 'Compress videos to target size (5MB, 8MB, etc.)' },
    { id: 'audio-converter' as ToolType, title: 'Audio Converter', desc: 'Convert audio files to WAV, MP3, M4A, OGG' },
    { id: 'video-trim-crop' as ToolType, title: 'Video Trimmer', desc: 'Trim and crop videos by time range' },
    { id: 'audio-trimmer' as ToolType, title: 'Audio Trimmer', desc: 'Trim audio files precisely' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold text-center mb-2">VA Edits</h1>
      <p className="text-zinc-500 text-center mb-12">Batch media tools — 100% client-side, no uploads</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelectTool(t.id)}
            className="p-6 border border-zinc-800 hover:border-white text-left transition-all rounded-xl cursor-pointer"
          >
            <h3 className="text-lg font-semibold mb-1">{t.title}</h3>
            <p className="text-zinc-400 text-sm">{t.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
};
