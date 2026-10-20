import test from 'node:test';
import assert from 'node:assert/strict';
import {MB,MIB,makePlan,passArgs,parseDuration,parseVideoInfo,parseAudioInfo,formatBytes,safeDownloadName,fastArgs,retryBitrate,shouldRetry} from '../codec.mjs';

test('computes a size-aware bitrate with audio and container reserve',()=>{
  const p = makePlan({duration:60,targetMB:10,originalBytes:100*MIB,width:1920,height:1080,fps:30});
  assert.ok(p.videoKbps > 1000);
  assert.equal(p.audioKbps,160);
  assert.ok((p.videoKbps*1000+p.audioKbps*1000)*60/8 < 10*MB);
});
test('no-audio source does not waste budget on audio',()=>{
  const p = makePlan({duration:20,targetMB:2,originalBytes:10*MIB,audioPresent:false});
  assert.equal(p.audioKbps,0);
  assert.ok(p.videoKbps > 0);
});
test('rejects impossible and invalid targets',()=>{
  assert.throws(()=>makePlan({duration:120,targetMB:0.1,originalBytes:20*MIB}),/too small/i);
  assert.throws(()=>makePlan({duration:60,targetMB:15,originalBytes:10*MIB}),/smaller/);
  assert.throws(()=>makePlan({duration:0,targetMB:1}),/duration/);
  assert.throws(()=>makePlan({duration:5,targetMB:-1}),/target/);
});
test('pass one discards audio and video while collecting x264 stats',()=>{
  const args=passArgs({input:'input.mp4',videoKbps:2000,audioKbps:128,pass:1});
  assert.ok(args.includes('libx264')); assert.ok(args.includes('null')); assert.ok(args.includes('-an')); assert.ok(args.includes('ratepass'));
});
test('pass two outputs compatible MP4 with AAC and preserves timing',()=>{
  const args=passArgs({input:'input.mp4',videoKbps:2000,audioKbps:128,pass:2});
  assert.ok(args.includes('yuv420p')); assert.ok(args.includes('aac')); assert.ok(args.includes('+faststart')); assert.ok(!args.includes('-r'));
});
test('supports video without an audio stream',()=>{
  const args=passArgs({input:'input.mp4',videoKbps:450,audioKbps:0,pass:2,audioPresent:false});
  assert.ok(args.includes('-an')); assert.ok(!args.includes('aac'));
});
test('parses ffmpeg probe durations and video info',()=>{
  const log='Duration: 00:01:12.59, start: 0.000, bitrate: 2300 kb/s\n Stream #0:0: Video: h264 (High), yuv420p, 1920x1080, 29.97 fps';
  assert.equal(parseDuration(log),72.59);
  assert.deepEqual(parseVideoInfo(log),{width:1920,height:1080,fps:29.97});
});
test('blocks filename injection and shapes output name',()=>{
  assert.equal(safeDownloadName('abc weird?.mkv'),'abc weird_.mp4');
  assert.throws(()=>passArgs({input:'../../secret.mp4',videoKbps:2000,audioKbps:96,pass:1}),/filename/);
});
test('retry logic shrinks overshooting bitrate once',()=>{
  assert.equal(shouldRetry(13*MB,10*MB,1),true);
  assert.equal(shouldRetry(13*MB,10*MB,2),false);
  assert.ok(retryBitrate(1300,10*MB,13*MB)<1300);
});
test('byte formatting is human readable',()=>assert.equal(formatBytes(1000*1000),'1.00 MB'));

test('copies original compatible AAC track when it fits the size budget',()=>{
  const plan=makePlan({duration:20,targetMB:8,originalBytes:30*MIB,sourceAudio:{codec:'aac',kbps:128}});
  assert.equal(plan.copyAudio,true);
  assert.equal(plan.audioKbps,128);
  const args=passArgs({input:'input.mp4',videoKbps:plan.videoKbps,audioKbps:128,pass:2,copyAudio:true});
  assert.ok(args.includes('copy'));
  assert.ok(!args.includes('-b:a'));
});
test('re-encodes source audio when source codec is incompatible or over budget',()=>{
  const p=makePlan({duration:20,targetMB:3,originalBytes:30*MIB,sourceAudio:{codec:'opus',kbps:160}});
  assert.equal(p.copyAudio,false);
  const q=makePlan({duration:20,targetMB:3,originalBytes:30*MIB,sourceAudio:{codec:'aac',kbps:320}});
  assert.equal(q.copyAudio,false);
});
test('parses AAC bitrate from FFmpeg logs',()=>{
  assert.deepEqual(parseAudioInfo(' Stream #0:1(eng): Audio: aac (LC), 48000 Hz, stereo, fltp, 124 kb/s'),{codec:'aac',kbps:124});
});

test('MP4 output keeps the original filename exactly, including capitalization and spaces',()=>{
 assert.equal(safeDownloadName('My Vacation Final.MP4'),'My Vacation Final.MP4');
 assert.equal(safeDownloadName('meeting.mp4'),'meeting.mp4');
 assert.equal(safeDownloadName('interview.mov'),'interview.mp4');
 assert.equal(safeDownloadName('movie.avi'),'movie.mp4');
 assert.equal(safeDownloadName('../not-safe.mp4'),'not-safe.mp4');
 assert.equal(safeDownloadName('video'),'video.mp4');
});
test('fast encoding is single pass and does not change source timing',()=>{
 const args=fastArgs({input:'input.mp4',output:'compressed.mp4',videoKbps:1200,audioKbps:128});
 assert.ok(args.includes('veryfast'));
 assert.ok(!args.includes('-pass'));assert.ok(!args.includes('-r'));
 assert.ok(args.includes('-maxrate'));assert.ok(args.includes('yuv420p'));
 assert.ok(args.includes('+faststart'));assert.ok(args.includes('aac'));
});
test('fast encoding supports silent video and lossless AAC stream copying',()=>{
 const silence=fastArgs({input:'input.mkv',videoKbps:800,audioKbps:0,audioPresent:false});
 assert.ok(silence.includes('-an'));assert.ok(!silence.includes('aac'));
 const copied=fastArgs({input:'input.mp4',videoKbps:800,audioKbps:128,copyAudio:true});
 assert.ok(copied.includes('copy'));assert.ok(!copied.includes('-b:a'));
 assert.throws(()=>fastArgs({input:'../../oops.mp4',videoKbps:800,audioKbps:96}),/filename/);
});
