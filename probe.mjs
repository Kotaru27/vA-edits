/** Parse structured FFprobe output written to FFmpeg's virtual filesystem.
 * Console log messages are diagnostic only: they are not a reliable metadata API.
 */
function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : NaN;
}
function frameRate(value) {
  if (typeof value !== 'string') return 0;
  const [n, d] = value.split('/').map(Number);
  const rate = d === undefined ? n : (d > 0 ? n / d : 0);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}
export function parseProbeReport(source) {
  let json;
  try { json = typeof source === 'string' ? JSON.parse(source) : source; }
  catch { throw new Error('Video metadata could not be read.'); }
  if (!json || !Array.isArray(json.streams)) throw new Error('Video metadata is incomplete.');
  const videos = json.streams.filter(s => s && s.codec_type === 'video');
  const audios = json.streams.filter(s => s && s.codec_type === 'audio');
  const primary = videos[0];
  if (!primary) throw new Error('This file does not contain a video stream.');
  const duration = positiveNumber(json.format?.duration) || positiveNumber(primary.duration);
  return {
    duration, width: Math.max(0, Number(primary.width) || 0),
    height: Math.max(0, Number(primary.height) || 0),
    fps: frameRate(primary.avg_frame_rate) || frameRate(primary.r_frame_rate),
    videoCount: videos.length, videoCodec: String(primary.codec_name || '').toLowerCase(),
    audioTracks: audios.map(s => ({codec: String(s.codec_name || '').toLowerCase(),
      kbps: Number.isFinite(positiveNumber(s.bit_rate)) ? positiveNumber(s.bit_rate) / 1000 : 0}))
  };
}
