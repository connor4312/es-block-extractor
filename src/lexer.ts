const isLE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/**
 * Outputs the list of exports and locations of import specifiers,
 * including dynamic import and import meta handling.
 *
 * @param source Source code to parser
 * @param name Optional sourcename
 * @returns Block types, 3 elements per block indicating:
 *   i + 0: type of block (0 for parens, 1 for curly)
 *   i + 1: start byte of the block
 *   i + 2: end byte of the block
 */
export function parse (source: string, name = '@'): {
  blocks: Uint32Array,
} {
  if (!wasm)
    // actually returns a promise if init hasn't resolved (not type safe).
    // casting to avoid a breaking type change.
    return init.then(() => parse(source)) as unknown as ReturnType<typeof parse>;

  const len = source.length + 1;

  // need 2 bytes per code point plus analysis space so we double again
  const extraMem = (wasm.__heap_base.value || wasm.__heap_base) as number + len * 4 - wasm.memory.buffer.byteLength;
  if (extraMem > 0)
    wasm.memory.grow(Math.ceil(extraMem / 65536));

  const addr = wasm.sa(len - 1);
  (isLE ? copyLE : copyBE)(source, new Uint16Array(wasm.memory.buffer, addr, len));

  if (!wasm.parse())
    throw Object.assign(new Error(`Parse error ${name}:${source.slice(0, wasm.e()).split('\n').length}:${wasm.e() - source.lastIndexOf('\n', wasm.e() - 1)}`), { idx: wasm.e() });

  let blocks = new Uint32Array(wasm.bc() * 3);
  let blocksI = 0;
  while (wasm.rb()) {
    blocks[blocksI++] = wasm.bk();
    blocks[blocksI++] = wasm.bs();
    blocks[blocksI++] = wasm.be();
  }

  return { blocks };
}

function copyBE (src: string, outBuf16: Uint16Array) {
  const len = src.length;
  let i = 0;
  while (i < len) {
    const ch = src.charCodeAt(i);
    outBuf16[i++] = (ch & 0xff) << 8 | ch >>> 8;
  }
}

function copyLE (src: string, outBuf16: Uint16Array) {
  const len = src.length;
  let i = 0;
  while (i < len)
    outBuf16[i] = src.charCodeAt(i++);
}

let wasm: {
  __heap_base: {value: number} | number & {value: undefined};
  memory: WebAssembly.Memory;
  parse(): boolean;
  /** getErr */
  e(): number;
  /** blockCount */
  bc(): number;
  /** readBlock */
  rb(): boolean;
  /** allocateSource */
  sa(utf16Len: number): number;
  /** getBlockKind */
  bk(): number;
  /** getBlockStart */
  bs(): number;
  /** getBlockEnd */
  be(): number;
};


/**
 * Wait for init to resolve before calling `parse`.
 */
export const init = WebAssembly.compile(
  (binary => typeof Buffer !== 'undefined' ? Buffer.from(binary, 'base64') : Uint8Array.from(atob(binary), x => x.charCodeAt(0)))
  ('WASM_BINARY')
)
.then(WebAssembly.instantiate)
.then(({ exports }) => { wasm = exports as typeof wasm; });
