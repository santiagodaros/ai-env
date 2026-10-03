// Compuertas de calidad compartidas por feature-close y feature-run.
const fs = require('fs'), path = require('path');
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|cs|java|go|rs|ps1|psm1|sh|bicep|tf)$/i;
const NOT_CODE = /(^|\/)(docs|\.github|\.claude|node_modules|dist|build)\/|\.d\.ts$|(^|\/)[\w.-]*\.config\.[a-z]+$|(^|\/)(eslint|prettier|jest|vitest|vite|tsconfig)[\w.-]*$/i;
const TEST = /(^|\/)(__tests__|tests?|spec|specs)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[^/]+\.py$|_test\.(go|py)$|\.tests?\.ps1$/i;

// files: [[status, ...paths]] (salida de git diff --name-status). Devuelve el resultado de la compuerta de pruebas.
function testGate(files, stateText) {
  const finalPath = p => p[p.length - 1];
  const live = files.filter(p => !p[0].startsWith('D')).map(finalPath);
  const tests = live.filter(f => TEST.test(f));
  const code = live.filter(f => CODE.test(f) && !NOT_CODE.test(f) && !TEST.test(f));
  const w = (stateText || '').match(/^Sin pruebas:\s*(.+)$/im);
  const waiver = w && w[1].trim().length >= 10 ? w[1].trim() : null;
  if (!code.length) return { ok: true, code, tests, waiver, note: 'sin cambios de código que requieran pruebas' };
  if (tests.length) return { ok: true, code, tests, waiver, note: `${tests.length} archivo(s) de prueba tocados` };
  if (waiver) return { ok: true, code, tests, waiver, note: `exención declarada: ${waiver}` };
  return { ok: false, code, tests, waiver, note: `cambia ${code.length} archivo(s) de código y ningún archivo de prueba. Agregá pruebas o declará en el STATE una línea "Sin pruebas: <motivo de al menos 10 caracteres>"` };
}
module.exports = { testGate };
