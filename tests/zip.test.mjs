import test from 'node:test';
import assert from 'node:assert/strict';
import { makeZip, crc32, MAX_BATCH_ZIP_BYTES } from '../zip.mjs';

test('ZIP CRC-32 matches known vector', async()=>{assert.equal(await crc32(new Blob(['123456789'])),0xcbf43926);});
test('ZIP is a valid archive with UTF-8 names and data',async()=>{
 const zip=await makeZip([
  {name:'café.mp4',blob:new Blob(['video one'])},
  {name:'café.mp4',blob:new Blob(['video two'])},
  {name:'sample.mp4',blob:new Blob(['third'])}
 ]);
 const b=new Uint8Array(await zip.arrayBuffer());
 assert.equal(new DataView(b.buffer).getUint32(0,true),0x04034b50);
 assert.equal(new DataView(b.buffer).getUint32(b.length-22,true),0x06054b50);
 assert.equal(new DataView(b.buffer).getUint16(b.length-12,true),3);
 assert.ok(zip.size > 30);
});
test('ZIP rejects empty or oversize batch',async()=>{
 await assert.rejects(makeZip([]),/No completed/);
 assert.equal(MAX_BATCH_ZIP_BYTES,300_000_000);
});
