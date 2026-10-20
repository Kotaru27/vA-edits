import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMp4 } from '../codec.mjs';
function box(type, body = new Uint8Array()) {
  const bytes = new Uint8Array(8 + body.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length);
  for (let i = 0; i < 4; i++) bytes[4+i] = type.charCodeAt(i);
  bytes.set(body,8);
  return bytes;
}
function mp4() {
  const parts=[box('ftyp',new Uint8Array([0,0,0,0])),box('moov',new Uint8Array([0,0,0,0])),box('mdat',new Uint8Array([1,2,3,4,5,6,7,8]))];
  const bytes = new Uint8Array(parts.reduce((n,x)=>n+x.length,0));
  let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
  return bytes;
}
test('accepts complete MP4 box structure',()=>assert.equal(validateMp4(mp4()),true));
test('rejects missing movie metadata even with ftyp and media',()=>{
  const b=mp4();b[16]=102;b[17]=114;b[18]=101;b[19]=101;
  assert.throws(()=>validateMp4(b),/missing/i);
});
test('rejects incomplete/truncated final atom',()=>assert.throws(()=>validateMp4(mp4().subarray(0,mp4().length-1)),/damaged/i));
test('rejects an MP4 missing media payload',()=>{
  const b=mp4();const pos=12+12;
  b[pos+7]=8; // media data begins after an 8-byte header, length now 8
  // explicitly replace the mdat header length and trim trailing media bytes
  const shorter=b.subarray(0,pos+8);
  new DataView(shorter.buffer,shorter.byteOffset).setUint32(pos,8);
  assert.throws(()=>validateMp4(shorter),/missing/i);
});
test('rejects non-MP4 output and bad box size',()=>{
  const b=mp4();b[4]=0;assert.throws(()=>validateMp4(b),/not an MP4/i);
  const c=mp4();new DataView(c.buffer).setUint32(0,9999);assert.throws(()=>validateMp4(c),/damaged/i);
});
