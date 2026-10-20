import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script = readFileSync(new URL('../app.mjs',import.meta.url),'utf8');
const styles = readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('size defaults to 8 MB and the only size input is inside the queue header',()=>{
  assert.match(html,/<input id="targetSize"[^>]*value="8"/);
  assert.equal((html.match(/id="targetSize"/g)||[]).length,1);
  assert.ok(html.indexOf('class="preview-top"')<html.indexOf('id="targetSize"'));
  assert.ok(html.indexOf('id="targetSize"')<html.indexOf('class="batch-columns"'));
});
test('compress and cancel are adjacent to target inside queue header, never in upload rail',()=>{
  const head=html.slice(html.indexOf('class="preview-top"'),html.indexOf('class="batch-columns"'));
  assert.match(head,/id="targetSize"/);
  assert.match(head,/id="compressButton"/);
  assert.match(head,/id="cancelButton"/);
  assert.equal((html.match(/id="compressButton"/g)||[]).length,1);
  assert.equal((html.match(/id="cancelButton"/g)||[]).length,1);
});
test('trackpad wheel is blocked only on focused input, and arrow keys remain native',()=>{
  assert.match(script,/els\.target\.addEventListener\('wheel',e=>\{if\(document\.activeElement===els\.target\)e\.preventDefault\(\);\},\{passive:false\}\)/);
  assert.match(html,/id="targetSize" type="number"/);
  assert.doesNotMatch(script,/keydown[^\n]*preventDefault\(\)[^\n]*target/);
});
test('row fill follows real progress and is removed from completed rows',()=>{
  assert.match(script,/state\.active\.percent=shown/);
  assert.match(script,/fill\.style\.transform=`scaleX\(\$\{shown\/100\}\)`/);
  assert.match(script,/if\(item\.status==='working'\) \{/);
  assert.match(styles,/\.batch-item\.is-working>\.row-progress-fill/);
  assert.match(styles,/background:linear-gradient\(90deg,#baf0d2/);
  assert.match(styles,/prefers-reduced-motion:reduce/);
});
