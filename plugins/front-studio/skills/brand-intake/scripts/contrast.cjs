#!/usr/bin/env node
// Contraste WCAG 2.x. Uso: node contrast.cjs "#fondo:#texto" ["#fondo:#texto" ...]
// Acepta hex, rgb(), hsl() y oklch(). Imprime la razón y si pasa AA texto normal (4.5), AA texto grande / UI (3) y AAA (7).
// Sale con 1 si algún par no llega ni a 3:1.
'use strict';
const { contrast } = require('../../../lib/color.cjs');

const pairs = process.argv.slice(2);
if (!pairs.length) {
  console.error('Uso: node contrast.cjs "#fondo:#texto" ["#fondo:#texto" ...]');
  process.exit(2);
}
let bad = 0;
for (const p of pairs) {
  const [bg, fg] = p.split(':'); // ninguna notación de color CSS lleva ":"
  try {
    const r = contrast(bg, fg);
    const aa = r >= 4.5, aaL = r >= 3, aaa = r >= 7;
    if (!aaL) bad++;
    console.log(`${bg} / ${fg}  ${r.toFixed(2)}:1  AA texto ${aa ? 'PASA' : 'NO'}  AA grande/UI ${aaL ? 'PASA' : 'NO'}  AAA ${aaa ? 'PASA' : 'NO'}`);
  } catch (e) {
    console.error(e.message);
    bad++;
  }
}
process.exit(bad ? 1 : 0);
