#!/usr/bin/env node
// Contraste WCAG 2.x. Uso: node contrast.cjs "#fondo:#texto" ["#fondo:#texto" ...]
// Imprime la razón y si pasa AA texto normal (4.5), AA texto grande / UI (3) y AAA texto normal (7).

function toRgb(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Color inválido: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function lum([r, g, b]) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const [l1, l2] = [lum(toRgb(a)), lum(toRgb(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const pairs = process.argv.slice(2);
if (!pairs.length) {
  console.error('Uso: node contrast.cjs "#fondo:#texto" ["#fondo:#texto" ...]');
  process.exit(2);
}
let bad = 0;
for (const p of pairs) {
  const [bg, fg] = p.split(':');
  try {
    const r = ratio(bg, fg);
    const aa = r >= 4.5, aaL = r >= 3, aaa = r >= 7;
    if (!aaL) bad++;
    console.log(`${bg} / ${fg}  ${r.toFixed(2)}:1  AA texto ${aa ? 'PASA' : 'NO'}  AA grande/UI ${aaL ? 'PASA' : 'NO'}  AAA ${aaa ? 'PASA' : 'NO'}`);
  } catch (e) {
    console.error(e.message);
    bad++;
  }
}
process.exit(bad ? 1 : 0);
