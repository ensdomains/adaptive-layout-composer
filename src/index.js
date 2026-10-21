import opentype from 'opentype.js';
import { measureTextFallback, getTextMeasurementStrategy, classifyText } from './text-measurement.js';

// Text measurement adjustment constants
const TEXT_MEASUREMENT = {
  MULTIPLE_DIGITS_THRESHOLD: 2,         // More than this many digits triggers special handling
  DIGIT_PADDING_FACTOR: 0.05,           // Padding per digit (5% of font size)
  DIGIT_DEBUG_ADJUSTMENT: 0.07,         // Debug info adjustment factor
};

// Font size constants
const FONT_SIZE = {
  DEFAULT: 48,                          // Default font size when not auto-calculated
  DEFAULT_MAX: 68,                      // Default maximum font size for auto-sizing
  DEFAULT_MIN: 12,                      // Default minimum font size for auto-sizing
  ABSOLUTE_MAX: 100,                    // Absolute maximum font size limit
  STEP: 1,                              // Font size decrement step when searching for fit
};

// ENS-style layout constants
const ENS_LAYOUT = {
  LOGO_X_POSITION: 70,                  // X position for logo and text alignment
  RIGHT_PADDING: 20,                    // Right side padding
  BOTTOM_PADDING: 72,                   // Bottom padding for text positioning
  PADDING_Y: 20,                        // Top/bottom padding
  CJK_WIDTH_FACTOR: 0.85,               // Use 85% of available width for CJK text
  INTL_PADDING_MULTIPLIER: 0.6,         // 60% width for international chars
  LATIN_PADDING_MULTIPLIER: 0.8,        // 80% width for Latin text
  TEXT_AREA_HEIGHT_FACTOR: 0.6,         // Text area is 60% of total height
  LOGO_SCALE: 1.9,                      // Logo scaling factor
};

// ENS v2 card layout, in design units on a 550 × 550 canvas
const ENS_V2_LAYOUT = {
  DESIGN_SIZE: 550,                     // Design canvas edge; everything below is scaled by min(width, height) / 550
  MAX_FONT_SIZE: 60,                    // Satoshi Bold ascenders (744/1000 em) reach 44.8 units above the baseline
  LABEL_X: 74,
  LABEL_BOTTOM: 508,                    // The label grows upward from here, one line at a time
  LABEL_MIN_Y: 90,                      // Highest the label's top may reach
  LABEL_PADDING_X: 17,                  // Space between the label edge and the name, each side
  LABEL_PADDING_Y: 12,
  ASCENT: 52 / 64,                      // First baseline below the text's top, per unit of design size
  ACCENT_SIZE: 32,
  RIGHT_MARGIN: 12,                     // Closest the accent square may get to the right edge
  CORNER_RADIUS: 6,
  // The design's text sizes, tried in order, with the distance between baselines; the
  // smaller two may break a label mid-word. Satoshi is drawn at FONT_SCALE of them.
  STEPS: [
    { size: 64, pitch: 70, wrap: false },
    { size: 48, pitch: 48, wrap: true },
    { size: 28, pitch: 28, wrap: true },
  ],
  FONT_SCALE: 60 / 64,
  SINGLE_LINE_MIN_SIZE: 40,             // A name this close to fitting shrinks on one line instead of breaking
  COLORS: { label: '#F6FBFD', accent: '#0082BB', logo: '#F6FBFD', parent: '#80C4E0' },
  BACKGROUND_COLOR: '#F6FBFD',
  TEXT_FEATURES: ['ss01', 'ss03', 'tnum'], // What the shared text style turns on; the label is measured with the same glyphs
  LOGO_PATH: 'M42.7634 487.399C42.6074 487.163 42.8942 486.886 43.127 487.049L52.8702 493.832C59.011 498.107 61.8385 505.74 59.8916 512.934C59.7373 513.504 59.5719 514.003 59.4164 514.421C59.3201 514.68 58.937 514.624 58.9176 514.348C58.7534 512.006 57.0577 509.328 55.827 507.385C55.6073 507.038 55.4024 506.714 55.2237 506.42C54.0275 504.452 45.3683 491.34 42.7634 487.399ZM29.8625 506.477L41.5249 487.39C41.6603 487.169 41.4166 486.91 41.1853 487.03C39.1465 488.088 33.6454 491.147 29.3265 495.437C24.5934 500.138 28.4184 505.297 29.4451 506.509C29.5586 506.643 29.7711 506.627 29.8625 506.477ZM41.2366 528.601C41.3926 528.837 41.1058 529.113 40.873 528.951L31.1298 522.168C24.989 517.893 22.1615 510.26 24.1084 503.066C24.2627 502.496 24.4281 501.997 24.5836 501.579C24.6799 501.32 25.063 501.376 25.0824 501.652C25.2466 503.994 26.9423 506.672 28.173 508.615L28.1731 508.616L28.1733 508.616C28.3929 508.963 28.5977 509.286 28.7763 509.58C29.9725 511.548 38.6317 524.66 41.2366 528.601ZM42.4761 528.607L54.1384 509.521C54.2299 509.371 54.4424 509.355 54.5558 509.488C55.5825 510.701 59.4075 515.86 54.6745 520.561C50.3556 524.851 44.8544 527.91 42.8157 528.968C42.5844 529.087 42.3407 528.829 42.4761 528.607Z',
};

// Visual effects constants
const VISUAL_EFFECTS = {
  BACKGROUND_OVERLAY_OPACITY: 0.12,     // Opacity for background image overlay
  DROP_SHADOW_DY: 1,                    // Vertical offset for drop shadow
  DROP_SHADOW_BLUR: 2,                  // Standard deviation for shadow blur
  DROP_SHADOW_OPACITY: 0.225,           // Shadow opacity
  TEXT_LINE_HEIGHT: 34,                 // Line height in pixels for text
};

// Default image dimensions
const DEFAULTS = {
  WIDTH: 270,                           // Default canvas width
  HEIGHT: 270,                          // Default canvas height
  TEXT: 'Hello World',                  // Default text content
};

// Global debug flag - can be toggled externally
let debugEnabled = false;

// Debug logging utility
function debug(...args) {
  if (debugEnabled) {
    console.log(...args);
  }
}

function debugWarn(...args) {
  if (debugEnabled) {
    console.warn(...args);
  }
}

let loadedFonts = {
  primary: null,
  fallbacks: {},
  primarySourceKey: null, // identity key for the source we last parsed — skip re-parse if unchanged
};

// Produce a stable identity key for a font source so repeat calls with the
// same input return the cached parsed font instead of re-parsing every request.
// - ArrayBuffer / Uint8Array: reference identity (callers typically hold one)
// - string (URL / data URL / base64): value equality
function fontSourceKey(src) {
  if (src == null) return null;
  if (typeof src === 'string') return `s:${src}`;
  if (src instanceof ArrayBuffer || src instanceof Uint8Array) return src;
  return null; // unknown shape — force re-parse
}

/**
 * Initialize a font for accurate text measurement using OpenType.js
 * @param {string|ArrayBuffer|Uint8Array} fontSource - Font source in one of several formats:
 *   - URL string (http:// or https://)
 *   - Data URL string (data:font/...)
 *   - Base64 encoded string
 *   - ArrayBuffer
 *   - Uint8Array
 * @returns {Promise<Object|null>} OpenType font object or null if loading fails
 * @example
 * // Load from URL
 * await initializeFont('https://example.com/font.ttf');
 *
 * // Load from ArrayBuffer
 * const fontBuffer = await fetch('font.ttf').then(r => r.arrayBuffer());
 * await initializeFont(fontBuffer);
 */
async function initializeFont(fontSource) {
  // If font already loaded and no new source provided, return existing
  if (loadedFonts.primary && !fontSource) {
    return loadedFonts.primary;
  }

  // If no font source provided, return null (use fallback measurement)
  if (!fontSource) {
    return null;
  }

  // Skip re-parse when the caller hands us the same source again (common in
  // Workers where the same font buffer is imported once and passed per request).
  const sourceKey = fontSourceKey(fontSource);
  if (sourceKey !== null && loadedFonts.primary && loadedFonts.primarySourceKey === sourceKey) {
    return loadedFonts.primary;
  }

  try {
    let buffer;

    // Detect input type and convert to ArrayBuffer
    if (typeof fontSource === 'string') {
      if (fontSource.startsWith('http://') || fontSource.startsWith('https://')) {
        // URL - fetch the font
        debug(`Fetching font from URL: ${fontSource}`);
        const response = await fetch(fontSource);
        if (!response.ok) {
          throw new Error(`Failed to fetch font: ${response.status}`);
        }
        buffer = await response.arrayBuffer();
      } else if (fontSource.startsWith('data:')) {
        // Data URL - extract base64 part
        debug('Loading font from data URL');
        const base64Data = fontSource.split(',')[1];
        buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;
      } else {
        // Assume raw base64 string
        debug('Loading font from base64 string');
        buffer = Uint8Array.from(atob(fontSource), c => c.charCodeAt(0)).buffer;
      }
    } else if (fontSource instanceof ArrayBuffer) {
      // Already an ArrayBuffer
      debug('Loading font from ArrayBuffer');
      buffer = fontSource;
    } else if (fontSource instanceof Uint8Array) {
      // Uint8Array
      debug('Loading font from Uint8Array');
      buffer = fontSource.buffer;
    } else {
      throw new Error('Unsupported font source type. Expected URL string, base64 string, ArrayBuffer, or Uint8Array');
    }

    loadedFonts.primary = opentype.parse(buffer);
    loadedFonts.primarySourceKey = sourceKey;
    debug(`✅ Font loaded: ${loadedFonts.primary.names.fontFamily?.en || 'Unknown'}`);

    return loadedFonts.primary;
  } catch (error) {
    debugWarn('Failed to load font, falling back to mathematical approximation:', error.message);
    loadedFonts.primary = null;
    loadedFonts.primarySourceKey = null;
    return null;
  }
}

// Does this text contain glyphs that Satoshi-style Latin fonts typically don't cover?
// Thin wrapper kept for readability at call sites.
function needsSpecialFont(text) {
  return classifyText(text).hasCJK;
}

// True if `font` can't render every codepoint in `text` (some glyph would fall
// back to .notdef). Cheap: one charToGlyph per codepoint, bails on first miss.
function hasMissingGlyphs(font, text) {
  for (const ch of text) {
    try {
      const glyph = font.charToGlyph(ch);
      if (!glyph || glyph.index === 0) return true;
    } catch {
      return true;
    }
  }
  return false;
}


// GSUB single substitutions (ss01, tnum, ...) per font, cached by feature list.
const substitutionCache = new WeakMap();
function singleSubstitutions(font, features) {
  let perFont = substitutionCache.get(font);
  if (!perFont) substitutionCache.set(font, perFont = new Map());
  const key = features.join(',');
  if (!perFont.has(key)) {
    const map = new Map();
    for (const feature of features) {
      for (const script of ['DFLT', 'latn']) {
        try {
          for (const { sub, by } of font.substitution.getSingle(feature, script) || []) {
            if (!map.has(sub)) map.set(sub, by);
          }
        } catch {
          // feature or script not in this font
        }
      }
    }
    perFont.set(key, map);
  }
  return perFont.get(key);
}

// East Asian full-width characters. CJK fonts draw these at 1 em; half-width forms at 0.5 em.
const FULL_WIDTH_RANGES = [
  [0x1100, 0x115F],   // Hangul Jamo (leading consonants)
  [0x2E80, 0x303E],   // CJK radicals, Kangxi radicals, ideographic description, CJK symbols and punctuation
  [0x3041, 0x33FF],   // Hiragana, Katakana, Bopomofo, Hangul compatibility Jamo, Kanbun, CJK strokes, enclosed and compatibility CJK
  [0x3400, 0x4DBF],   // CJK Extension A
  [0x4E00, 0x9FFF],   // CJK Unified Ideographs
  [0xA960, 0xA97F],   // Hangul Jamo Extended-A
  [0xAC00, 0xD7A3],   // Hangul Syllables
  [0xF900, 0xFAFF],   // CJK Compatibility Ideographs
  [0xFE30, 0xFE4F],   // CJK Compatibility Forms
  [0xFF01, 0xFF60],   // Full-width ASCII and punctuation
  [0xFFE0, 0xFFE6],   // Full-width signs
  [0x20000, 0x3FFFD], // CJK Extensions B and later
];
const HALF_WIDTH_RANGE = [0xFF61, 0xFFDC]; // Half-width Katakana and Hangul

// Average width per grapheme of scripts Satoshi lacks, measured on common words in the Noto Sans
// Bold fonts (shaped with HarfBuzz, so Arabic joining and Indic conjuncts are included). Other
// platforms' fonts differ by roughly ±10%.
const SCRIPT_WIDTHS_EM = [
  [[[0x0370, 0x03FF], [0x1F00, 0x1FFF]], 0.61],                   // Greek
  [[[0x0400, 0x052F], [0x1C80, 0x1C8F]], 0.61],                   // Cyrillic
  [[[0x0590, 0x05FF], [0xFB1D, 0xFB4F]], 0.56],                   // Hebrew
  [[[0x0600, 0x06FF], [0x0750, 0x077F], [0x08A0, 0x08FF], [0xFB50, 0xFDFF], [0xFE70, 0xFEFF]], 0.53], // Arabic
  [[[0x0900, 0x0DFF]], 0.73],                                     // Devanagari, Bengali and the other Indic scripts
  [[[0x0E00, 0x0EFF]], 0.56],                                     // Thai, Lao
  [[[0x10A0, 0x10FF], [0x1C90, 0x1CBF], [0x2D00, 0x2D2F]], 0.68], // Georgian (Noto 0.72; macOS draws it narrower)
];
const EMOJI_WIDTH_EM = 1.15;

const inRanges = (codePoint, ranges) => ranges.some(([lo, hi]) => codePoint >= lo && codePoint <= hi);

// Width in em of a grapheme the font lacks, or null when its script isn't listed.
function scriptWidthEm(grapheme) {
  const codePoint = grapheme.codePointAt(0);
  if (inRanges(codePoint, FULL_WIDTH_RANGES)) return 1;
  if (codePoint >= HALF_WIDTH_RANGE[0] && codePoint <= HALF_WIDTH_RANGE[1]) return 0.5;
  for (const [ranges, em] of SCRIPT_WIDTHS_EM) {
    if (inRanges(codePoint, ranges)) return em;
  }
  if (classifyText(grapheme).hasEmoji || /\p{Extended_Pictographic}/u.test(grapheme)) return EMOJI_WIDTH_EM;
  return null;
}

function graphemes(text) {
  try {
    return Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text), s => s.segment);
  } catch {
    return Array.from(text);
  }
}

/**
 * Width as a browser lays the text out, one grapheme at a time:
 * - characters the font has: its glyphs with the given features on, ligatures off
 *   (font-variant-ligatures: none) and GPOS kerning between neighbours;
 * - East Asian full-width / half-width characters: 1 em / 0.5 em, as CJK fallback fonts draw them;
 * - other scripts and emoji: a measured average width per grapheme (SCRIPT_WIDTHS_EM, EMOJI_WIDTH_EM);
 * - anything else: the per-character estimate.
 */
function measureWithFeatures(font, text, fontSize, fontFamily, features) {
  const substitutions = singleSubstitutions(font, features);
  const kerningLookups = font.position.getKerningTables(font.position.getDefaultScriptName());
  const kern = (left, right) => (kerningLookups
    ? font.position.getKerningValue(kerningLookups, left.index, right.index)
    : font.getKerningValue(left, right));

  let fontUnits = 0;  // glyphs drawn from the font
  let otherWidth = 0; // everything else, in px
  let estimated = false;
  let previous = null;
  for (const grapheme of graphemes(text)) {
    const glyphs = Array.from(grapheme, ch => font.charToGlyph(ch));
    if (glyphs.every(glyph => glyph && glyph.index !== 0)) {
      for (const original of glyphs) {
        const glyph = (substitutions.has(original.index) && font.glyphs.get(substitutions.get(original.index))) || original;
        if (previous) fontUnits += kern(previous, glyph);
        fontUnits += glyph.advanceWidth || 0;
        previous = glyph;
      }
      continue;
    }
    previous = null;
    const em = scriptWidthEm(grapheme);
    if (em !== null) {
      otherWidth += em * fontSize;
      if (em !== 1 && em !== 0.5) estimated = true;
    } else {
      otherWidth += measureTextFallback(grapheme, fontSize, fontFamily || 'Satoshi').width;
      estimated = true;
    }
  }

  const fontScale = fontSize / font.unitsPerEm;
  const ascent = font.ascender * fontScale;
  const descent = Math.abs(font.descender * fontScale);
  return {
    width: fontUnits * fontScale + otherWidth,
    height: ascent + descent,
    actualBoundingBoxAscent: ascent,
    actualBoundingBoxDescent: descent,
    fontName: font.names.fontFamily?.en || 'Unknown',
    isAccurate: !estimated,
  };
}

/**
 * Measure text dimensions accurately using loaded font or fallback to mathematical approximation
 * Automatically handles emojis, international scripts (CJK, Arabic, etc.), and complex text
 * @param {string} text - The text to measure
 * @param {number} [fontSize=48] - Font size in pixels
 * @param {string} [fontFamily='Arial'] - Font family name for fallback measurement
 * @param {Object} [options={}]
 * @param {Function} [options.measureText] - `(text, fontSize, { features }) => width` (sync or async). When set, it measures
 *   the width instead of the built-in measurement, e.g. the renderer's own measurement.
 * @param {string[]} [options.features] - GSUB features the renderer applies (e.g. `['ss01', 'tnum']`). When set and a font is loaded,
 *   width is measured per character: the font's substituted glyphs (kerning on, ligatures off), 1 em for full-width CJK,
 *   and the estimate only for characters the font lacks (emoji, other scripts).
 * @returns {Promise<Object>} Measurement object containing:
 *   - width: Text width in pixels
 *   - height: Text height in pixels
 *   - actualBoundingBoxAscent: Distance from baseline to top
 *   - actualBoundingBoxDescent: Distance from baseline to bottom
 *   - isAccurate: Whether measurement used OpenType (true) or fallback (false)
 *   - confidence: Confidence score (0-1) for fallback measurements
 * @example
 * const metrics = await measureTextAccurate('Hello 世界', 48, 'Arial');
 * console.log(`Width: ${metrics.width}px, Height: ${metrics.height}px`);
 */
async function measureTextAccurate(text, fontSize = 48, fontFamily = 'Arial', { features = null, measureText = null } = {}) {
  const font = await initializeFont();

  if (measureText) {
    // The caller measures with the renderer that will draw the text (e.g. rasterize-wasm).
    const width = await measureText(text, fontSize, { features: features || [] });
    if (!Number.isFinite(width)) {
      throw new TypeError(`measureText returned ${width} for "${text}" at ${fontSize}`);
    }
    const fontScale = font ? fontSize / font.unitsPerEm : 0;
    const ascent = font ? font.ascender * fontScale : fontSize * 0.8;
    const descent = font ? Math.abs(font.descender * fontScale) : fontSize * 0.2;
    return { width, height: ascent + descent, actualBoundingBoxAscent: ascent, actualBoundingBoxDescent: descent, isAccurate: true };
  }
  const classification = classifyText(text);
  const requiresSpecialFont = classification.hasCJK;
  const hasEmojis = classification.hasEmoji;

  if (font && features) {
    return measureWithFeatures(font, text, fontSize, fontFamily, features);
  }

  // for text with emojis, skip OpenType.js entirely. it's very inaccurate with compound emojis
  if (hasEmojis) {
    debug('Skipping OpenType.js for emoji-containing text, using fallback');
    return measureTextFallback(text, fontSize, fontFamily || 'Satoshi');
  }

  // If the loaded font doesn't cover every codepoint, getPath emits .notdef
  // boxes with fictional widths — route to fallback instead so we measure
  // by Unicode-range approximation rather than by placeholder glyphs.
  if (font && hasMissingGlyphs(font, text)) {
    debug('Font missing glyphs for this text, using fallback measurement');
    return measureTextFallback(text, fontSize, fontFamily || 'Satoshi');
  }

  if (font) {
    try {
      // Check if text contains many digits which might cause spacing issues
      const digitCount = (text.match(/\d/g) || []).length;
      const hasMultipleDigits = digitCount > TEXT_MEASUREMENT.MULTIPLE_DIGITS_THRESHOLD;

      // Use getPath for more accurate bounds measurement
      const path = font.getPath(text, 0, 0, fontSize);
      const bbox = path.getBoundingBox();

      // Get advance width for comparison
      const advanceWidth = font.getAdvanceWidth(text, fontSize);

      // Calculate actual text bounds
      const actualWidth = bbox.x2 - bbox.x1;
      const actualHeight = bbox.y2 - bbox.y1;

      // Get font metrics for baseline calculations
      const fontScale = 1 / font.unitsPerEm * fontSize;
      const ascent = font.ascender * fontScale;
      const descent = Math.abs(font.descender * fontScale);

      // Apply digit-specific adjustments for better spacing
      let adjustedWidth;
      if (hasMultipleDigits) {
        // Digits in proportional fonts can have inconsistent spacing
        // Add extra padding when multiple digits are present
        const digitPadding = digitCount * fontSize * TEXT_MEASUREMENT.DIGIT_PADDING_FACTOR;
        adjustedWidth = Math.max(actualWidth + digitPadding, advanceWidth);
      } else {
        // Advance width is the horizontal space the text consumes; bbox may be
        // narrower due to side bearings. Take the max, no artificial scaling.
        adjustedWidth = Math.max(actualWidth, advanceWidth);
      }

      // Missing-glyph routing above means this branch only runs when the font
      // actually covers every codepoint, so measurements are trustworthy.

      return {
        width: adjustedWidth,
        height: Math.max(actualHeight, ascent + descent),
        actualBoundingBoxAscent: ascent,
        actualBoundingBoxDescent: descent,
        fontName: font.names.fontFamily?.en || 'Unknown',
        isAccurate: true,
        // Debug info
        advanceWidth: advanceWidth,
        boundingWidth: actualWidth,
        boundingBox: bbox,
        digitAdjustment: hasMultipleDigits ? digitCount * fontSize * TEXT_MEASUREMENT.DIGIT_DEBUG_ADJUSTMENT : 0,
        needsSpecialFont: requiresSpecialFont
      };
    } catch (error) {
      debugWarn('OpenType measurement failed, using fallback:', error.message);
    }
  }

  // Fallback to mathematical approximation - this is especially good for CJK
  return measureTextFallback(text, fontSize, fontFamily || 'Satoshi');
}


/**
 * Calculate optimal font size to fit text within given dimensional constraints
 * Uses binary search with accurate text measurement to find the largest font size that fits
 * @param {string} text - The text to size
 * @param {number} maxWidth - Maximum width in pixels
 * @param {number|null} [maxHeight=null] - Maximum height in pixels (optional)
 * @param {number} [minFontSize=12] - Minimum font size to try
 * @param {number} [maxFontSize=100] - Maximum font size to try
 * @param {string} [fontFamily] - Font family name for fallback measurement
 * @param {Object} [measureOptions] - Passed to measureTextAccurate (e.g. `{ features: ['ss01'] }`)
 * @returns {Promise<Object>} Object containing:
 *   - fontSize: Optimal font size in pixels
 *   - metrics: Full measurement object from measureTextAccurate
 * @example
 * const result = await calculateFontSize('Hello World', 200, 50);
 * console.log(`Use font size: ${result.fontSize}px`);
 */
async function calculateFontSize(text, maxWidth, maxHeight = null, minFontSize = FONT_SIZE.DEFAULT_MIN, maxFontSize = FONT_SIZE.ABSOLUTE_MAX, fontFamily, measureOptions) {
  const strategy = getTextMeasurementStrategy(text);
  const safeWidth = maxWidth * (1 - strategy.recommendedSafetyMargin);
  const fits = m => m.width <= safeWidth && (!maxHeight || m.height <= maxHeight);

  // Early out: smallest size doesn't even fit → just use min.
  const minMetrics = await measureTextAccurate(text, minFontSize, fontFamily, measureOptions);
  if (!fits(minMetrics)) {
    return { fontSize: minFontSize, metrics: minMetrics };
  }
  // Early out: largest size fits → no search needed.
  const maxMetrics = await measureTextAccurate(text, maxFontSize, fontFamily, measureOptions);
  if (fits(maxMetrics)) {
    return { fontSize: maxFontSize, metrics: maxMetrics };
  }

  // Binary search for the largest integer font size that still fits.
  // Width is monotonic in font size for any sane measurement, so this is safe.
  let lo = minFontSize;
  let hi = maxFontSize;
  let best = { fontSize: minFontSize, metrics: minMetrics };
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const metrics = await measureTextAccurate(text, mid, fontFamily, measureOptions);
    debug(`Font size ${mid}: measured=${metrics.width.toFixed(1)}, safeWidth=${safeWidth.toFixed(1)}, maxWidth=${maxWidth.toFixed(1)}`);
    if (fits(metrics)) {
      best = { fontSize: mid, metrics };
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}


// The @font-face and `text` style block shared by the ENS layouts.
function textStyleDefs(fontFamily, fontBase64) {
  return `${fontBase64 ? `<style type="text/css">
        @font-face {
          font-family: "${fontFamily}";
          font-style: normal;
          font-weight: 600 900;
          src: url(data:font/truetype;base64,${fontBase64});
        }
      </style>` : ''}
      <style>
        text {
          font-family: '${fontFamily}', sans-serif, 'Noto Color Emoji', 'Apple Color Emoji';
          font-style: normal;
          font-variant-numeric: tabular-nums;
          font-weight: bold;
          font-variant-ligatures: none;
          font-feature-settings: "ss01" on, "ss03" on;
          -moz-font-feature-settings: "ss01" on, "ss03" on;
          line-height: ${VISUAL_EFFECTS.TEXT_LINE_HEIGHT}px;
        }
      </style>`;
}

function joinCustomElements(customElements) {
  return Array.isArray(customElements)
    ? customElements.filter(el => typeof el === 'string' && el.length > 0).join('\n    ')
    : '';
}

function resolveColor(color) {
  return Array.isArray(color)
    ? `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] ?? 1})`
    : (typeof color === 'string' ? color : null);
}

// Round layout numbers so the markup doesn't carry float noise (e.g. 312.97600000000006).
const round3 = v => +v.toFixed(3);

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

// The caller passes XML-escaped text; measure the characters the renderer will show.
function decodeXmlEntities(text) {
  return text.replace(/&(?:#x([0-9a-fA-F]+)|#([0-9]+)|(amp|lt|gt|quot|apos));/g, (entity, hex, dec, name) => {
    if (name) return XML_ENTITIES[name];
    const codePoint = hex ? parseInt(hex, 16) : Number(dec);
    return codePoint <= 0x10FFFF ? String.fromCodePoint(codePoint) : entity;
  });
}

function escapeXmlAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeXmlText(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// A subname's own labels each get a line ("second.", "wallet."); the 2LD and TLD share the last.
function ensV2Segments(name) {
  const labels = name.split('.');
  if (labels.length <= 2) return [name];
  return [...labels.slice(0, -2).map(label => `${label}.`), labels.slice(-2).join('.')];
}

// Greedy break into lines no wider than maxWidth, one grapheme at a time.
async function breakSegment(segment, maxWidth, measure) {
  const lines = [];
  let line = '';
  let lineWidth = 0;
  for (const grapheme of graphemes(segment)) {
    const width = (await measure(line + grapheme)).width;
    if (line && width > maxWidth) {
      lines.push({ text: line, width: lineWidth });
      line = grapheme;
      lineWidth = (await measure(grapheme)).width;
    } else {
      line += grapheme;
      lineWidth = width;
    }
  }
  if (line) lines.push({ text: line, width: lineWidth });
  return lines;
}

const ensV2LabelHeight = (step, lineCount) => 2 * ENS_V2_LAYOUT.LABEL_PADDING_Y + step.size + (lineCount - 1) * step.pitch;

/**
 * The name's lines at the first design size that fits: every line within maxWidth
 * and the label within maxHeight. At the first step each label stays on one line
 * and shrinks, down to SINGLE_LINE_MIN_SIZE, before any label is broken mid-word,
 * and the label's height and line spacing shrink with it; past the smallest step
 * the size keeps shrinking until the label fits.
 */
async function layoutEnsV2Name(name, maxWidth, maxHeight, maxFontSize, measureAt) {
  const L = ENS_V2_LAYOUT;
  const segments = ensV2Segments(name);
  const scaled = size => Math.min(round3(size * L.FONT_SCALE), maxFontSize);
  const fitsHeight = (step, lineCount) => ensV2LabelHeight(step, lineCount) <= maxHeight;

  const [first, ...rest] = L.STEPS;
  if (fitsHeight(first, segments.length)) {
    for (let fontSize = scaled(first.size); fontSize >= scaled(L.SINGLE_LINE_MIN_SIZE); fontSize = round3(fontSize - 1)) {
      const widths = await Promise.all(segments.map(async text => (await measureAt(text, fontSize)).width));
      if (widths.every(width => width <= maxWidth)) {
        const ratio = fontSize / scaled(first.size);
        const step = { size: first.size * ratio, pitch: first.pitch * ratio, wrap: false };
        return { step, fontSize, lines: segments.map((text, segment) => ({ text, width: widths[segment], segment })) };
      }
    }
  }

  const steps = [...rest];
  for (let size = rest[rest.length - 1].size - 2; size * L.FONT_SCALE >= FONT_SIZE.DEFAULT_MIN; size -= 2) {
    steps.push({ size, pitch: size, wrap: true });
  }
  let layout;
  for (const step of steps) {
    const fontSize = scaled(step.size);
    const measure = text => measureAt(text, fontSize);
    const lines = [];
    for (const [segment, text] of segments.entries()) {
      const { width } = await measure(text);
      if (width <= maxWidth) lines.push({ text, width, segment });
      else for (const line of await breakSegment(text, maxWidth, measure)) lines.push({ ...line, segment });
    }
    layout = { step, fontSize, lines };
    if (fitsHeight(step, lines.length)) return layout;
  }
  return layout;
}

/**
 * ENS v2 card: background (avatar, caller markup or solid colour), logo tile,
 * name label with accent square. See createDynamicSVGImage for the options.
 */
async function createEnsV2SVGImage(options) {
  const L = ENS_V2_LAYOUT;
  const {
    width = L.DESIGN_SIZE,
    height = L.DESIGN_SIZE,
    text = DEFAULTS.TEXT,
    backgroundImageUrl = null,
    backgroundMarkup = null,
    backgroundColor = L.BACKGROUND_COLOR,
    maxFontSize = L.MAX_FONT_SIZE,
    fontFamily = 'sans-serif',
    fontBase64 = null,
    customElements = null,
    fitMode = 'natural',
    measureText = null,
  } = options;
  if (measureText !== null && typeof measureText !== 'function') {
    throw new TypeError('ens-v2 measureText must be a function');
  }
  if (!(width > 0) || !(height > 0)) {
    throw new RangeError(`ens-v2 needs a positive width and height, got ${width} × ${height}`);
  }
  // A missing colour (undefined/null) keeps its default instead of rendering fill="undefined".
  const colors = { ...L.COLORS };
  for (const [key, value] of Object.entries(options.colors || {})) {
    if (value != null) colors[key] = value;
  }
  const measuredText = decodeXmlEntities(String(text));

  // Scale the design to the card's short edge, anchored bottom-left.
  const k = Math.min(width, height) / L.DESIGN_SIZE;
  const fixedWidth = L.LABEL_X + 2 * L.LABEL_PADDING_X + L.ACCENT_SIZE + L.RIGHT_MARGIN;
  let textAreaWidth = width / k - fixedWidth;
  if (classifyText(measuredText).isInternational) {
    textAreaWidth *= ENS_LAYOUT.CJK_WIDTH_FACTOR;
  }

  const safeWidth = textAreaWidth * (1 - getTextMeasurementStrategy(measuredText).recommendedSafetyMargin);
  const measureAt = (t, size) => measureTextAccurate(t, size, fontFamily, { features: L.TEXT_FEATURES, measureText });
  const { step, fontSize, lines } = await layoutEnsV2Name(measuredText, safeWidth, L.LABEL_BOTTOM - L.LABEL_MIN_Y, maxFontSize, measureAt);
  const labelHeight = round3(ensV2LabelHeight(step, lines.length));
  const labelY = round3(L.LABEL_BOTTOM - labelHeight);
  const labelWidth = round3(2 * L.LABEL_PADDING_X + Math.max(...lines.map(line => line.width)));
  const labelRight = round3(L.LABEL_X + labelWidth);
  const firstBaseline = round3(labelY + L.LABEL_PADDING_Y + L.ASCENT * step.size);

  let backgroundElement = '';
  const solidFill = resolveColor(backgroundColor);
  if (typeof backgroundImageUrl === 'string' && backgroundImageUrl.startsWith('data:')) {
    backgroundElement = `<image href="${escapeXmlAttribute(backgroundImageUrl)}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`;
  } else if (typeof backgroundMarkup === 'string' && backgroundMarkup.length > 0) {
    backgroundElement = backgroundMarkup;
  } else if (solidFill && solidFill !== 'transparent') {
    backgroundElement = `<rect width="${width}" height="${height}" fill="${solidFill}"/>`;
  }

  const textElements = lines.map((line, i) => {
    const fitAttrs = fitMode === 'exact' && line.width
      ? ` textLength="${line.width.toFixed(2)}" lengthAdjust="spacingAndGlyphs"`
      : '';
    const fill = line.segment === 0 ? colors.accent : colors.parent;
    const y = round3(firstBaseline + i * step.pitch);
    return `<text x="${L.LABEL_X + L.LABEL_PADDING_X}" y="${y}" font-size="${fontSize}px" fill="${fill}"${fitAttrs}>${escapeXmlText(line.text)}</text>`;
  }).join('\n      ');

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
    ${backgroundElement}
    <g transform="translate(0 ${height - L.DESIGN_SIZE * k}) scale(${k})">
      <rect x="12" y="478" width="60" height="60" rx="${L.CORNER_RADIUS}" fill="${colors.accent}"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="${L.LOGO_PATH}" fill="${colors.logo}"/>
      <rect x="${L.LABEL_X}" y="${labelY}" width="${labelWidth}" height="${labelHeight}" rx="${L.CORNER_RADIUS}" fill="${colors.label}"/>
      ${textElements}
      <rect x="${labelRight}" y="${labelY - L.ACCENT_SIZE}" width="${L.ACCENT_SIZE}" height="${L.ACCENT_SIZE}" rx="${L.CORNER_RADIUS}" fill="${colors.accent}"/>
    </g>
    ${joinCustomElements(customElements)}
    <defs>
      ${textStyleDefs(fontFamily, fontBase64)}
      <style>
        /* Turn tnum on here too: rasterize-wasm only reads font-feature-settings. Chrome's default
           autospace adds ~1/8 em between CJK and Latin; the label is measured without it. */
        text {
          font-feature-settings: "ss01" on, "ss03" on, "tnum" on;
          -moz-font-feature-settings: "ss01" on, "ss03" on, "tnum" on;
          text-autospace: no-autospace;
        }
      </style>
    </defs>
  </svg>`;
  return new TextEncoder().encode(svg);
}

/**
 * Generate a dynamic SVG image with adaptive text layout
 * Supports international text, emojis, custom fonts, and background images
 * @param {Object} [options={}] - Configuration options
 * @param {number} [options.width=270] - Image width in pixels
 * @param {number} [options.height=270] - Image height in pixels
 * @param {string} [options.text='Hello World'] - Text to render
 * @param {number[]} [options.textColor=[255,255,255,1]] - RGBA color array
 * @param {string|null} [options.backgroundImageUrl=null] - URL to background image
 * @param {number|null} [options.textX=null] - Manual X position for text
 * @param {number|null} [options.textY=null] - Manual Y position for text
 * @param {number|null} [options.maxTextWidth=null] - Maximum text width constraint
 * @param {boolean} [options.autoFontSize=true] - Auto-calculate optimal font size
 * @param {boolean} [options.ensStyle=true] - Use ENS-style layout with logo
 * @param {number} [options.maxFontSize=68] - Maximum font size when auto-sizing
 * @param {number} [options.fontSize=48] - Manual font size (when autoFontSize=false)
 * @param {string} [options.fontFamily='sans-serif'] - Font family name
 * @param {string|null} [options.fontBase64=null] - Base64 font data to embed in SVG
 * @param {string[]|null} [options.customElements=null] - SVG fragments painted on top of the text (e.g. badges, indicators)
 * @param {string|number[]|null} [options.backgroundColor=null] - CSS color string ('#rgb', 'rgba(...)', 'transparent') or [r,g,b,a] array. When set without backgroundImageUrl, replaces the default gradient. `'transparent'` also suppresses the 12% overlay on background images.
 * @param {'natural'|'exact'} [options.fitMode='natural'] - `'natural'` lets the renderer shape the text at its own width (fastest). `'exact'` emits `textLength`+`lengthAdjust="spacingAndGlyphs"` so the renderer compresses or stretches glyphs to match the width the library measured — use this when the rasterizer's fonts differ from the library's measurement assumptions (e.g. server-side resvg with different fonts).
 * @param {'ens-v2'} [options.layout] - `'ens-v2'` renders the ENS v2 card (logo tile, name label, accent square). Omit for the layouts above. In this layout `width`/`height` default to 550, `maxFontSize` (default 60) is in 550-unit design space, `backgroundImageUrl` must be a `data:` URI, `backgroundColor` defaults to `'#F6FBFD'`, and `textColor`, `autoFontSize`, `fontSize`, `textX`/`textY`, `maxTextWidth` and `ensStyle` are ignored.
 * @param {string|null} [options.backgroundMarkup=null] - ens-v2 only: trusted SVG fragment covering width × height, inserted verbatim as the background when there is no avatar
 * @param {Function} [options.measureText] - ens-v2 only: `(text, fontSize, { features }) => width` (sync or async) used to measure the name,
 *   e.g. `(t, s, o) => renderer.measureText(t, s, { ...o, primaryFont: satoshi })` with rasterize-wasm. Gets the unescaped text.
 * @param {{label?: string, accent?: string, logo?: string, parent?: string}} [options.colors] - ens-v2 only: label `'#F6FBFD'`, accent `'#0082BB'` (logo tile, name, accent square), logo `'#F6FBFD'`, parent `'#80C4E0'` (a subname's parent labels)
 * @returns {Promise<Uint8Array>} SVG data as UTF-8 encoded byte array
 * @example
 * // Generate with default ENS style
 * const svg = await createDynamicSVGImage({
 *   text: 'vitalik.eth',
 *   width: 270,
 *   height: 270
 * });
 *
 * // With custom font
 * const fontData = await fetch('font.ttf').then(r => r.arrayBuffer());
 * await initializeFont(fontData);
 * const svg = await createDynamicSVGImage({
 *   text: 'Custom Font',
 *   fontFamily: 'MyFont',
 *   fontBase64: btoa(String.fromCharCode(...new Uint8Array(fontData)))
 * });
 */
async function createDynamicSVGImage(options = {}) {
  if (options.layout === 'ens-v2') {
    return createEnsV2SVGImage(options);
  }

  const {
    width = DEFAULTS.WIDTH,
    height = DEFAULTS.HEIGHT,
    text = DEFAULTS.TEXT,
    textColor = [255, 255, 255, 1],
    backgroundImageUrl = null,
    textX = null,
    textY = null,
    maxTextWidth = null,
    autoFontSize = true,
    ensStyle = true, // Enable ens-style layout by default
    maxFontSize = FONT_SIZE.DEFAULT_MAX,
    fontFamily = 'sans-serif', // Font family name (used for both embedded and fallback)
    fontBase64 = null, // Optional: base64 font data to embed in SVG with fontFamily name
    customElements = null, // Optional: array of SVG fragments to inject as overlays (painted on top of text)
    backgroundColor = null, // Optional: CSS color string ('#rgb', 'rgba(...)', 'transparent') or [r,g,b,a] array
    fitMode = 'natural' // 'natural' (default — browser/rasterizer measures): or 'exact' (emit textLength+lengthAdjust so the renderer fits glyphs to the library's measured width). Use 'exact' when the rasterizer's fonts differ from the library's measurement assumptions.
  } = options;

  const customElementsMarkup = joinCustomElements(customElements);
  const resolvedBackgroundColor = resolveColor(backgroundColor);

  // Calculate text area (leave substantial padding for international characters and emojis)
  const hasInternationalChars = classifyText(text).isInternational;
  // Calculate text area with special handling for CJK text
  const textAreaHeight = height * ENS_LAYOUT.TEXT_AREA_HEIGHT_FACTOR;
  let textAreaWidth, paddingX, paddingY;

  if (ensStyle && hasInternationalChars) {
    // Conservative calculation only for CJK text
    const availableWidth = width - ENS_LAYOUT.LOGO_X_POSITION - ENS_LAYOUT.RIGHT_PADDING;
    textAreaWidth = maxTextWidth || (availableWidth * ENS_LAYOUT.CJK_WIDTH_FACTOR);
    paddingX = ENS_LAYOUT.LOGO_X_POSITION;
    paddingY = ENS_LAYOUT.PADDING_Y;
  } else {
    // Original logic for Latin text
    const paddingMultiplier = hasInternationalChars ? ENS_LAYOUT.INTL_PADDING_MULTIPLIER : ENS_LAYOUT.LATIN_PADDING_MULTIPLIER;
    textAreaWidth = maxTextWidth || (width * paddingMultiplier);
    paddingX = (width - textAreaWidth) / 2;
    paddingY = (height - textAreaHeight) / 2;
  }

  // Calculate optimal font size if auto-sizing is enabled
  let fontSize = options.fontSize || FONT_SIZE.DEFAULT;
  let metrics = null;
  if (autoFontSize && text && text.trim()) {
    const result = await calculateFontSize(text, textAreaWidth, textAreaHeight, FONT_SIZE.DEFAULT_MIN, maxFontSize, fontFamily);
    fontSize = result.fontSize;
    metrics = result.metrics;
    debug(`Auto-calculated font size: ${fontSize}px for text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}" (${metrics.isAccurate ? 'OpenType' : 'fallback'} measurement)`);
  } else {
    // Manual fontSize: trust the caller. maxFontSize only bounds the auto-sizer.
    metrics = await measureTextAccurate(text, fontSize, fontFamily);
  }

  // Text at bottom center
  let finalTextX, finalTextY;
  let textAnchor = 'middle';
  let dominantBaseline = 'alphabetic';

  if (textX !== null && textY !== null) {
    // Use explicit positioning if provided
    finalTextX = textX;
    finalTextY = textY;
  } else if (ensStyle) {
    // left align with logo, bottom with padding
    finalTextX = ENS_LAYOUT.LOGO_X_POSITION;
    finalTextY = height - ENS_LAYOUT.BOTTOM_PADDING;
    textAnchor = 'start'; // Left align text
  } else {
    // Default: center both ways
    finalTextX = width / 2;
    finalTextY = height / 2;
    dominantBaseline = 'central';
  }

  const textColorRGB = `rgb(${textColor[0]}, ${textColor[1]}, ${textColor[2]})`;

  // Overlay is applied on top of the background image for contrast.
  // Skipped when the caller explicitly asks for a transparent background.
  const overlayRect = resolvedBackgroundColor === 'transparent'
    ? ''
    : `<rect width="${width}" height="${height}" fill="#000" fill-opacity="${VISUAL_EFFECTS.BACKGROUND_OVERLAY_OPACITY}"/>`;

  // Fallback rect when there's no image: caller-provided color if set, otherwise the ENS gradient.
  const solidBackgroundFill = resolvedBackgroundColor && resolvedBackgroundColor !== 'transparent'
    ? resolvedBackgroundColor
    : 'url(#paint0_linear)';
  const solidBackgroundRect = resolvedBackgroundColor === 'transparent'
    ? ''
    : `<rect width="${width}" height="${height}" fill="${solidBackgroundFill}"/>`;

  // Create background element with background
  let backgroundElement = '';
  if (backgroundImageUrl) {
    if (backgroundImageUrl.startsWith('data:')) {
      // Data URI — embed directly. Avoids fetch() size limits on large payloads
      // and skips a pointless base64 → bytes → base64 round-trip.
      backgroundElement = `<image href="${backgroundImageUrl}" width="${width}" height="${height}"/>
      ${overlayRect}`;
    } else {
      try {
        const imageResponse = await fetch(backgroundImageUrl);
        if (imageResponse.ok) {
          const imageBuffer = await imageResponse.arrayBuffer();
          const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
          const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
          backgroundElement = `<image href="data:${contentType};base64,${imageBase64}" width="${width}" height="${height}"/>
          ${overlayRect}`;
        } else {
          debugWarn(`Failed to fetch background image: ${imageResponse.status}`);
          backgroundElement = solidBackgroundRect;
        }
      } catch (error) {
        debugWarn('Error fetching background image:', error);
        backgroundElement = solidBackgroundRect;
      }
    }
  } else {
    backgroundElement = solidBackgroundRect;
  }

  if (ensStyle) {
    const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
    ${backgroundElement}
    <defs>
      <filter id="dropShadow" x="${-width}" y="${-height}" width="${width * 3}" height="${height * 3}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation="${VISUAL_EFFECTS.DROP_SHADOW_BLUR}"/>
        <feOffset dx="0" dy="${VISUAL_EFFECTS.DROP_SHADOW_DY}" result="shadowOffset"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="${VISUAL_EFFECTS.DROP_SHADOW_OPACITY}"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <g transform="scale(${ENS_LAYOUT.LOGO_SCALE})">
      <path d="M38.0397 51.0875C38.5012 52.0841 39.6435 54.0541 39.6435 54.0541L52.8484 32L39.9608 41.0921C39.1928 41.6096 38.5628 42.3102 38.1263 43.1319C37.5393 44.3716 37.2274 45.7259 37.2125 47.1C37.1975 48.4742 37.4799 49.8351 38.0397 51.0875Z" fill="white" filter="url(#dropShadow)"/>
      <path d="M32.152 59.1672C32.3024 61.2771 32.9122 63.3312 33.9405 65.1919C34.9689 67.0527 36.3921 68.6772 38.1147 69.9567L52.8487 80C52.8487 80 43.6303 67.013 35.8549 54.0902C35.0677 52.7249 34.5385 51.2322 34.2926 49.6835C34.1838 48.9822 34.1838 48.2689 34.2926 47.5676C34.0899 47.9348 33.6964 48.6867 33.6964 48.6867C32.908 50.2586 32.371 51.9394 32.1043 53.6705C31.9508 55.5004 31.9668 57.3401 32.152 59.1672Z" fill="white" filter="url(#dropShadow)"/>
      <path d="M70.1927 60.9125C69.6928 59.9159 68.4555 57.946 68.4555 57.946L54.1514 80L68.1118 70.9138C68.9436 70.3962 69.6261 69.6956 70.099 68.8739C70.7358 67.6334 71.0741 66.2781 71.0903 64.9029C71.1065 63.5277 70.8001 62.1657 70.1927 60.9125Z" fill="white" filter="url(#dropShadow)"/>
      <path d="M74.8512 52.8328C74.7008 50.7229 74.0909 48.6688 73.0624 46.8081C72.0339 44.9473 70.6105 43.3228 68.8876 42.0433L54.1514 32C54.1514 32 63.3652 44.987 71.1478 57.9098C71.933 59.2755 72.4603 60.7682 72.7043 62.3165C72.8132 63.0178 72.8132 63.7311 72.7043 64.4324C72.9071 64.0652 73.3007 63.3133 73.3007 63.3133C74.0892 61.7414 74.6262 60.0606 74.893 58.3295C75.0485 56.4998 75.0345 54.66 74.8512 52.8328Z" fill="white" filter="url(#dropShadow)"/>
    </g>
    <text
      x="${finalTextX}"
      y="${finalTextY}"
      font-size="${fontSize}px"
      fill="white"
      filter="url(#dropShadow)"
      text-anchor="${textAnchor}"${fitMode === 'exact' && metrics?.width ? ` textLength="${metrics.width.toFixed(2)}" lengthAdjust="spacingAndGlyphs"` : ''}>${text}</text>
    ${customElementsMarkup}
    <defs>
      ${textStyleDefs(fontFamily, fontBase64)}
      <linearGradient id="paint0_linear" x1="190.5" y1="302" x2="-64" y2="-172.5" gradientUnits="userSpaceOnUse">
        <stop stop-color="#44BCF0"/>
        <stop offset="0.428185" stop-color="#628BF3"/>
        <stop offset="1" stop-color="#A099FF"/>
      </linearGradient>
    </defs>
  </svg>`;
    const encoder = new TextEncoder();
    return encoder.encode(svg);
  } else {
    // Original flexible layout for custom style
    const metricsComment = `<!-- Text metrics: width=${metrics.width.toFixed(1)}px, height=${metrics.height.toFixed(1)}px, fontSize=${fontSize}px, font=${metrics.fontName || 'fallback'}, accurate=${metrics.isAccurate} -->
    <!-- Layout: textArea=${textAreaWidth}x${textAreaHeight}, padding=${paddingX}x${paddingY}, textPos=${finalTextX},${finalTextY} -->`;

    const fitAttrs = fitMode === 'exact' && metrics?.width
      ? ` textLength="${metrics.width.toFixed(2)}" lengthAdjust="spacingAndGlyphs"`
      : '';
    const textElement = `<text x="${finalTextX}" y="${finalTextY}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="${textColorRGB}" text-anchor="${textAnchor}" dominant-baseline="${dominantBaseline}"${fitAttrs}>${text}</text>`;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  ${metricsComment}
  ${backgroundElement}
  ${textElement}
  ${customElementsMarkup}
</svg>`;
    const encoder = new TextEncoder();
    return encoder.encode(svg);
  }
}

/**
 * Enable or disable debug logging
 * @param {boolean} enabled - Whether to enable debug logging
 */
function setDebugMode(enabled) {
  debugEnabled = enabled;
}

// Export library functions
export {
  createDynamicSVGImage,
  measureTextAccurate,
  calculateFontSize,
  initializeFont,
  setDebugMode
};
