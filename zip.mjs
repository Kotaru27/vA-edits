// Streaming-CRC ZIP (store only) for browser downloads. Video files are already compressed.
// No external library, double-compression, or permanent video byte duplication.
const enc = new TextEncoder();
const table = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }

export async function crc32(blob) {
  let crc = -1;
  const reader = blob.stream().getReader();
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      for (let i = 0; i < value.length; i++) crc = table[(crc ^ value[i]) & 255] ^ (crc >>> 8);
    }
  } finally { reader.releaseLock(); }
  return (crc ^ -1) >>> 0;
}
const u16 = (data, off, v) => data.setUint16(off, v, true);
const u32 = (data, off, v) => data.setUint32(off, v >>> 0, true);
const MAX_ZIP_BYTES = 300 * 1_000_000;
export const MAX_BATCH_ZIP_BYTES = MAX_ZIP_BYTES;

export async function makeZip(entries) {
  if (!entries.length) throw new Error('No completed videos are available to download.');
  if (entries.length > 30) throw new Error('Too many files for one ZIP.');
  if (entries.some(e => !(e.blob instanceof Blob))) throw new Error('Invalid video data.');
  const total = entries.reduce((sum,e) => sum + e.blob.size, 0);
  if (total > MAX_ZIP_BYTES) throw new Error('This batch is too large for a single ZIP. Download its videos individually.');
  const parts = [], central = [], seen = new Set();
  let offset = 0;
  for (const {name,blob} of entries) {
    let safe = String(name).replace(/[\/\x00-\x1f]/g, '_').trim() || 'video.mp4';
    // ZIP archives cannot contain two items at an identical path. Only duplicate
    // archive entries get suffixes; individual downloaded filenames stay original.
    if (seen.has(safe.toLowerCase())) {
      const pos = safe.lastIndexOf('.'); const stem = pos > 0 ? safe.slice(0,pos) : safe;
      const ext = pos > 0 ? safe.slice(pos) : '';
      let n = 2;
      while (seen.has(`${stem} (${n})${ext}`.toLowerCase())) n++;
      safe = `${stem} (${n})${ext}`;
    }
    seen.add(safe.toLowerCase());
    const nameBytes = enc.encode(safe);
    if (nameBytes.length > 65535 || blob.size > 0xffffffff) throw new Error('File is too large for standard ZIP.');
    const crc = await crc32(blob);
    const local = new Uint8Array(30 + nameBytes.length), l = new DataView(local.buffer);
    u32(l,0,0x04034b50); u16(l,4,20); u16(l,6,0x0800); u16(l,8,0);
    u32(l,14,crc); u32(l,18,blob.size); u32(l,22,blob.size); u16(l,26,nameBytes.length);
    local.set(nameBytes,30);
    parts.push(local, blob);
    const cd = new Uint8Array(46 + nameBytes.length), d = new DataView(cd.buffer);
    u32(d,0,0x02014b50); u16(d,4,20); u16(d,6,20); u16(d,8,0x0800);
    u32(d,16,crc); u32(d,20,blob.size); u32(d,24,blob.size); u16(d,28,nameBytes.length);
    u32(d,42,offset); cd.set(nameBytes,46); central.push(cd);
    offset += local.length + blob.size;
  }
  const centralSize = central.reduce((sum,p)=>sum+p.length,0);
  const tail = new Uint8Array(22), d = new DataView(tail.buffer);
  u32(d,0,0x06054b50); u16(d,8,central.length); u16(d,10,central.length);
  u32(d,12,centralSize); u32(d,16,offset);
  return new Blob([...parts,...central,tail],{type:'application/zip'});
}
