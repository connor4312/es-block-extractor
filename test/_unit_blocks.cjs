const assert = require('assert');

let js = false;
let parse;
const init = (async () => {
  if (parse) return;
  if (process.env.WASM) {
    const m = await import('../dist/lexer.js');
    await m.init;
    parse = m.parse;
  }
  else if (process.env.ASM) {
    ({ parse } = await import('../dist/lexer.asm.js'));
  }
  else {
    js = true;
    ({ parse } = await import('../lexer.js'));
  }
})();

suite('Lexer', () => {
  beforeEach(async () => await init);

  test.only(`if block`, () => {
    const source = `if (foo) { /* content */ }`;
    const r = parse(source);
    console.log(r);
  });

});
