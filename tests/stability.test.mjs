import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseAudioTracks,parseOutputStreams,makePlan,fastArgs,safeDownloadName} from '../codec.mjs';
const js=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('FFmpeg stream indices with PID, language and audio labels are recognized',()=>{
 const text=`Stream #0:0[0x1](und): Video: h264 (Main), yuv420p, 1280x720, 25 fps\nStream #0:1[0x2](eng): Audio: aac (LC), 48000 Hz, stereo, 128 kb/s\nStream #0:2[0x3](spa): Audio: aac (LC), 48000 Hz, stereo, 96 kb/s`;
 assert.deepEqual(parseAudioTracks(text),[{codec:'aac',kbps:128},{codec:'aac',kbps:96}]);
 assert.deepEqual(parseOutputStreams(text),{videoCount:1,videoCodec:'h264',audioCount:2,audioCodecs:['aac','aac']});
});
test('two audio tracks contribute to bitrate and both are mapped',()=>{
 const p=makePlan({duration:24,targetMB:8,originalBytes:56e6,audioTracks:[{codec:'aac',kbps:128},{codec:'aac',kbps:96}]});
 assert.equal(p.audioCount,2);assert.equal(p.audioTotalKbps,224);assert.equal(p.copyAudio,true);
 const args=fastArgs({input:'in.mp4',videoKbps:p.videoKbps,audioKbps:p.audioKbps,copyAudio:p.copyAudio});
 assert.ok(args.includes('0:a?'));assert.ok(!args.includes('0:a:0?'));
});
test('multiple incompatible audio tracks are encoded rather than dropped',()=>{
 const p=makePlan({duration:24,targetMB:8,originalBytes:56e6,audioTracks:[{codec:'aac',kbps:128},{codec:'opus',kbps:128}]});
 assert.equal(p.copyAudio,false);assert.equal(p.audioCount,2);
 const args=fastArgs({input:'in.mkv',videoKbps:p.videoKbps,audioKbps:p.audioKbps});
 assert.ok(args.includes('aac'));
});
test('impossible target with numerous audio tracks is explicitly rejected',()=>{
 assert.throws(()=>makePlan({duration:180,targetMB:0.2,originalBytes:40e6,audioTracks:Array.from({length:5},()=>({codec:'aac',kbps:128}))}),/too small|audio track/i);
});
test('truncated long names are distinct but regular mp4 names unchanged',()=>{
 assert.equal(safeDownloadName('AD1-original.MP4'),'AD1-original.MP4');
 const x='A'.repeat(245)+'-x.mp4',y='A'.repeat(245)+'-y.mp4';
 assert.notEqual(safeDownloadName(x),safeDownloadName(y));
 assert.ok(new TextEncoder().encode(safeDownloadName(x)).length<=230);
});
test('target change preserves prior outputs and offers explicit recompression',()=>{
 const change=js.slice(js.indexOf("els.target.addEventListener('input'"),js.indexOf("['dragenter'"));
 assert.doesNotMatch(change,/releaseOutput|releaseAll|outputBlob=null/);
 assert.match(js,/retry\.textContent=item\.recompress\?'Recompress queued':'Recompress'/);
 assert.match(js,/const previous=item\.outputBlob/);
 assert.match(js,/New compression.*Previous download remains available/);
});
test('output verification probes media and samples decoded frames without mandatory browser timeout',()=>{
 assert.match(js,/async function verifyMedia\(/);
 assert.match(js,/inspectStreams\(ffmpeg,virtualOutput,token\)/);
 assert.match(js,/\['-v','error','-xerror'/);
 assert.doesNotMatch(js,/checkBrowserPlayback\(/);
});
test('closing a populated workspace warns first without revoking files on a canceled leave',()=>{
 const block=js.slice(js.indexOf("window.addEventListener('beforeunload'"));
 assert.match(block,/event\.preventDefault\(\);event\.returnValue=''/);
 assert.match(block,/window\.addEventListener\('pagehide'/);
 assert.doesNotMatch(block.slice(0,block.indexOf("window.addEventListener('pagehide'")),/releaseOutput\(|terminateEngine\(/);
});
test('working CDN versions stay pinned rather than drifting',()=>{
 assert.match(js, /ffmpeg\/0\.12\.15\/umd/);
 assert.match(js, /core@0\.12\.10/);
});
