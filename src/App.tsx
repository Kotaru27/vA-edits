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
