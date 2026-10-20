import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import opentype from 'opentype.js';
import { createDynamicSVGImage, calculateFontSize, initializeFont } from '../src/index.js';

const LOGO_START = 'M42.7634 487.399C42.6074';
const round3 = v => +v.toFixed(3);

const FEATURES = ['ss01', 'ss03', 'tnum'];
let satoshi;

before(async () => {
  const buf = fs.readFileSync(new URL('../assets/Satoshi-Bold.ttf', import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  await initializeFont(ab);
  satoshi = opentype.parse(ab);
});

// Independent check of what a browser lays out: ss01/ss03/tnum glyphs, kerning, no ligatures.
function browserAdvance(text, fontSize) {
  const subs = new Map();
  for (const feature of FEATURES) for (const { sub, by } of satoshi.substitution.getSingle(feature, 'DFLT')) subs.set(sub, by);
  const glyphs = Array.from(text, ch => satoshi.charToGlyph(ch)).map(g => (subs.has(g.index) ? satoshi.glyphs.get(subs.get(g.index)) : g));
  const kern = satoshi.position.getKerningTables('DFLT');
  let units = 0;
  glyphs.forEach((g, i) => {
    units += g.advanceWidth;
    if (glyphs[i + 1]) units += satoshi.position.getKerningValue(kern, g.index, glyphs[i + 1].index);
  });
  return units / satoshi.unitsPerEm * fontSize;
}

async function v2(opts) {
  return new TextDecoder().decode(await createDynamicSVGImage({ layout: 'ens-v2', ...opts }));
}

// Same inputs the layout passes: 12 min, 60 max, no height cap, measured with the rendered features.
const expectedSize = (text, textAreaWidth) => calculateFontSize(text, textAreaWidth, null, 12, 60, undefined, { features: FEATURES });

function parse(svg) {
  const label = svg.match(/<rect x="74" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="6" fill="([^"]+)"\/>/);
  const accent = svg.match(/<rect x="([\d.]+)" y="([\d.-]+)" width="32" height="32" rx="6" fill="([^"]+)"\/>/);
  const lines = [...svg.matchAll(/<text x="91" y="([\d.]+)" font-size="([\d.]+)px" fill="([^"]+)"[^>]*>([^<]*)<\/text>/g)]
    .map(m => ({ y: Number(m[1]), fontSize: Number(m[2]), fill: m[3], text: m[4] }));
  const group = svg.match(/<g transform="translate\(0 ([\d.e-]+)\) scale\(([\d.]+)\)">/);
  return {
    labelY: label && Number(label[1]), labelWidth: label && Number(label[2]), labelHeight: label && Number(label[3]), labelFill: label?.[4],
    accentX: accent && Number(accent[1]), accentY: accent && Number(accent[2]), accentFill: accent?.[3],
    lines, fontSize: lines[0]?.fontSize, textFill: lines[0]?.fill, text: lines.map(l => l.text).join(''),
    translateY: group && Number(group[1]), scale: group && Number(group[2]),
  };
}

// The label grows upward from y=508, with the accent square on its top-right corner.
function assertLabelGeometry(p, text) {
  assert.equal(round3(p.labelY + p.labelHeight), 508, `${text}: label bottom`);
  assert.equal(p.accentY, round3(p.labelY - 32), `${text}: accent on the label's top edge`);
  assert.equal(p.accentX, round3(74 + p.labelWidth), `${text}: accent on the label's right edge`);
  assert.ok(p.labelY >= 90, `${text}: label top ${p.labelY}`);
}

test('tanrikulu.eth at 550: tile, logo, label, name and accent square in place', async () => {
  const svg = await v2({ text: 'tanrikulu.eth' });
  const p = parse(svg);
  const { fontSize, metrics } = await expectedSize('tanrikulu.eth', 398);

  assert.ok(svg.includes('<rect x="12" y="478" width="60" height="60" rx="6" fill="#0082BB"/>'));
  assert.match(svg, new RegExp(`<path fill-rule="evenodd" clip-rule="evenodd" d="${LOGO_START}[^"]+" fill="#F6FBFD"/>`));
  assert.equal(p.text, 'tanrikulu.eth');
  assert.equal(p.fontSize, fontSize);
  assert.equal(p.fontSize, 60, 'short names render at the calibrated maximum');
  assert.equal(p.textFill, '#0082BB');
  assert.equal(p.labelFill, '#F6FBFD');
  assert.equal(p.labelWidth, round3(34 + metrics.width));
  assert.equal(p.accentX, round3(74 + p.labelWidth));
  assert.equal(p.accentFill, '#0082BB');
  assert.equal(p.translateY, 0);
  assert.equal(p.scale, 1);
  assert.ok(!/<text[^>]*filter=/.test(svg), 'name has no filter');
  assert.ok(!svg.includes('dropShadow'));
});

test('a name a little too wide shrinks on one line, down to 37.5', async () => {
  const text = 'alabamaala.eth';
  const p = parse(await v2({ text }));
  const { fontSize } = await calculateFontSize(text, 398, null, 37.5, 60, undefined, { features: FEATURES });
  assert.equal(p.lines.length, 1);
  assert.equal(p.fontSize, fontSize);
  assert.ok(p.fontSize < 60 && p.fontSize >= 37.5);
  assert.equal(p.labelHeight, 88);
  assertLabelGeometry(p, text);
});

test('a long name breaks mid-word onto lines at 45 and the label grows upward', async () => {
  const text = 'thisisalongcharacternamethatkeeps.eth';
  const p = parse(await v2({ text }));
  assert.equal(p.lines.length, 3);
  assert.ok(p.lines.every(l => l.fontSize === 45 && l.fill === '#0082BB'));
  assert.equal(p.text, text, 'the lines are the name, in order');
  assert.deepEqual(p.lines.map(l => l.y), [p.lines[0].y, p.lines[0].y + 48, p.lines[0].y + 96]);
  assert.equal(p.labelHeight, 168, "the design's 3-line label");
  assert.ok(p.accentX <= 550 - 12 - 32, `label right edge ${p.accentX}`);
  assertLabelGeometry(p, text);
});

test('a 255-character name drops to 26.25 and stays below the top limit', async () => {
  const label = ('thisisa255characternamethatkeepsgoing' + 'andgoing'.repeat(30)).slice(0, 252) + 'ggg';
  const text = `${label}.eth`;
  const p = parse(await v2({ text }));
  assert.equal(p.fontSize, 26.25);
  assert.equal(p.text, text);
  assert.equal(p.labelHeight, 24 + 28 + (p.lines.length - 1) * 28);
  assert.ok(p.accentX <= 506);
  assertLabelGeometry(p, text);
});

test('names too tall even at the smallest step keep shrinking until the label fits', async () => {
  const label = ('thisisa255characternamethatkeepsgoing' + 'andgoing'.repeat(30)).slice(0, 252) + 'ggg';
  const text = `${label}.${label}.${label}.eth`;
  const p = parse(await v2({ text }));
  assert.ok(p.fontSize < 26.25 && p.fontSize >= 12, `font ${p.fontSize}`);
  assert.equal(p.text, text);
  assertLabelGeometry(p, text);
});

test("subnames: one label per line, the subname's own labels first, its parents lighter", async () => {
  const p = parse(await v2({ text: 'second.wallet.jeff.eth' }));
  assert.deepEqual(p.lines.map(l => l.text), ['second.', 'wallet.', 'jeff.eth']);
  assert.deepEqual(p.lines.map(l => l.fill), ['#0082BB', '#80C4E0', '#80C4E0']);
  assert.ok(p.lines.every(l => l.fontSize === 60));
  assert.equal(p.labelHeight, 228, "the design's 3-line label");
  assertLabelGeometry(p, 'second.wallet.jeff.eth');

  const two = parse(await v2({ text: 'wallet.jeff.eth', colors: { parent: '#123456' } }));
  assert.deepEqual(two.lines.map(l => [l.text, l.fill]), [['wallet.', '#0082BB'], ['jeff.eth', '#123456']]);
  assert.equal(two.labelHeight, 158);

  const name = parse(await v2({ text: 'jeff.eth' }));
  assert.deepEqual(name.lines.map(l => [l.text, l.fill]), [['jeff.eth', '#0082BB']], 'a 2LD is one line in the accent');
});

test('international and CJK names use 85% of the width', async () => {
  for (const text of ['你好世界你好世界你好世界你好世界.eth', 'приветприветприветприветпривет.eth']) {
    const p = parse(await v2({ text }));
    assert.ok(p.lines.length > 1, `${text}: long enough to break`);
    assert.ok(p.labelWidth - 34 <= 398 * 0.85, `${text}: lines within 85% of the width, label ${p.labelWidth}`);
    assert.equal(p.text, text);
    assertLabelGeometry(p, text);
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
  assert.equal(q.labelFill, '#F6FBFD');
});

test('1000 × 1000: scaled group, same design-space label limit', async () => {
  const text = 'averyveryverylongensnamethatneedsshrinking.eth';
  const svg = await v2({ text, width: 1000, height: 1000 });
  const p = parse(svg);
  assert.ok(svg.includes(`<g transform="translate(0 0) scale(${1000 / 550})">`));
  assert.ok(svg.includes('<rect width="1000" height="1000" fill="#F6FBFD"/>'));
  assert.deepEqual(p.lines, parse(await v2({ text })).lines, 'same lines as at 550');
  assert.ok(p.accentX <= 506);
});

test('1000 × 600: scale by the short edge, label may grow to width / k', async () => {
  const text = 'averyveryverylongensnamethatneedsshrinking.eth';
  const k = 600 / 550;
  const svg = await v2({ text, width: 1000, height: 600 });
  const p = parse(svg);
  assert.ok(svg.includes(`<g transform="translate(0 ${600 - 550 * k}) scale(${k})">`));
  assert.ok(svg.includes('<rect width="1000" height="600" fill="#F6FBFD"/>'));
  assert.ok(p.lines.length < parse(await v2({ text })).lines.length, 'wide card fits more on a line');
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

test('label fits the glyphs the style selects (ss01 a, ss03 t, tabular digits)', async () => {
  for (const text of ['alabama.eth', '1111.eth', '123.eth', '0x1234.eth', 'tanrikulu.eth']) {
    const p = parse(await v2({ text }));
    const textWidth = browserAdvance(text, p.fontSize);
    assert.ok(Math.abs(p.labelWidth - (34 + textWidth)) < 0.01, `${text}: label ${p.labelWidth}, text ${textWidth}`);
  }
});

test('escaped text is measured as it renders, inserted as given', async () => {
  const escaped = parse(await v2({ text: 'a&amp;b.eth' }));
  const plain = await expectedSize('a&b.eth', 398);
  assert.equal(escaped.text, 'a&amp;b.eth');
  assert.equal(escaped.fontSize, plain.fontSize);
  assert.equal(escaped.labelWidth, round3(34 + plain.metrics.width));
});

test('avatar href is attribute-escaped so a data: URI cannot inject markup', async () => {
  const url = 'data:image/svg+xml,"/><script>alert(1)</script><x a="';
  const svg = await v2({ text: 'a.eth', backgroundImageUrl: url });
  assert.ok(!svg.includes('<script>'));
  assert.equal(svg.match(/<image [^>]*>/g).length, 1);
  assert.ok(svg.includes('href="data:image/svg+xml,&quot;/>&lt;script>alert(1)&lt;/script>&lt;x a=&quot;"'));
});

test('null or undefined colours keep their defaults', async () => {
  const p = parse(await v2({ text: 'a.eth', colors: { label: undefined, accent: null, logo: '#123456' } }));
  assert.equal(p.labelFill, '#F6FBFD');
  assert.equal(p.textFill, '#0082BB');
});

test('non-positive sizes are rejected', async () => {
  await assert.rejects(v2({ text: 'a.eth', width: 0 }), RangeError);
  await assert.rejects(v2({ text: 'a.eth', height: -5 }), RangeError);
  await assert.rejects(v2({ text: 'a.eth', width: 'abc' }), RangeError);
});

test('CJK and mixed names: Satoshi glyphs measured exactly, full-width characters at 1 em', async () => {
  const cases = [
    ['你好世界.eth', size => 4 * size + browserAdvance('.eth', size)],
    ['こんにちは.eth', size => 5 * size + browserAdvance('.eth', size)],
    ['안녕하세요.eth', size => 5 * size + browserAdvance('.eth', size)],
    ['crypto中文.eth', size => browserAdvance('crypto', size) + 2 * size + browserAdvance('.eth', size)],
    ['ｶﾀｶﾅ.eth', size => 4 * size / 2 + browserAdvance('.eth', size)],
  ];
  for (const fontFamily of ['Satoshi', 'sans-serif']) {
    for (const [text, expectedWidth] of cases) {
      const p = parse(await v2({ text, fontFamily }));
      const width = expectedWidth(p.fontSize);
      assert.ok(Math.abs(p.labelWidth - (34 + width)) < 0.01, `${text} (${fontFamily}): label ${p.labelWidth}, expected ${34 + width}`);
      assert.ok(p.accentX <= 506);
    }
  }
});

test('emoji names: Latin part exact, emoji estimated, label inside the limit', async () => {
  const { metrics } = await expectedSize('🚀rocket.eth', 398 * 0.85);
  assert.equal(metrics.isAccurate, false, 'emoji width is an estimate');
  assert.ok(metrics.width > browserAdvance('rocket.eth', 60) * 0.5);
  const p = parse(await v2({ text: '👨‍👩‍👧‍👦🚀rocket.eth' }));
  assert.ok(Number.isFinite(p.labelWidth) && p.accentX <= 506);
});

test('other scripts use their measured per-grapheme widths, independent of fontFamily', async () => {
  const cases = [
    ['שלום.eth', 4, 0.56],      // Hebrew
    ['مرحبا.eth', 5, 0.53],     // Arabic
    ['γεια.eth', 4, 0.61],      // Greek
    ['привет.eth', 6, 0.61],    // Cyrillic
    ['გამარჯობა.eth', 9, 0.68], // Georgian
    ['สวัสดี.eth', 4, 0.56],     // Thai (4 graphemes)
  ];
  for (const fontFamily of ['Satoshi', 'sans-serif']) {
    for (const [text, graphemes, em] of cases) {
      const p = parse(await v2({ text, fontFamily }));
      const expected = 34 + graphemes * em * p.fontSize + browserAdvance('.eth', p.fontSize);
      assert.ok(Math.abs(p.labelWidth - expected) < 0.01, `${text} (${fontFamily}): label ${p.labelWidth}, expected ${expected}`);
    }
  }
});

test('v2 style: autospace off, tabular digits through font-feature-settings', async () => {
  const svg = await v2({ text: '音乐lover.eth' });
  assert.match(svg, /text-autospace: no-autospace;/);
  // rasterize-wasm only reads font-feature-settings, so tnum must be there, not only in font-variant-numeric
  assert.ok(svg.includes('font-feature-settings: "ss01" on, "ss03" on, "tnum" on;'));
});

test('measureText hook: called with unescaped text and the style features, label follows its width', async () => {
  const calls = [];
  const measureText = async (text, fontSize, opts) => {
    calls.push({ text, fontSize, features: opts.features });
    return text.length * fontSize * 0.5;
  };
  const p = parse(await v2({ text: 'a&amp;b.eth', measureText }));
  assert.ok(calls.length > 0);
  assert.ok(calls.every(c => c.text === 'a&b.eth'), 'hook gets the unescaped text');
  assert.deepEqual(calls[0].features, FEATURES);
  assert.equal(p.text, 'a&amp;b.eth', 'text is still inserted as given');
  assert.equal(p.labelWidth, round3(34 + 'a&b.eth'.length * p.fontSize * 0.5));
});

test('measureText hook: drives the line breaks, sync hooks work too', async () => {
  const measureText = (text, fontSize) => text.length * fontSize * 0.6; // synchronous
  const text = 'averyveryverylongensnamethatneedsshrinking.eth';
  const p = parse(await v2({ text, measureText }));
  const widths = p.lines.map(l => measureText(l.text, p.fontSize));
  assert.ok(p.lines.length > 1);
  assert.equal(p.text, text);
  assert.equal(p.labelWidth, round3(34 + Math.max(...widths)));
  assert.ok(p.accentX <= 506);
});

test('measureText hook: bad hooks fail clearly', async () => {
  await assert.rejects(v2({ text: 'a.eth', measureText: 'nope' }), TypeError);
  await assert.rejects(v2({ text: 'a.eth', measureText: () => NaN }), /measureText returned NaN/);
});
