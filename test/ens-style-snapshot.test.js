import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDynamicSVGImage, initializeFont } from '../src/index.js';

// Outputs captured from 1.0.1 before the ens-v2 layout was added. The default
// layouts must keep producing exactly these bytes.
const CASES = [
  {}, { text: 'vitalik.eth' }, { text: 'averyveryverylongensnamethatneedsshrinking.eth', width: 550, height: 550 },
  { text: '你好世界.eth' }, { text: '👨‍👩‍👧‍👦.eth' }, { text: 'a.eth', backgroundColor: '#4F46E5' },
  { text: 'a.eth', backgroundImageUrl: 'data:image/png;base64,iVBOR' }, { text: 'a.eth', backgroundColor: 'transparent' },
  { text: 'a.eth', customElements: ['<g/>'] }, { text: 'vitalik.eth', fitMode: 'exact' },
  { text: 'a', ensStyle: false, width: 400, height: 200 }, { text: 'big', autoFontSize: false, fontSize: 200 },
  { text: 'x.eth', fontFamily: 'Satoshi', fontBase64: 'AAAA', width: 1000, height: 600 },
];

const expected = JSON.parse(fs.readFileSync(new URL('./fixtures/ens-style.snapshot.json', import.meta.url), 'utf8'));
const render = async c => new TextDecoder().decode(await createDynamicSVGImage(c));

test('default layouts are byte-for-byte unchanged (fallback measurement, then Satoshi)', async () => {
  const actual = [];
  for (const c of CASES) actual.push(await render(c));
  const buf = fs.readFileSync(new URL('../assets/Satoshi-Bold.ttf', import.meta.url));
  await initializeFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  for (const c of CASES) actual.push(await render(c));

  assert.equal(actual.length, expected.length);
  actual.forEach((svg, i) => assert.equal(svg, expected[i], `case ${i}: ${JSON.stringify(CASES[i % CASES.length])}`));
});
