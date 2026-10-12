import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDynamicSVGImage, calculateFontSize, initializeFont } from '../src/index.js';

const LOGO_START = 'M42.7634 487.399C42.6074';
const round3 = v => +v.toFixed(3);

before(async () => {
  const buf = fs.readFileSync(new URL('../assets/Satoshi-Bold.ttf', import.meta.url));
  await initializeFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
});

async function v2(opts) {
  return new TextDecoder().decode(await createDynamicSVGImage({ layout: 'ens-v2', ...opts }));
}

// Same inputs the layout passes: 12 min, 60 max, no height cap.
const expectedSize = (text, textAreaWidth) => calculateFontSize(text, textAreaWidth, null, 12, 60);

function parse(svg) {
  const label = svg.match(/<rect x="74" y="420" width="([\d.]+)" height="88" rx="6" fill="([^"]+)"\/>/);
  const accent = svg.match(/<rect x="([\d.]+)" y="388" width="32" height="32" rx="6" fill="([^"]+)"\/>/);
  const text = svg.match(/<text x="91" y="484" font-size="(\d+)px" fill="([^"]+)"[^>]*>([^<]*)<\/text>/);
  const group = svg.match(/<g transform="translate\(0 ([\d.e-]+)\) scale\(([\d.]+)\)">/);
  return {
    labelWidth: label && Number(label[1]), labelFill: label?.[2],
    accentX: accent && Number(accent[1]), accentFill: accent?.[2],
    fontSize: text && Number(text[1]), textFill: text?.[2], text: text?.[3],
    translateY: group && Number(group[1]), scale: group && Number(group[2]),
  };
}

test('tanrikulu.eth at 550: tile, logo, label, name and accent square in place', async () => {
  const svg = await v2({ text: 'tanrikulu.eth' });
  const p = parse(svg);
  const { fontSize, metrics } = await expectedSize('tanrikulu.eth', 398);

  assert.ok(svg.includes('<rect x="12" y="478" width="60" height="60" rx="6" fill="#F6FBFD"/>'));
  assert.match(svg, new RegExp(`<path fill-rule="evenodd" clip-rule="evenodd" d="${LOGO_START}[^"]+" fill="#0082BB"/>`));
  assert.equal(p.text, 'tanrikulu.eth');
  assert.equal(p.fontSize, fontSize);
  assert.equal(p.fontSize, 60, 'short names render at the calibrated maximum');
  assert.equal(p.textFill, '#F6FBFD');
  assert.equal(p.labelFill, '#0082BB');
  assert.equal(p.labelWidth, round3(34 + metrics.width));
  assert.equal(p.accentX, round3(74 + p.labelWidth));
  assert.equal(p.accentFill, '#F6FBFD');
  assert.equal(p.translateY, 0);
  assert.equal(p.scale, 1);
  assert.ok(!/<text[^>]*filter=/.test(svg), 'name has no filter');
  assert.ok(!svg.includes('dropShadow'));
});

test('long name shrinks to calculateFontSize result and label stays inside 550 - 12 - 32', async () => {
  const text = 'averyveryverylongensnamethatneedsshrinking.eth';
  const p = parse(await v2({ text }));
  const { fontSize } = await expectedSize(text, 398);
  assert.equal(p.fontSize, fontSize);
  assert.ok(p.fontSize < 60);
  assert.ok(p.accentX <= 550 - 12 - 32, `label right edge ${p.accentX}`);
});

test('international and CJK names use 85% of the width', async () => {
  for (const text of ['你好世界你好世界你好世界你好世界.eth', 'приветприветприветприветпривет.eth']) {
    const p = parse(await v2({ text }));
    const narrow = await expectedSize(text, 398 * 0.85);
    const full = await expectedSize(text, 398);
    assert.equal(p.fontSize, narrow.fontSize, text);
    assert.ok(narrow.fontSize < full.fontSize, `${text}: width must actually bind`);
    assert.ok(p.accentX <= 506);
  }
});

test('avatar: one <image> with fixed attribute order, no old-layout decoration', async () => {
  const url = 'data:image/png;base64,iVBORw0KGgo=';
  const svg = await v2({ text: 'a.eth', backgroundImageUrl: url, backgroundMarkup: '<g id="weave"/>' });
  const images = svg.match(/<image [^>]*>/g);
  assert.deepEqual(images, [`<image href="${url}" width="550" height="550" preserveAspectRatio="xMidYMid slice"/>`]);
  assert.ok(!svg.includes('weave'), 'avatar wins over backgroundMarkup');
  assert.ok(!svg.includes('fill="#000"'), 'no overlay rect');
  assert.ok(!svg.includes('fill-opacity'));
  assert.ok(!svg.includes('M38.0397'), 'no old logo');
  assert.ok(!svg.includes('linearGradient'));
  assert.ok(!svg.includes('filter'));
  assert.ok(!svg.includes('<rect width="550" height="550"'), 'no solid background under the avatar');
});

test('non-data avatar URLs are ignored, never fetched', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('must not fetch'); };
  try {
    const svg = await v2({ text: 'a.eth', backgroundImageUrl: 'https://example.com/a.png' });
    assert.ok(!svg.includes('<image'));
    assert.ok(svg.includes('<rect width="550" height="550" fill="#F6FBFD"/>'));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('backgroundMarkup is inserted verbatim before the card group', async () => {
  const markup = '<g id="weave"><rect x="8" y="8" width="38" height="87" rx="10.7" fill="#80C4E0"/></g>';
  const svg = await v2({ text: 'a.eth', backgroundMarkup: markup });
  assert.ok(svg.includes(markup));
  assert.ok(svg.indexOf(markup) < svg.indexOf('<g transform='));
  assert.ok(!svg.includes('<rect width="550" height="550"'));
});

test('solid background: default #F6FBFD, backgroundColor overrides, transparent omits it', async () => {
  assert.ok((await v2({ text: 'a.eth' })).includes('<rect width="550" height="550" fill="#F6FBFD"/>'));
  assert.ok((await v2({ text: 'a.eth', backgroundColor: '#112233' })).includes('<rect width="550" height="550" fill="#112233"/>'));
  assert.ok((await v2({ text: 'a.eth', backgroundColor: [1, 2, 3, 0.5] })).includes('fill="rgba(1, 2, 3, 0.5)"'));
  assert.ok(!(await v2({ text: 'a.eth', backgroundColor: 'transparent' })).includes('<rect width="550"'));
});

test('colors option overrides label, accent and logo', async () => {
  const svg = await v2({ text: 'a.eth', colors: { label: '#111111', accent: '#222222', logo: '#333333' } });
  const p = parse(svg);
  assert.equal(p.labelFill, '#111111');
  assert.equal(p.textFill, '#222222');
  assert.equal(p.accentFill, '#222222');
  assert.ok(svg.includes('<rect x="12" y="478" width="60" height="60" rx="6" fill="#222222"/>'));
  assert.match(svg, /d="M42\.7634[^"]+" fill="#333333"/);
  // partial override keeps the other defaults
  const q = parse(await v2({ text: 'a.eth', colors: { accent: '#222222' } }));
  assert.equal(q.labelFill, '#0082BB');
});

test('1000 × 1000: scaled group, same design-space label limit', async () => {
  const text = 'averyveryverylongensnamethatneedsshrinking.eth';
  const svg = await v2({ text, width: 1000, height: 1000 });
  const p = parse(svg);
  assert.ok(svg.includes(`<g transform="translate(0 0) scale(${1000 / 550})">`));
  assert.ok(svg.includes('<rect width="1000" height="1000" fill="#F6FBFD"/>'));
  assert.equal(p.fontSize, (await expectedSize(text, 398)).fontSize);
  assert.ok(p.accentX <= 506);
});

test('1000 × 600: scale by the short edge, label may grow to width / k', async () => {
  const text = 'averyveryverylongensnamethatneedsshrinking.eth';
  const k = 600 / 550;
  const svg = await v2({ text, width: 1000, height: 600 });
  const p = parse(svg);
  assert.ok(svg.includes(`<g transform="translate(0 ${600 - 550 * k}) scale(${k})">`));
  assert.ok(svg.includes('<rect width="1000" height="600" fill="#F6FBFD"/>'));
  const wide = await expectedSize(text, 1000 / k - 152);
  assert.equal(p.fontSize, wide.fontSize);
  assert.ok(wide.fontSize > (await expectedSize(text, 398)).fontSize, 'wide card allows a bigger name');
  assert.ok(p.accentX <= 1000 / k - 12 - 32);
});

test('600 × 1000: anchored bottom-left', async () => {
  const k = 600 / 550;
  const svg = await v2({ text: 'a.eth', width: 600, height: 1000 });
  assert.ok(svg.includes(`<g transform="translate(0 ${1000 - 550 * k}) scale(${k})">`));
});

test('customElements paint on top, fonts and text style are embedded', async () => {
  const svg = await v2({ text: 'a.eth', customElements: ['<g id="badge"/>'], fontFamily: 'Satoshi', fontBase64: 'AAAA' });
  assert.ok(svg.indexOf('<g id="badge"/>') > svg.indexOf('</g>'));
  assert.ok(svg.includes('src: url(data:font/truetype;base64,AAAA);'));
  assert.ok(svg.includes("font-family: 'Satoshi', sans-serif, 'Noto Color Emoji', 'Apple Color Emoji';"));
  assert.ok(svg.includes('font-variant-numeric: tabular-nums;'));
  assert.ok(svg.includes('font-feature-settings: "ss01" on, "ss03" on;'));
});

test('maxFontSize and fitMode are honoured; returns Uint8Array', async () => {
  assert.equal(parse(await v2({ text: 'a.eth', maxFontSize: 40 })).fontSize, 40);
  assert.match(await v2({ text: 'a.eth', fitMode: 'exact' }), /textLength="[\d.]+" lengthAdjust="spacingAndGlyphs"/);
  assert.ok((await createDynamicSVGImage({ layout: 'ens-v2', text: 'a.eth' })) instanceof Uint8Array);
});
