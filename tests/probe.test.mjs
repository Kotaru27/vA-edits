import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseProbeReport} from '../probe.mjs';
const code=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
const normal={streams:[
  {codec_type:'video',codec_name:'h264',width:1920,height:1080,avg_frame_rate:'30000/1001',bit_rate:'4500000'},
  {codec_type:'audio',codec_name:'aac',bit_rate:'128000'},
  {codec_type:'audio',codec_name:'aac',bit_rate:'96000'}],format:{duration:'24.42'}};
test('structured metadata retains video details and all audio tracks without console logs',()=>{
 const x=parseProbeReport(JSON.stringify(normal));
 assert.equal(x.videoCount,1);assert.equal(x.videoCodec,'h264');assert.equal(x.duration,24.42);
 assert.equal(x.width,1920);assert.equal(x.height,1080);
 assert.ok(Math.abs(x.fps-29.97)<0.01);
 assert.deepEqual(x.audioTracks,[{codec:'aac',kbps:128},{codec:'aac',kbps:96}]);
});
test('silent video and omitted bit rates do not invent audio streams',()=>{
 const x=parseProbeReport({streams:[{codec_type:'video',codec_name:'h264',avg_frame_rate:'0/0',duration:'5'}]});
 assert.equal(x.duration,5);assert.equal(x.fps,0);assert.deepEqual(x.audioTracks,[]);
 const y=parseProbeReport({streams:[normal.streams[0],{codec_type:'audio',codec_name:'opus',bit_rate:'N/A'}],format:{duration:'7'}});
 assert.equal(y.audioTracks[0].kbps,0);
});
test('rejects genuinely missing video and malformed FFprobe output',()=>{
 assert.throws(()=>parseProbeReport({streams:[{codec_type:'audio',codec_name:'aac'}]}),/does not contain a video stream/);
 assert.throws(()=>parseProbeReport('{bad json'),/could not be read/);
 assert.throws(()=>parseProbeReport({streams:'bad'}),/incomplete/);
});
test('source inspection uses FFprobe virtual file, with decoded-frame fallback not missing log detection',()=>{
 const src=code.slice(code.indexOf('async function inspectStreams('),code.indexOf('async function encode('));
 assert.match(src,/ffmpeg\.ffprobe\(args\)/);
 assert.match(src,/ffmpeg\.readFile\(infoFile\)/);
 assert.match(src,/parseProbeReport\(/);
 assert.match(src,/\['-hide_banner','-loglevel','info'/);
 assert.match(src,/if\(code!==0\)throw new Error\('The video stream could not be opened or decoded/);
 assert.doesNotMatch(src,/!\/Stream #\.\*Video:\/\.test/);
});
test('output metadata inspection is not dependent on FFmpeg log callback timing',()=>{
 const src=code.slice(code.indexOf('async function verifyMedia('),code.indexOf('async function compressOne('));
 assert.match(src,/inspectStreams\(ffmpeg,virtualOutput,token\)/);
 assert.match(src,/ffmpeg\.exec\(sample\)/);
 assert.doesNotMatch(src,/parseOutputStreams\(state\.log\)/);
});
