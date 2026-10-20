/*
 * Standalone FFmpeg worker for the static GitHub Pages build.
 * Implements the message protocol used by @ffmpeg/ffmpeg 0.12.x.
 * Avoids the Webpack-bundled worker's dynamic module lookup for a blob: URL.
 * Upstream protocol: https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/packages/ffmpeg/src/worker.ts
 */
'use strict';

let engine;

async function load({coreURL, moduleCoreURL, wasmURL, workerURL}) {
  const first = !engine;
  if (engine) return false;
  let factory;
  let loadedCoreURL = coreURL;
  let classicError;

  // Classic workers can load the UMD FFmpeg core using native importScripts.
  // Module workers prohibit importScripts and must use the native ESM import.
  if (typeof importScripts === 'function') {
    try {
      importScripts(coreURL);
      factory = self.createFFmpegCore;
    } catch (error) {
      classicError = error;
    }
  }
  if (typeof factory !== 'function') {
    if (!moduleCoreURL) throw new Error('The FFmpeg module core URL is missing.');
    try {
      const module = await import(moduleCoreURL);
      factory = module.default;
      loadedCoreURL = moduleCoreURL;
    } catch (error) {
      throw new Error(`Cannot load the video core${classicError ? ' via classic worker or ESM' : ''}: ${String(error)}`);
    }
  }
  if (typeof factory !== 'function') throw new Error('Video core did not provide an encoder factory.');

  const resolvedWasmURL = wasmURL || loadedCoreURL.replace(/\.js(?:\?.*)?$/, '.wasm');
  const resolvedWorkerURL = workerURL || loadedCoreURL.replace(/\.js(?:\?.*)?$/, '.worker.js');
  engine = await factory({
    mainScriptUrlOrBlob: `${loadedCoreURL}#${btoa(JSON.stringify({wasmURL: resolvedWasmURL, workerURL: resolvedWorkerURL}))}`
  });
  engine.setLogger(data => self.postMessage({type: 'LOG', data}));
  engine.setProgress(data => self.postMessage({type: 'PROGRESS', data}));
  return first;
}

function command(type, data) {
  if (!engine) throw new Error('FFmpeg engine is not loaded.');
  switch (type) {
    case 'EXEC':
    case 'FFPROBE': {
      engine.setTimeout(data.timeout ?? -1);
      if (type === 'EXEC') engine.exec(...data.args);
      else engine.ffprobe(...data.args);
      const result = engine.ret;
      engine.reset();
      return result;
    }
    case 'WRITE_FILE': engine.FS.writeFile(data.path, data.data); return true;
    case 'READ_FILE': return engine.FS.readFile(data.path, {encoding: data.encoding});
    case 'DELETE_FILE': engine.FS.unlink(data.path); return true;
    case 'RENAME': engine.FS.rename(data.oldPath, data.newPath); return true;
    case 'CREATE_DIR': engine.FS.mkdir(data.path); return true;
    case 'DELETE_DIR': engine.FS.rmdir(data.path); return true;
    case 'LIST_DIR': return engine.FS.readdir(data.path).map(name => {
      const stat = engine.FS.stat(`${data.path}/${name}`);
      return {name, isDir: engine.FS.isDir(stat.mode)};
    });
    case 'MOUNT': {
      const fs = engine.FS.filesystems[data.fsType];
      if (!fs) return false;
      engine.FS.mount(fs, data.options, data.mountPoint);
      return true;
    }
    case 'UNMOUNT': engine.FS.unmount(data.mountPoint); return true;
    default: throw new Error(`Unknown video engine command: ${type}`);
  }
}

self.onmessage = async ({data: message}) => {
  const {id, type, data = {}} = message;
  try {
    const result = type === 'LOAD' ? await load(data) : command(type, data);
    const transfers = result instanceof Uint8Array ? [result.buffer] : [];
    self.postMessage({id, type, data: result}, transfers);
  } catch (error) {
    self.postMessage({id, type: 'ERROR', data: error instanceof Error ? error.message : String(error)});
  }
};
