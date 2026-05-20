// Native client-side Web Audio API processing
import { AudioConverterSettings, AudioTrimmerSettings } from '../types';

export async function decodeAudioFile(fileUrl: string): Promise<AudioBuffer> {
  const response = await fetch(fileUrl);
  const arrayBuffer = await response.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return audioBuffer;
}

export function exportAudioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);
  const channels: Float32Array[] = [];
  let sample: number;
  let offset = 0;
  let pos = 0;

  // write WAV header
  writeString(view, pos, 'RIFF'); pos += 4;
  view.setUint32(pos, length - 8, true); pos += 4;
  writeString(view, pos, 'WAVE'); pos += 4;
  writeString(view, pos, 'fmt '); pos += 4;
  view.setUint32(pos, 16, true); pos += 4; // Subchunk1Size (16 for PCM)
  view.setUint16(pos, 1, true); pos += 2; // AudioFormat (1 for PCM)
  view.setUint16(pos, numOfChan, true); pos += 2; // NumChannels
  view.setUint32(pos, buffer.sampleRate, true); pos += 4; // SampleRate
  view.setUint32(pos, buffer.sampleRate * 2 * numOfChan, true); pos += 4; // ByteRate
  view.setUint16(pos, numOfChan * 2, true); pos += 2; // BlockAlign
  view.setUint16(pos, 16, true); pos += 2; // BitsPerSample
  writeString(view, pos, 'data'); pos += 4;
  view.setUint32(pos, length - pos - 4, true); pos += 4;

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = (0.5 + sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([bufferArray], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export async function processAudioConversion(
  audioBuffer: AudioBuffer,
  settings: AudioConverterSettings,
  onProgress: (p: number) => void
): Promise<Blob> {
  const duration = audioBuffer.duration;
  const sampleRate = settings.sampleRate || audioBuffer.sampleRate;
  const channels = settings.channels;
  
  const offlineCtx = new OfflineAudioContext(
    channels,
    Math.ceil(duration * sampleRate),
    sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;

  // Reverse if requested
  if (settings.reverse) {
    const reversedBuffer = offlineCtx.createBuffer(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
      const channelData = audioBuffer.getChannelData(c);
      const reversedData = reversedBuffer.getChannelData(c);
      for (let i = 0; i < audioBuffer.length; i++) {
        reversedData[i] = channelData[audioBuffer.length - 1 - i];
      }
    }
    source.buffer = reversedBuffer;
  }

  // Volume gain node
  const gainNode = offlineCtx.createGain();
  gainNode.gain.setValueAtTime(settings.volumeBoost, offlineCtx.currentTime);

  // Fade In / Out
  if (settings.fadeInSeconds > 0) {
    gainNode.gain.setValueAtTime(0.01, 0);
    gainNode.gain.exponentialRampToValueAtTime(settings.volumeBoost, settings.fadeInSeconds);
  }
  if (settings.fadeOutSeconds > 0) {
    const startFadeOut = Math.max(0, duration - settings.fadeOutSeconds);
    gainNode.gain.setValueAtTime(settings.volumeBoost, startFadeOut);
    gainNode.gain.exponentialRampToValueAtTime(0.01, duration);
  }

  source.connect(gainNode);
  gainNode.connect(offlineCtx.destination);
  source.start();

  onProgress(30);

  const renderedBuffer = await offlineCtx.startRendering();
  onProgress(70);

  const wavBlob = exportAudioBufferToWav(renderedBuffer);
  onProgress(100);

  return wavBlob;
}

export async function processAudioTrimming(
  audioBuffer: AudioBuffer,
  settings: AudioTrimmerSettings,
  onProgress: (p: number) => void
): Promise<Blob> {
  const startOffset = settings.startTime;
  const endOffset = settings.endTime;
  const duration = Math.max(0.1, (endOffset - startOffset) / settings.speed);
  const sampleRate = audioBuffer.sampleRate;

  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    Math.ceil(duration * sampleRate),
    sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.playbackRate.setValueAtTime(settings.speed, 0);

  const gainNode = offlineCtx.createGain();
  gainNode.gain.setValueAtTime(settings.volume, 0);

  // Apply Fades
  if (settings.fadeIn > 0 && settings.fadeIn < duration) {
    gainNode.gain.setValueAtTime(0.01, 0);
    gainNode.gain.exponentialRampToValueAtTime(settings.volume, settings.fadeIn);
  }
  if (settings.fadeOut > 0 && settings.fadeOut < duration) {
    const fadeOutStart = duration - settings.fadeOut;
    gainNode.gain.setValueAtTime(settings.volume, fadeOutStart);
    gainNode.gain.exponentialRampToValueAtTime(0.01, duration);
  }

  source.connect(gainNode);
  gainNode.connect(offlineCtx.destination);

  // Start at trimmed offset
  source.start(0, startOffset, duration * settings.speed);
  
  onProgress(40);
  const renderedBuffer = await offlineCtx.startRendering();
  onProgress(85);
  
  const wavBlob = exportAudioBufferToWav(renderedBuffer);
  onProgress(100);
  return wavBlob;
}
