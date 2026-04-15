// @ts-nocheck
/**
 * Nowhere Avatar Generator
 *
 * Deterministic avatar generation from a seed string (e.g. pubkey).
 * Framework-agnostic — returns SVG strings. No dependencies.
 *
 * Usage:
 *   import { generateAvatar } from './nowhere-avatar.js';
 *   const svg = generateAvatar('some-seed-string', 48);
 */

// ── Feature SVG templates ──────────────────────────────────────────────
// ${color} placeholders are replaced at render time with the computed feature color.

const FEATURES = {
  eyes: {
    wink:
      '<path d="M35 38 Q38 34 41 38 Q38 42 35 38Z" fill="${color}" />\n<path d="M58 39 Q62 36 66 39" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />',
    starEyes:
      '<polygon points="38,33 39.5,36 43,36 40.5,38.5 41.5,42 38,39.5 34.5,42 35.5,38.5 33,36 36.5,36" fill="${color}" />\n<polygon points="62,33 63.5,36 67,36 64.5,38.5 65.5,42 62,39.5 58.5,42 59.5,38.5 57,36 60.5,36" fill="${color}" />',
    dots:
      '<circle cx="38" cy="38" r="2.5" fill="${color}" />\n<circle cx="62" cy="38" r="2.5" fill="${color}" />',
    sleepy:
      '<path d="M33 38 Q38 35 43 38" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />\n<path d="M57 38 Q62 35 67 38" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />\n<path d="M34 37 L42 37" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />\n<path d="M58 37 L66 37" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />',
    crazy:
      '<circle cx="38" cy="38" r="5" fill="${color}" />\n<circle cx="62" cy="38" r="5" fill="${color}" />\n<circle cx="40" cy="36" r="1.5" fill="white" />\n<circle cx="60" cy="40" r="1.5" fill="white" />',
    bigSmall:
      '<circle cx="38" cy="38" r="6" fill="${color}" />\n<circle cx="39.5" cy="36.5" r="2" fill="white" />\n<circle cx="62" cy="39" r="3.5" fill="${color}" />\n<circle cx="63" cy="38" r="1" fill="white" />',
    default:
      '<path d="M38 34 L38 42" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />\n<path d="M62 34 L62 42" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    closed:
      '<path d="M34 38 Q38 35 42 38" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />\n<path d="M58 38 Q62 35 66 38" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />',
    x:
      '<path d="M34 35 L42 41 M42 35 L34 41" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />\n<path d="M58 35 L66 41 M66 35 L58 41" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    wide:
      '<circle cx="38" cy="38" r="5" fill="${color}" />\n<circle cx="62" cy="38" r="5" fill="${color}" />\n<circle cx="39.5" cy="36.5" r="1.5" fill="white" />\n<circle cx="63.5" cy="36.5" r="1.5" fill="white" />',
    squint:
      '<path d="M33 38 Q38 33 43 38 Q38 40 33 38Z" fill="${color}" />\n<path d="M57 38 Q62 33 67 38 Q62 40 57 38Z" fill="${color}" />',
  },

  eyebrows: {
    skeptical:
      '<path d="M33 30 L43 30" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />\n<path d="M57 28 Q62 24 67 28" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    highUp:
      '<path d="M33 25 Q38 22 43 25" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />\n<path d="M57 25 Q62 22 67 25" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    thick:
      '<path d="M33 30 Q38 26 43 30" fill="${color}" stroke="${color}" stroke-width="1" stroke-linecap="round" />\n<path d="M57 30 Q62 26 67 30" fill="${color}" stroke="${color}" stroke-width="1" stroke-linecap="round" />',
    tiny:
      '<path d="M36 29 L40 28" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />\n<path d="M60 28 L64 29" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />',
    villain:
      '<path d="M33 30 L38 26 L43 28" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />\n<path d="M57 28 L62 26 L67 30" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />',
    flatUnibrow:
      '<path d="M33 29 L67 29" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    default:
      '<path d="M33 30 Q38 27 43 30" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />\n<path d="M57 30 Q62 27 67 30" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    confused:
      '<path d="M33 32 L43 28" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />\n<path d="M57 28 L67 32" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    angry:
      '<path d="M33 28 L43 32" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />\n<path d="M57 32 L67 28" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    raised:
      '<path d="M33 28 Q38 23 43 28" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />\n<path d="M57 28 Q62 23 67 28" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    flat:
      '<path d="M33 29 L43 29" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />\n<path d="M57 29 L67 29" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    unibrow:
      '<path d="M33 29 Q38 25 50 27 Q62 25 67 29" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
  },

  mouths: {
    singleTooth:
      '<path d="M40 55 Q50 65 60 55" fill="${color}" />\n<rect x="48" y="55" width="6" height="5" rx="1" fill="white" />',
    blep:
      '<path d="M40 57 Q50 60 60 57" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />\n' +
      '<path d="M47 58 Q47 65 50 66 Q53 65 53 58" fill="#e84057" />',
    smile:
      '<path d="M40 56 Q50 65 60 56" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    open:
      '<path d="M40 58 Q50 71 60 58 Z" fill="${color}" />',
    serious:
      '<path d="M42 57 L58 57" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    grimace:
      '<rect x="40" y="53" width="20" height="9" rx="2" fill="white" stroke="${color}" stroke-width="2" />\n' +
      '<line x1="45" y1="53" x2="45" y2="62" stroke="${color}" stroke-width="1" />\n' +
      '<line x1="50" y1="53" x2="50" y2="62" stroke="${color}" stroke-width="1" />\n' +
      '<line x1="55" y1="53" x2="55" y2="62" stroke="${color}" stroke-width="1" />',
    sad:
      '<path d="M40 60 Q50 52 60 60" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    tongue:
      '<path d="M38 55 Q50 68 62 55 Z" fill="${color}" />\n<path d="M44 59 Q44 66 50 67 Q56 66 56 59" fill="#e84057" />',
    scream:
      '<ellipse cx="50" cy="62" rx="5" ry="11" fill="${color}" />\n' +
      '<path d="M46 67 Q50 73 54 67" fill="#e84057" />',
    bucktooth:
      '<path d="M39 57 L61 57" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />\n' +
      '<rect x="46.5" y="56.5" width="3" height="7" rx="0.8" fill="white" stroke="${color}" stroke-width="0.5" />\n' +
      '<rect x="50.5" y="56.5" width="3" height="7" rx="0.8" fill="white" stroke="${color}" stroke-width="0.5" />',
    wavy:
      '<path d="M38 57 Q42 53 46 57 Q50 61 54 57 Q58 53 62 57" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    smallO:
      '<circle cx="50" cy="58" r="4" fill="${color}" />',
    disgruntled:
      '<path d="M42 57 Q46 57 52 55 Q56 54 60 56" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    smirk:
      '<path d="M40 57 L52 57 Q58 57 60 53" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />',
    fangs:
      '<path d="M38 55 Q50 68 62 55 Z" fill="${color}" />\n' +
      '<path d="M42 55 L44.5 63 L47 55" fill="white" />\n' +
      '<path d="M53 55 L55.5 63 L58 55" fill="white" />',
    zigzag:
      '<path d="M38 57 L42 54 L46 60 L50 54 L54 60 L58 54 L62 57" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />',
  },

  noses: {
    dots:
      '<circle cx="47" cy="48" r="1.5" fill="${color}" />\n<circle cx="53" cy="48" r="1.5" fill="${color}" />',
    full:
      '<path d="M46 42 Q44 48 47 50 Q50 51 53 50 Q56 48 54 42" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" />',
    wideFlat:
      '<path d="M44 48 Q47 50 50 48 Q53 50 56 48" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" />',
    snout:
      '<circle cx="50" cy="47" r="4" fill="none" stroke="${color}" stroke-width="1.5" />',
    upturned:
      '<path d="M47 48 Q50 44 53 48" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" />',
    none: '',
    default:
      '<path d="M48 47 Q50 50 52 47" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" />',
    pointed:
      '<path d="M50 43 L47 49 L53 49Z" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" />',
    round:
      '<circle cx="50" cy="47" r="2.5" fill="none" stroke="${color}" stroke-width="1.5" />',
  },

  glasses: {
    none: '',
    aviator:
      '<path d="M28 34 Q28 30 38 30 Q48 30 48 34 Q48 44 38 44 Q28 44 28 34Z" fill="none" stroke="${color}" stroke-width="1.8" />\n' +
      '<path d="M52 34 Q52 30 62 30 Q72 30 72 34 Q72 44 62 44 Q52 44 52 34Z" fill="none" stroke="${color}" stroke-width="1.8" />\n' +
      '<path d="M48 35 L52 35" fill="none" stroke="${color}" stroke-width="1.8" />',
    thickRim:
      '<circle cx="38" cy="38" r="9" fill="none" stroke="${color}" stroke-width="4" />\n<circle cx="62" cy="38" r="9" fill="none" stroke="${color}" stroke-width="4" />\n<path d="M47 38 L53 38" fill="none" stroke="${color}" stroke-width="4" />',
    round:
      '<circle cx="38" cy="38" r="9" fill="none" stroke="${color}" stroke-width="2" />\n<circle cx="62" cy="38" r="9" fill="none" stroke="${color}" stroke-width="2" />\n<path d="M47 38 L53 38" fill="none" stroke="${color}" stroke-width="2" />',
    square:
      '<rect x="29" y="31" width="18" height="14" rx="2" fill="none" stroke="${color}" stroke-width="2" />\n<rect x="53" y="31" width="18" height="14" rx="2" fill="none" stroke="${color}" stroke-width="2" />\n<path d="M47 38 L53 38" fill="none" stroke="${color}" stroke-width="2" />',
    patch:
      '<path d="M8 32 L28 38" stroke="${color}" stroke-width="2" stroke-linecap="round" />\n<path d="M48 38 L92 32" stroke="${color}" stroke-width="2" stroke-linecap="round" />\n<ellipse cx="38" cy="38" rx="10" ry="9" fill="${color}" />',
    monocle:
      '<circle cx="62" cy="38" r="9" fill="none" stroke="${color}" stroke-width="2" />\n<path d="M71 38 Q76 58 68 86" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" />',
    hearts:
      '<path d="M38 46 C38 46 30 42 30 37 C30 33 33 31 38 35 C43 31 46 33 46 37 C46 42 38 46 38 46Z" fill="none" stroke="${color}" stroke-width="1.8" />\n' +
      '<path d="M62 46 C62 46 54 42 54 37 C54 33 57 31 62 35 C67 31 70 33 70 37 C70 42 62 46 62 46Z" fill="none" stroke="${color}" stroke-width="1.8" />\n' +
      '<path d="M46 38 L54 38" fill="none" stroke="${color}" stroke-width="1.8" />',
    tiny:
      '<circle cx="38" cy="38" r="5" fill="none" stroke="${color}" stroke-width="1.5" />\n<circle cx="62" cy="38" r="5" fill="none" stroke="${color}" stroke-width="1.5" />\n<path d="M43 38 L57 38" fill="none" stroke="${color}" stroke-width="1.5" />',
  },

  cheeks: {
    none: '',
    blush:
      '<g opacity="0.25">\n<circle cx="28" cy="50" r="6" fill="#ff6b8a" />\n<circle cx="72" cy="50" r="6" fill="#ff6b8a" />\n</g>',
    dimples:
      '<g opacity="0.35">\n<path d="M30 54 Q32 56 30 58" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" />\n<path d="M70 54 Q68 56 70 58" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" />\n</g>',
  },

  freckles: {
    default:
      '<g opacity="0.4">\n' +
      '<circle cx="32" cy="48" r="1.2" fill="${color}" />\n' +
      '<circle cx="36" cy="45" r="1" fill="${color}" />\n' +
      '<circle cx="34" cy="51" r="1.1" fill="${color}" />\n' +
      '<circle cx="38" cy="49" r="0.9" fill="${color}" />\n' +
      '<circle cx="30" cy="45" r="1" fill="${color}" />\n' +
      '<circle cx="62" cy="45" r="1" fill="${color}" />\n' +
      '<circle cx="66" cy="48" r="1.2" fill="${color}" />\n' +
      '<circle cx="64" cy="51" r="1.1" fill="${color}" />\n' +
      '<circle cx="68" cy="45" r="1" fill="${color}" />\n' +
      '<circle cx="60" cy="49" r="0.9" fill="${color}" />\n' +
      '</g>',
  },

  crown: {
    default:
      '<path d="M26 21 L28 7 L38 17 L50 4 L62 17 L72 7 L74 21 Z" fill="${color}" />\n' +
      '<circle cx="28" cy="7" r="2.5" fill="${color}" />\n' +
      '<circle cx="50" cy="4" r="3" fill="${color}" />\n' +
      '<circle cx="72" cy="7" r="2.5" fill="${color}" />\n' +
      '<rect x="26" y="19" width="48" height="4" rx="1" fill="${color}" />',
  },

  halo: {
    default:
      '<ellipse cx="50" cy="11" rx="18" ry="4" fill="none" stroke="#DAA520" stroke-width="2.5" opacity="0.6" />',
  },

  bandage: {
    default:
      '<rect x="62" y="46" width="12" height="6" rx="1.5" fill="${color}" opacity="0.3" />\n' +
      '<path d="M65 47 L71 51 M71 47 L65 51" stroke="${color}" stroke-width="1.2" stroke-linecap="round" opacity="0.5" />',
  },

  sparkles: {
    default:
      '<path d="M18 30 L19.5 27 L21 30 L24 31.5 L21 33 L19.5 36 L18 33 L15 31.5 Z" fill="${color}" opacity="0.6" />\n' +
      '<path d="M82 25 L83.5 22 L85 25 L88 26.5 L85 28 L83.5 31 L82 28 L79 26.5 Z" fill="${color}" opacity="0.55" />\n' +
      '<path d="M13 58 L14 56.5 L15 58 L16.5 58.5 L15 59 L14 60.5 L13 59 L11.5 58.5 Z" fill="${color}" opacity="0.5" />\n' +
      '<path d="M86 55 L87.5 52.5 L89 55 L91 56 L89 57 L87.5 59.5 L86 57 L84 56 Z" fill="${color}" opacity="0.6" />\n' +
      '<path d="M22 70 L23 68.5 L24 70 L25.5 70.5 L24 71 L23 72.5 L22 71 L20.5 70.5 Z" fill="${color}" opacity="0.45" />',
  },
};

// ── Constants ──────────────────────────────────────────────────────────

const DISABLED_GLASSES = ['stars'];

const CALL_ORDER = [
  'eyebrows', 'eyes', 'glasses', 'nose', 'mouth', 'bandage', 'freckles',
  'sparkles', 'cheeks', 'headwear', 'color1', 'color2', 'gradient',
  'bw', 'upsideDown',
];

const GRADIENT_TYPES = [
  { x1: '0%',  y1: '100%', x2: '100%', y2: '0%'   }, // ↗
  { x1: '50%', y1: '0%',   x2: '50%',  y2: '100%' }, // ↓
  { x1: '0%',  y1: '50%',  x2: '100%', y2: '50%'  }, // →
  { x1: '0%',  y1: '0%',   x2: '100%', y2: '100%' }, // ↘
];

const MIN_FEATURE_CONTRAST = 2.5;

// ── Color helpers ──────────────────────────────────────────────────────

function hslToHex(h, s, l) {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}

function relativeLuminance(hex) {
  const vals = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2];
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── PRNG ───────────────────────────────────────────────────────────────

function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function createPrng(seed) {
  const h = cyrb128(seed);
  let s0 = h[0] || 1, s1 = h[1] || 2, s2 = h[2] || 3, s3 = h[3] || 4;

  function next() {
    const t = s3;
    let s = s0;
    s3 = s2; s2 = s1; s1 = s0;
    s ^= s << 11;
    s ^= s >>> 8;
    s ^= t ^ (t >>> 19);
    s0 = s;
    return s >>> 0;
  }

  function float() { return next() / 4294967296; }
  function integer(min, max) { return min + Math.floor(float() * (max + 1 - min)); }
  function bool(likelihood) { return integer(1, 100) <= likelihood; }
  function pick(arr) {
    if (arr.length === 0) { next(); return undefined; }
    return arr[integer(0, arr.length - 1)];
  }

  return { next, float, integer, bool, pick };
}

// ── Internal helpers ───────────────────────────────────────────────────

function rotateArray(arr, offset) {
  if (!offset) return arr;
  const n = arr.length;
  const o = ((offset % n) + n) % n;
  return [...arr.slice(o), ...arr.slice(0, o)];
}

function renderFeature(template, color) {
  if (!template) return '';
  return template.replaceAll('${color}', color);
}

function generateSeededColor(prng) {
  let h = prng.integer(0, 359);
  let s = prng.integer(30, 89);
  let l = prng.integer(40, 74);
  let hex = hslToHex(h, s, l);
  while (contrastRatio(hex, '#333333') < MIN_FEATURE_CONTRAST) {
    l = Math.min(l + 5, 85);
    hex = hslToHex(h, s, l);
    if (l >= 85) break;
  }
  return hex;
}

// ── Core generation ────────────────────────────────────────────────────

function selectFeatures(seed, features, offsets) {
  const prng = createPrng(seed);
  const feat = features || FEATURES;
  const o = offsets || {};

  const eyeKeys = Object.keys(feat.eyes);
  const browKeys = Object.keys(feat.eyebrows);
  const mouthKeys = Object.keys(feat.mouths);
  const noseKeys = Object.keys(feat.noses);
  const glassKeys = Object.keys(feat.glasses).filter((k) => !DISABLED_GLASSES.includes(k));
  const activeGlass = glassKeys.filter((k) => k !== 'none');
  const activeCheeks = Object.keys(feat.cheeks).filter((k) => k !== 'none');

  const result = {};

  for (const group of CALL_ORDER) {
    switch (group) {
      case 'color1': result.color1 = generateSeededColor(prng); break;
      case 'color2': result.color2 = generateSeededColor(prng); break;
      case 'gradient':
        result.gradDir = (prng.integer(0, GRADIENT_TYPES.length - 1) + (o.gradient || 0)) % GRADIENT_TYPES.length;
        break;
      case 'eyes': result.eyes = prng.pick(rotateArray(eyeKeys, o.eyes)); break;
      case 'eyebrows': result.eyebrows = prng.pick(rotateArray(browKeys, o.eyebrows)); break;
      case 'mouth': result.mouth = prng.pick(rotateArray(mouthKeys, o.mouth)); break;
      case 'nose': result.nose = prng.pick(rotateArray(noseKeys, o.nose)); break;
      case 'glasses': {
        const hasGlasses = !prng.bool(65);
        const glassPick = prng.pick(rotateArray(activeGlass.length > 0 ? activeGlass : ['none'], o.glasses));
        result.glasses = hasGlasses ? glassPick : 'none';
        break;
      }
      case 'freckles': result.freckles = prng.bool(5); break;
      case 'headwear': {
        const hit = prng.integer(1, 105000) === 3268;
        const isHalo = prng.bool(50);
        result.crown = hit && !isHalo;
        result.halo = hit && isHalo;
        break;
      }
      case 'bandage': result.bandage = prng.integer(1, 1000) === 1; break;
      case 'cheeks': {
        const hasCheeks = prng.bool(15);
        const cheekPick = prng.pick(rotateArray(activeCheeks.length > 0 ? activeCheeks : ['none'], o.cheeks));
        result.cheeks = hasCheeks ? cheekPick : 'none';
        break;
      }
      case 'upsideDown': result.upsideDown = prng.integer(1, 100000) === 94638; break;
      case 'sparkles': result.sparkles = prng.integer(1, 210000) === 94638; break;
      case 'bw': result.bw = prng.integer(1, 500000) === 94638; break;
    }
  }

  return result;
}

function buildSvg(selected, size, seed, features) {
  const feat = features || FEATURES;
  const gradType = GRADIENT_TYPES[selected.gradDir] || GRADIENT_TYPES[0];
  const uid = 'g' + cyrb128(seed)[0].toString(36);
  const featureColor = '#333333';
  const rotation = selected.upsideDown ? ' rotate(180, 50, 50)' : '';
  const featureTransform = 'translate(50, 50) scale(1.35) translate(-50, -47)' + rotation;

  // Overlays (crown, halo, sparkles) render outside the scaled group
  const overlayParts = [
    selected.halo ? renderFeature(feat.halo.default, featureColor) : '',
    selected.crown ? renderFeature(feat.crown.default, featureColor) : '',
    selected.sparkles ? renderFeature(feat.sparkles.default, featureColor) : '',
  ].filter(Boolean).join('\n');
  const overlaysSvg = overlayParts && selected.upsideDown
    ? '<g transform="rotate(180, 50, 50)">' + overlayParts + '</g>'
    : overlayParts;

  const featureSvg = [
    renderFeature(feat.eyebrows[selected.eyebrows], featureColor),
    renderFeature(feat.eyes[selected.eyes], featureColor),
    selected.freckles ? renderFeature(feat.freckles.default, featureColor) : '',
    renderFeature(feat.cheeks[selected.cheeks], featureColor),
    selected.bandage ? renderFeature(feat.bandage.default, featureColor) : '',
    renderFeature(feat.noses[selected.nose], featureColor),
    renderFeature(feat.mouths[selected.mouth], featureColor),
    renderFeature(feat.glasses[selected.glasses], featureColor),
  ].filter(Boolean).join('\n');

  let bgSvg;
  if (selected.bw) {
    bgSvg = '<rect x="0" y="0" width="100" height="100" rx="12" fill="white" />';
  } else {
    bgSvg =
      '<defs><linearGradient id="' + uid + '" x1="' + gradType.x1 + '" y1="' + gradType.y1 +
      '" x2="' + gradType.x2 + '" y2="' + gradType.y2 + '">' +
      '<stop offset="0%" stop-color="' + selected.color1 + '" />' +
      '<stop offset="100%" stop-color="' + selected.color2 + '" />' +
      '</linearGradient></defs>' +
      '<rect x="0" y="0" width="100" height="100" rx="12" fill="url(#' + uid + ')" />';
  }

  return (
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
    bgSvg + overlaysSvg +
    '<g transform="' + featureTransform + '">' + featureSvg + '</g>' +
    '</svg>'
  );
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Generate an avatar SVG string from a seed.
 * @param {string} seed - Unique identifier (pubkey, user ID, etc.)
 * @param {number} [size=48] - Width/height in pixels.
 * @returns {string} Complete SVG markup.
 */
export function generateAvatar(seed, size = 48) {
  const selected = selectFeatures(seed);
  return buildSvg(selected, size, seed);
}

/**
 * Generate avatar feature selections without rendering.
 * Useful if you need to inspect or cache the selected traits.
 * @param {string} seed
 * @returns {object} Selected feature keys and colors.
 */
export function getAvatarFeatures(seed) {
  return selectFeatures(seed);
}

/**
 * Render an SVG from pre-computed feature selections.
 * Pair with getAvatarFeatures() for cache/reuse scenarios.
 * @param {object} selected - Output of getAvatarFeatures().
 * @param {number} [size=48]
 * @returns {string} Complete SVG markup.
 */
export function renderAvatarSvg(selected, size = 48, seed = '') {
  return buildSvg(selected, size, seed);
}
