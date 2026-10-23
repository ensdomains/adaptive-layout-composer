# Adaptive Layout Composer

An adaptive layout composer with precise text measurement, dynamic font sizing, and intelligent positioning for international text and emojis.

## Features

- Generate SVG images with custom dimensions
- Accurate text measurement using OpenType.js
- Support for international text (CJK, Arabic, Hebrew, etc.) and emojis
- Dynamic font sizing that fits text within constraints
- Support for background images (fetched from URLs)
- Returns SVG data as Uint8Array or base64
- Optimized for Cloudflare Workers

## Installation

```bash
npm install adaptive-layout-composer
```

## Usage

### Basic Usage

```javascript
import { createDynamicSVGImage } from 'adaptive-layout-composer';

// Generate SVG with auto font sizing
const svgData = await createDynamicSVGImage({
  text: "Hello 🌍 World!",
  width: 400,
  height: 200,
  autoFontSize: true,
  ensStyle: true
});

// Convert to base64 for data URL
const base64 = btoa(String.fromCharCode(...svgData));
const dataUrl = `data:image/svg+xml;base64,${base64}`;
```

### Using Custom Fonts

For more accurate text measurement and custom fonts in your SVG:

```javascript
import { initializeFont, createDynamicSVGImage } from 'adaptive-layout-composer';
import myFont from './fonts/MyFont.ttf';

// Load font for accurate text measurement (OpenType.js)
await initializeFont(myFont); // ArrayBuffer, URL, or base64

// Convert font to base64 for embedding in SVG
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}

// Generate SVG with embedded custom font
const svgData = await createDynamicSVGImage({
  text: "Custom Font Text",
  width: 400,
  height: 200,
  fontFamily: 'MyFont',
  fontBase64: arrayBufferToBase64(myFont),
  autoFontSize: true
});
```

### ENS v2 Card Layout

Pass `layout: 'ens-v2'` for the ENS v2 NFT card: the background (an avatar, your own SVG markup or a solid colour), an ENS logo tile bottom-left, and the name on a label with an accent square on its top-right corner.

```javascript
const svgData = await createDynamicSVGImage({
  layout: 'ens-v2',
  text: 'tanrikulu.eth',            // inserted as given: escape it yourself
  width: 550,
  height: 550,
  fontFamily: 'Satoshi',
  fontBase64: satoshiBase64,
  backgroundImageUrl: 'data:image/png;base64,...', // avatar; must be a data: URI
  // backgroundMarkup: '<g>...</g>', // used when there is no avatar
  // backgroundColor: '#F6FBFD',     // used when there is neither
  // colors: { label: '#F6FBFD', accent: '#0082BB', logo: '#F6FBFD', parent: '#80C4E0' },
});
```

The package ships Satoshi Bold at `adaptive-layout-composer/assets/Satoshi-Bold.ttf`. In a Cloudflare Worker, import it as data (add a `Data` rule for `**/*.ttf` to `wrangler.toml`) and use the same bytes for `fontBase64` and for rasterize-wasm's `primaryFont`:

```javascript
import satoshiBytes from 'adaptive-layout-composer/assets/Satoshi-Bold.ttf';

const satoshiBase64 = btoa(String.fromCharCode(...new Uint8Array(satoshiBytes)));
```

| Option | Default | Notes |
|---|---|---|
| `layout` | – | `'ens-v2'` selects this layout. Without it, the existing layouts are unchanged. |
| `width`, `height` | `550` | Any size. The card is drawn in a 550-unit design space, scaled by `min(width, height) / 550` and anchored bottom-left. The background fills the full canvas. |
| `backgroundImageUrl` | `null` | Avatar. Only `data:` URIs are used (nothing is fetched). Emitted as `<image href="…" width="…" height="…" preserveAspectRatio="xMidYMid slice"/>`, with `&`, `"` and `<` in the URI escaped. |
| `backgroundMarkup` | `null` | Trusted SVG fragment covering `width × height`, inserted verbatim when there is no avatar. |
| `backgroundColor` | `'#F6FBFD'` | Solid background when there is neither. Accepts a CSS colour, `[r, g, b, a]`, or `'transparent'` for none. |
| `colors.label` | `'#F6FBFD'` | Name label. |
| `colors.accent` | `'#0082BB'` | Logo tile, name and accent square. |
| `colors.logo` | `'#F6FBFD'` | ENS logo. |
| `colors.parent` | `'#80C4E0'` | A subname's parent labels (every line after the subname's first label). |
| `maxFontSize` | `60` | In design units; caps the drawn size. 60 puts Satoshi Bold's ascenders 44.8 units above the baseline, as in the design. |
| `measureText` | – | `(text, fontSize, { features }) => width`, sync or async. Measures the name instead of the built-in measurement. Pass the renderer's own measurement to get an exact label (see below). Gets the unescaped text. |
| `fontFamily`, `fontBase64`, `customElements`, `fitMode` | as above | `customElements` paint on top of the card. `fitMode: 'exact'` has no effect in rasterize-wasm, which ignores `textLength`. |

The text area is the widest label that keeps the 40-unit accent square 12 units from the right edge (390 units of text on a square card; wider cards allow more). International and CJK names get 85% of that width. The label's bottom stays at y = 508 and it grows upward, one line at a time, with the accent square on its top-right corner:

- **Subnames** get one line per label: `second.` / `wallet.` / `jeff.eth`. The first line is in `colors.accent`, the parent labels in `colors.parent`. A name with one or two labels (`jeff.eth`) is a single line.
- **The design's sizes** are tried in order: 64 (lines 70 apart), 48 and 28 (lines as far apart as the size). Satoshi is drawn at 60/64 of them, so 60, 45 and 26.25.
- **At the first size**, each label stays on its own line and shrinks, down to 37.5, rather than break, and the label's height and line spacing shrink with it so the accent square stays as close to the text. A name a little too wide (`alabamaala.eth`) shrinks; a long one wraps.
- **At 48 and 28**, a line wider than the text area breaks mid-word, between characters (`thisisalongchara` / `cternamethatke` / `eps.eth`).
- The label's top may reach y = 90. A name too tall for that even at 28 keeps shrinking until it fits, down to 12.

#### Exact labels with rasterize-wasm

[rasterize-wasm](https://github.com/ensdomains/rasterize-wasm) draws the text itself: it picks a bundled Noto font per script, shapes with HarfBuzz and uses Twemoji for emoji. Its `measureText` runs that same layout without drawing, so passing it here makes the label fit every script exactly in the rasterized card:

```javascript
import { UniversalSVGRenderer } from 'rasterize-wasm';

const renderer = new UniversalSVGRenderer();
const svg = await createDynamicSVGImage({
  layout: 'ens-v2',
  text: 'مرحبا.eth',
  fontFamily: 'Satoshi',
  fontBase64: satoshiBase64,
  measureText: (text, fontSize, options) => renderer.measureText(text, fontSize, { ...options, primaryFont: satoshiBytes }),
});
const png = await renderer.render(new TextDecoder().decode(svg));
```

`primaryFont` must be the same font as `fontBase64`: rasterize-wasm draws with the embedded font.

Without `measureText`, the label is measured as follows:

- With the font loaded through `initializeFont`, the label fits the glyphs the text style turns on (`ss01`, `ss03`, tabular digits), with kerning and without ligatures. Browsers render exactly that. Renderers that ignore font features (resvg 2.6, for example) draw some names narrower, which leaves extra space on the right of the label.
- Each character is measured on its own. Characters the font has use its glyphs. CJK characters (ideographs, kana, Hangul, full-width forms) count as 1 em, which is how CJK fonts draw them; half-width forms count as 0.5 em. Greek, Cyrillic, Hebrew, Arabic, Indic, Thai and Georgian use an average width per character measured with the Noto Sans Bold fonts, and emoji count as 1.15 em. The viewer's fonts draw these scripts, so on other platforms the label can be off by around 10%. Some Korean fonts draw Hangul slightly narrower than 1 em.
- The layout sets `text-autospace: no-autospace`, so Chrome doesn't add its extra space between CJK and Latin characters, which the measurement doesn't include.
- `text` is inserted as given, so escape it yourself. Measurement decodes XML entities first: `a&amp;b.eth` is measured as `a&b.eth`.

A `width` or `height` that isn't a positive number throws a `RangeError`.

### API Reference

#### `createDynamicSVGImage(options)`

Generate an SVG image with the following options:

```javascript
{
  text: "Hello World!",           // Text to render
  width: 270,                     // Image width in pixels
  height: 270,                    // Image height in pixels
  textColor: [255, 255, 255, 1],  // RGBA text color
  backgroundImageUrl: "https://example.com/image.jpg", // Optional background
  autoFontSize: true,             // Auto-calculate font size to fit
  maxFontSize: 68,                // Maximum font size when auto-sizing
  fontSize: 48,                   // Manual font size (if autoFontSize: false)
  ensStyle: true,                 // Use ENS-style layout with logo
  textX: 100,                     // Manual X position
  textY: 100,                     // Manual Y position
  maxTextWidth: 200,              // Maximum text width
  fontFamily: 'sans-serif',       // Font family name (used for both embedded and system fonts)
  fontBase64: 'base64data...'     // Optional: base64 font data to embed with fontFamily name
}
```

#### Other Functions

- `initializeFont(fontSource)` - Load a font for accurate text measurement
  - Accepts: URL string, base64 string, ArrayBuffer, or Uint8Array
  - Returns: OpenType font object or null
- `measureTextAccurate(text, fontSize, fontFamily)` - Get accurate text measurements using loaded font
- `calculateFontSize(text, maxWidth, maxHeight, minSize, maxSize)` - Calculate optimal font size to fit text

## Development

```bash
# Install dependencies
yarn install

# The library exports functions from src/index.js:
# - createDynamicSVGImage()
# - measureTextAccurate()
# - calculateFontSize()
# - initializeFont()
```

### Using as a Library

Import the library functions in your own Cloudflare Worker:

```javascript
import { createDynamicSVGImage } from './src/index.js';

export default {
  async fetch(request) {
    const svgData = await createDynamicSVGImage({
      text: "Hello World",
      width: 400,
      height: 200
    });

    return new Response(svgData, {
      headers: { 'Content-Type': 'image/svg+xml' }
    });
  }
}
```
