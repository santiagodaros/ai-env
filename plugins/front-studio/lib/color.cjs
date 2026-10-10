// Color para front-studio: parseo de CSS, contraste WCAG 2.x y OKLCH (escalas perceptuales). Sin dependencias.
'use strict';

const NAMED = { white: '#ffffff', black: '#000000', transparent: null, red: '#ff0000', blue: '#0000ff', green: '#008000', gray: '#808080', grey: '#808080', orange: '#ffa500', purple: '#800080', yellow: '#ffff00' };

function clamp01(x) { return Math.min(1, Math.max(0, x)); }

// Devuelve [r,g,b] 0..255 o null si no es un color literal reconocible.
function parse(input) {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (s in NAMED) return NAMED[s] ? parse(NAMED[s]) : null;
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
    if (h.length === 8) h = h.slice(0, 6);
    if (h.length !== 6) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = s.match(/^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)/);
  if (m) return [m[1], m[2], m[3]].map((v) => Math.round(v.endsWith('%') ? parseFloat(v) * 2.55 : parseFloat(v)));
  m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  if (m) return hslToRgb(+m[1], +m[2] / 100, +m[3] / 100);
  m = s.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/);
  if (m) return oklchToRgb({ l: m[2] ? +m[1] / 100 : +m[1], c: +m[3], h: +m[4] });
  return null;
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

const hex = (rgb) => '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

// Luminancia relativa y contraste según WCAG 2.x (umbral 0.03928 de la especificación).
function luminance(rgb) {
  const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}
function contrast(a, b) {
  const A = Array.isArray(a) ? a : parse(a), B = Array.isArray(b) ? b : parse(b);
  if (!A || !B) throw new Error(`Color inválido: ${!A ? a : b}`);
  const [l1, l2] = [luminance(A), luminance(B)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// OKLab / OKLCH (Björn Ottosson).
const toLin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const fromLin = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function rgbToOklab(rgb) {
  const [r, g, b] = rgb.map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}
function oklabToLinear({ L, a, b }) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
function rgbToOklch(rgb) {
  const { L, a, b } = rgbToOklab(rgb);
  const c = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI; if (h < 0) h += 360;
  return { l: L, c, h };
}
// Convierte OKLCH a sRGB reduciendo el croma hasta que entre en la gama (mantiene luminosidad y tono).
function oklchToRgb({ l, c, h }) {
  const at = (cc) => { const hr = (h * Math.PI) / 180; return oklabToLinear({ L: l, a: cc * Math.cos(hr), b: cc * Math.sin(hr) }); };
  const inGamut = (lin) => lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
  let lin = at(c);
  if (!inGamut(lin)) {
    let lo = 0, hi = c;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(at(mid))) lo = mid; else hi = mid; }
    lin = at(lo);
  }
  return lin.map((v) => fromLin(clamp01(v))).map(Math.round);
}
// Distancia perceptual simple (OKLab euclídea). ~0.02 casi igual, ~0.1 claramente distinto.
function distance(a, b) {
  const A = rgbToOklab(Array.isArray(a) ? a : parse(a)), B = rgbToOklab(Array.isArray(b) ? b : parse(b));
  return Math.hypot(A.L - B.L, A.a - B.a, A.b - B.b);
}

module.exports = { parse, hex, luminance, contrast, rgbToOklch, oklchToRgb, rgbToOklab, distance };
