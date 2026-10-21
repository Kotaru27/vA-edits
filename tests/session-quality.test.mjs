import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseEncodingStrategy,makePlan,fastArgs,passArgs} from '../codec.mjs';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('five-video session limit, fixed after processing begins',()=>{
  assert.match(app,/const MAX_FILES = 5;/);
  assert.match(app,/state\.sessionStarted=true/);
  assert.match(app,/if\(state\.sessionStarted\)\{setError\(/);
  assert.match(app,/els\.input\.disabled=state\.busy \|\| state\.zipBusy \|\| state\.sessionStarted/);
  assert.match(html,/up to 5 per session/);
});
test('constrained videos use quality-focused two-pass on capable devices',()=>{
  const p=makePlan({duration:24,targetMB:8,originalBytes:56e6,width:1920,height:1080,fps:30,audioTracks:[{codec:'aac',kbps:128}]});
  assert.equal(chooseEncodingStrategy(p,{duration:24,sourceBytes:56e6,deviceMemory:8}).twoPass,true);
  const args=passArgs({input:'input.mp4',videoKbps:p.videoKbps,audioKbps:p.audioKbps,pass:2});
  assert.ok(args.includes('-pass')); assert.ok(args.includes('0:a?'));
});
test('large or low-memory videos avoid slow two-pass workload',()=>{
  const plan={bpp:0.025,videoKbps:450};
  assert.equal(chooseEncodingStrategy(plan,{duration:24,sourceBytes:56e6,deviceMemory:2}).twoPass,false);
  assert.equal(chooseEncodingStrategy(plan,{duration:180,sourceBytes:56e6,deviceMemory:8}).twoPass,false);
  assert.equal(chooseEncodingStrategy(plan,{duration:24,sourceBytes:220e6,deviceMemory:8}).twoPass,false);
  assert.ok(fastArgs({input:'input.mp4',videoKbps:450,audioKbps:96,preset:'fast'}).includes('fast'));
  assert.throws(()=>fastArgs({input:'input.mp4',videoKbps:450,audioKbps:96,preset:'ultrafast'}),/preset/);
});
test('completed originals and workers are handled safely',()=>{
  assert.match(app,/Original MP4 retained byte for byte/);
  assert.match(app,/const bytes=new Uint8Array\(await item\.file\.arrayBuffer\(\)\);validateMp4\(bytes\)/);
  assert.match(app,/terminateEngine\(\);\s*state\.busy=false/);
  assert.match(app,/Download results before refreshing for a new batch/);
});

test('already-small original MP4 receives a positive outlook instead of a false error',()=>{
  assert.match(app,/Already within target; original MP4 can be kept unchanged/);
  assert.match(app,/select a smaller size to convert this file to MP4/);
});
