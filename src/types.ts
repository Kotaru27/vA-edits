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
  resolutionScale: number; // 0.5 to 1.0
  audioMuted: boolean;
  qualityMode: 'speed' | 'balanced' | 'high';
}

export type AudioFormat = 'mp3' | 'wav' | 'm4a' | 'ogg' | 'flac';

export interface AudioConverterSettings {
  targetFormat: AudioFormat;
  bitrate: number; // in kbps
  sampleRate: number; // 48000, 44100, 32000
  channels: 1 | 2; // 1 mono, 2 stereo
  volumeBoost: number; // 1.0 to 3.0
  fadeInSeconds: number;
  fadeOutSeconds: number;
  reverse: boolean;
}

export type AspectRatio = 'free' | '16:9' | '9:16' | '1:1' | '4:3';

export interface CropBox {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
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
  speed: number; // 0.5 to 2.0
  pitchShift: number; // semitones -12 to +12
}

export interface ProcessingState {
  status: 'idle' | 'processing' | 'success' | 'error';
  progress: number; // 0 to 100
  message: string;
  outputUrl?: string;
  outputName?: string;
  outputSize?: number;
  originalSize?: number;
  timeTakenMs?: number;
}
