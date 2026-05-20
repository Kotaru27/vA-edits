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

export async function processVideoCompression(
  fileUrl: string,
  settings: CompressionSettings,
  onProgress: (p: number) => void
): Promise<{ blob: Blob; finalSize: number }> {
  const meta = await getVideoMetadata(fileUrl);
  const targetBytes = settings.targetSizeMB * 1024 * 1024;
  const duration = meta.duration;
  
  // Target bitrate in bits per second. Allow 10% safety margin.
  const targetBitrate = Math.max(100000, Math.floor((targetBytes * 8 * 0.9) / duration));
  
  const width = Math.floor(meta.width * settings.resolutionScale);
  const height = Math.floor(meta.height * settings.resolutionScale);

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = fileUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true; // ensure autoplay works
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Canvas 2d context not available'));
      return;
    }

    const stream = canvas.captureStream(30);
    let recorder: MediaRecorder;
    try {
      // Prefer mp4 or webm
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: targetBitrate
      });
    } catch {
      recorder = new MediaRecorder(stream, { videoBitsPerSecond: targetBitrate });
    }

    const recordedChunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    recorder.onstop = () => {
      const finalBlob = new Blob(recordedChunks, { type: recordedChunks[0]?.type || 'video/webm' });
      resolve({ blob: finalBlob, finalSize: finalBlob.size });
    };

    video.onloadeddata = () => {
      video.play();
      recorder.start(100);

      const renderFrame = () => {
        if (video.ended || video.currentTime >= duration) {
          recorder.stop();
          onProgress(100);
          return;
        }
        
        ctx.drawImage(video, 0, 0, width, height);
        const progress = Math.min(99, Math.floor((video.currentTime / duration) * 100));
        onProgress(progress);
        
        requestAnimationFrame(renderFrame);
      };

      renderFrame();
    };

    video.onerror = () => reject(new Error('Error playing video for compression'));
  });
}

export async function processVideoTrimCrop(
  fileUrl: string,
  settings: VideoTrimCropSettings,
  onProgress: (p: number) => void
): Promise<{ blob: Blob }> {
  const meta = await getVideoMetadata(fileUrl);
  const startTime = settings.startTime;
  const endTime = Math.min(meta.duration, settings.endTime);
  const duration = Math.max(0.1, endTime - startTime);

  // Compute crop box in actual pixels
  const cropX = Math.floor((settings.cropBox.x / 100) * meta.width);
  const cropY = Math.floor((settings.cropBox.y / 100) * meta.height);
  const cropW = Math.floor((settings.cropBox.width / 100) * meta.width);
  const cropH = Math.floor((settings.cropBox.height / 100) * meta.height);

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = fileUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    
    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Canvas 2d context not available'));
      return;
    }

    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { videoBitsPerSecond: 2500000 });
    const recordedChunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    recorder.onstop = () => {
      const finalBlob = new Blob(recordedChunks, { type: recordedChunks[0]?.type || 'video/webm' });
      resolve({ blob: finalBlob });
    };

    video.onloadeddata = () => {
      video.currentTime = startTime;
    };

    video.onseeked = () => {
      if (video.currentTime < endTime) {
        video.play();
        recorder.start(100);

        const renderFrame = () => {
          if (video.ended || video.currentTime >= endTime) {
            video.pause();
            recorder.stop();
            onProgress(100);
            return;
          }

          // Draw cropped section
          ctx.drawImage(
            video,
            cropX, cropY, cropW, cropH,
            0, 0, cropW, cropH
          );

          const progress = Math.min(99, Math.floor(((video.currentTime - startTime) / duration) * 100));
          onProgress(progress);

          requestAnimationFrame(renderFrame);
        };

        renderFrame();
      }
    };

    video.onerror = () => reject(new Error('Error processing video trim & crop'));
  });
}
