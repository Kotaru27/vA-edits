import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('working UI starts immediately with file controls rather than decorative intro',()=>{
 assert.doesNotMatch(html,/class="intro"|Smaller video\.|All the important details\./);
 assert.ok(html.indexOf('class="workarea"') < html.indexOf('id="dropzone"'));
 assert.match(css,/\.layout\{width:100%;margin:0 auto;padding:20px /);
});
test('each item owns its quality message with no global quality summary',()=>{
 assert.doesNotMatch(html,/id="planInsight"|id="qualityOutlook"/);
 assert.doesNotMatch(js,/warnings\.slice\(0,2\)/);
 assert.match(js,/quality\.id=`row-quality-\$\{item\.id\}`/);
 assert.match(js,/copy\.append\(name,meta,quality\)/);
 assert.match(js,/node\.replaceChildren\(label,document\.createTextNode\(' · '\+quality\.message\)\)/);
});
test('quality estimate updates on browser metadata, FFmpeg metadata and target changes',()=>{
 assert.match(js,/finish\(\);if\(state\.items\.includes\(item\)\)\{renderQueue\(\);updateOutlook\(\);\}/);
 assert.match(js,/await probeDetails\(ffmpeg,input,item,token\);\s*updateOutlook\(\)/);
 assert.match(js,/releaseAll\(\);for\(const item of state\.items\)[^\n]*\n\s*setError\(''\);renderQueue\(\);updateOutlook\(\)/);
 assert.match(css,/\.item-quality\[data-tone="critical"\]/);
});
test('batch engine, download naming, green progress and 8MB default remain intact',()=>{
 assert.match(html,/id="targetSize"[^>]*value="8"/);
 assert.match(js,/a\.download=safeDownloadName\(item\.file\.name\)/);
 assert.match(js,/fill\.style\.transform=`scaleX\(\$\{shown\/100\}\)`/);
 assert.match(js,/async function compressBatch\(/);
});
