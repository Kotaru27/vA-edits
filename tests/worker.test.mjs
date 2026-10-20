import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../video-worker.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.mjs', import.meta.url), 'utf8');

function fakeCore(capture) {
  const fs = new Map();
  return {
    ret: 0,
    setLogger(callback) { this.log = callback; },
    setProgress(callback) { this.progress = callback; },
    setTimeout(v) { capture.timeout = v; },
    exec(...args) { capture.commands.push(args); this.log({type:'stderr',message:'fake encode'}); },
    ffprobe(...args) { capture.commands.push(args); },
    reset() { capture.resets++; },
    FS: {
      writeFile(path, data) { fs.set(path, data); },
      readFile(path) { return fs.get(path); },
      unlink(path) { fs.delete(path); },
    }
  };
}
function instance({classic = true, failClassic = false} = {}) {
  const capture = {commands:[], resets:0, timeout:null, loads:[]};
  const outgoing = [];
  const engine = fakeCore(capture);
  const self = {
    postMessage(data, transfer = []) { outgoing.push({data,transfer}); },
    createFFmpegCore: undefined
  };
  const context = {self, Uint8Array, btoa, Error, console};
  if (classic) context.importScripts = (url) => {
    capture.classicURL = url;
    if (failClassic) throw new TypeError('importScripts forbidden in module worker');
    self.createFFmpegCore = async (config) => { capture.loads.push(config); return engine; };
  };
  const script = new vm.Script(code, {
    filename:'video-worker.js',
    importModuleDynamically: (specifier) => import(specifier)
  });
  script.runInNewContext(context);
  return {self,capture,outgoing,engine};
}
function last(result) { return result.outgoing.at(-1).data; }

const esmURL = `data:text/javascript,${encodeURIComponent(`export default async function make(config) {
 globalThis.__videoWorkerTest?.(config);
 return {
  ret:0, setLogger() {}, setProgress() {}, setTimeout() {}, exec() {}, reset() {},
  FS: {writeFile(){}, readFile(){return new Uint8Array([5,6])}, unlink(){}}
 };
}`)}`;

test('self-hosted worker uses direct classic importScripts, handles real FFmpeg message types', async () => {
  const w = instance();
  await w.self.onmessage({data:{id:1,type:'LOAD',data:{coreURL:'blob:original-core',wasmURL:'blob:wasm'}}});
  assert.equal(last(w).type,'LOAD');
  assert.equal(last(w).data,true);
  assert.equal(w.capture.classicURL,'blob:original-core');
  assert.match(w.capture.loads[0].mainScriptUrlOrBlob,/^blob:original-core#/);
  const encoded = w.capture.loads[0].mainScriptUrlOrBlob.split('#')[1];
  assert.equal(JSON.parse(atob(encoded)).wasmURL,'blob:wasm');
  await w.self.onmessage({data:{id:2,type:'WRITE_FILE',data:{path:'clip.mp4',data:new Uint8Array([1,2,3])}}});
  assert.equal(last(w).data,true);
  await w.self.onmessage({data:{id:3,type:'READ_FILE',data:{path:'clip.mp4',encoding:'binary'}}});
  assert.deepEqual([...last(w).data],[1,2,3]);
  assert.equal(w.outgoing.at(-1).transfer.length,1);
  await w.self.onmessage({data:{id:4,type:'EXEC',data:{args:['-version'],timeout:12000}}});
  assert.equal(last(w).type,'EXEC');
  assert.equal(last(w).data,0);
  assert.equal(w.capture.timeout,12000);
  assert.deepEqual(w.capture.commands,[['-version']]);
  assert.equal(w.capture.resets,1);
  assert.ok(w.outgoing.some(m => m.data.type==='LOG'));
  await w.self.onmessage({data:{id:5,type:'DELETE_FILE',data:{path:'clip.mp4'}}});
  assert.equal(last(w).data,true);
});

test('worker rejects bad commands with the FFmpeg error response rather than crashing', async () => {
  const w = instance();
  await w.self.onmessage({data:{id:6,type:'EXEC',data:{args:[]}}});
  assert.equal(last(w).type,'ERROR');
  assert.match(last(w).data,/not loaded/i);
  await w.self.onmessage({data:{id:7,type:'LOAD',data:{coreURL:'blob:umd',wasmURL:'blob:wasm'}}});
  await w.self.onmessage({data:{id:8,type:'UNKNOWN',data:{}}});
  assert.equal(last(w).type,'ERROR');
  assert.match(last(w).data,/Unknown video engine command/);
});

test('module worker uses native import for the ESM core without webpack require', async () => {
  const w = instance({classic:false});
  let captured;
  globalThis.__videoWorkerTest = config => { captured = config; };
  try {
    await w.self.onmessage({data:{id:9,type:'LOAD',data:{coreURL:'blob:umd',moduleCoreURL:esmURL,wasmURL:'blob:wasm'}}});
    assert.equal(last(w).type,'LOAD', last(w).data);
    assert.equal(last(w).data,true);
    assert.match(captured.mainScriptUrlOrBlob,/^data:text\/javascript,/);
    await w.self.onmessage({data:{id:10,type:'READ_FILE',data:{path:'test',encoding:'binary'}}});
    assert.deepEqual([...last(w).data],[5,6]);
  } finally { delete globalThis.__videoWorkerTest; }
});

test('GitHub Pages worker URL is relative to the JS module; no bundled 814 worker remains', () => {
  assert.match(app,/new URL\('\.\/video-worker\.js', import\.meta\.url\)\.href/);
  assert.match(app,/classWorkerURL: CLASS_WORKER_URL/);
  assert.match(app,/moduleCoreURL/);
  assert.doesNotMatch(app,/urlToBlobURL\(`\$\{WRAPPER_CDN\}\/814\.ffmpeg/);
  assert.doesNotMatch(code,/__webpack_require__|webpackChunk|require\(/);
});
