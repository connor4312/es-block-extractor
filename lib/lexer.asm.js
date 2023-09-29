let asm, asmBuffer, allocSize = 2<<19, addr;

const copy = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? function (src, outBuf16) {
  const len = src.length;
  let i = 0;
  while (i < len)
    outBuf16[i] = src.charCodeAt(i++);
} : function (src, outBuf16) {
  const len = src.length;
  let i = 0;
  while (i < len) {
    const ch = src.charCodeAt(i);
    outBuf16[i++] = (ch & 0xff) << 8 | ch >>> 8;
  }
};
const words = 'xportmportlassetaromsyncunctionssertvoyiedelecontininstantybreareturdebuggeawaithrwhileforifcatcfinallels';

let source, name;
export function parse (_source, _name = '@') {
  source = _source;
  name = _name;
  // 2 bytes per string code point
  // + analysis space (2^17)
  // remaining space is EMCC stack space (2^17)
  const memBound = source.length * 2 + (2 << 18);
  if (memBound > allocSize || !asm) {
    while (memBound > allocSize) allocSize *= 2;
    asmBuffer = new ArrayBuffer(allocSize);
    copy(words, new Uint16Array(asmBuffer, 16, words.length));
    asm = asmInit(typeof self !== 'undefined' ? self : global, {}, asmBuffer);
    // lexer.c bulk allocates string space + analysis space
    addr = asm.su(allocSize - (2<<17));
  }
  const len = source.length + 1;
  asm.ses(addr);
  asm.sa(len - 1);

  copy(source, new Uint16Array(asmBuffer, addr, len));

  if (!asm.p()) {
    acornPos = asm.e();
    syntaxError();
  }

  const imports = [], exports = [];
  while (asm.ri()) {
    const s = asm.is(), e = asm.ie(), a = asm.ai(), d = asm.id(), ss = asm.ss(), se = asm.se();
    let n;
    if (asm.ip())
      n = readString(d === -1 ? s : s + 1, source.charCodeAt(d === -1 ? s - 1 : s));
    imports.push({ n, s, e, ss, se, d, a });
  }
  while (asm.re()) {
    const s = asm.es(), e = asm.ee(), ls = asm.els(), le = asm.ele();
    const ch = source.charCodeAt(s);
    const lch = ls >= 0 ? source.charCodeAt(ls) : -1;
    exports.push({
      s, e, ls, le,
      n: (ch === 34 || ch === 39) ? readString(s + 1, ch) : source.slice(s, e),
      ln: ls < 0 ? undefined : (lch === 34 || lch === 39) ? readString(ls + 1, lch) : source.slice(ls, le),
    });
  }

  return [imports, exports, !!asm.f()];
}

/*
 * Ported from Acorn
 *   
 * MIT License

 * Copyright (C) 2012-2020 by various contributors (see AUTHORS)

 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
let acornPos;
function readString (start, quote) {
  acornPos = start;
  let out = '', chunkStart = acornPos;
  for (;;) {
    if (acornPos >= source.length) syntaxError();
    const ch = source.charCodeAt(acornPos);
    if (ch === quote) break;
    if (ch === 92) { // '\'
      out += source.slice(chunkStart, acornPos);
      out += readEscapedChar();
      chunkStart = acornPos;
    }
    else if (ch === 0x2028 || ch === 0x2029) {
      ++acornPos;
    }
    else {
      if (isBr(ch)) syntaxError();
      ++acornPos;
    }
  }
  out += source.slice(chunkStart, acornPos++);
  return out;
}

// Used to read escaped characters

function readEscapedChar () {
  let ch = source.charCodeAt(++acornPos);
  ++acornPos;
  switch (ch) {
    case 110: return '\n'; // 'n' -> '\n'
    case 114: return '\r'; // 'r' -> '\r'
    case 120: return String.fromCharCode(readHexChar(2)); // 'x'
    case 117: return readCodePointToString(); // 'u'
    case 116: return '\t'; // 't' -> '\t'
    case 98: return '\b'; // 'b' -> '\b'
    case 118: return '\u000b'; // 'v' -> '\u000b'
    case 102: return '\f'; // 'f' -> '\f'
    case 13: if (source.charCodeAt(acornPos) === 10) ++acornPos; // '\r\n'
    case 10: // ' \n'
      return '';
    case 56:
    case 57:
      syntaxError();
    default:
      if (ch >= 48 && ch <= 55) {
        let octalStr = source.substr(acornPos - 1, 3).match(/^[0-7]+/)[0];
        let octal = parseInt(octalStr, 8);
        if (octal > 255) {
          octalStr = octalStr.slice(0, -1);
          octal = parseInt(octalStr, 8);
        }
        acornPos += octalStr.length - 1;
        ch = source.charCodeAt(acornPos);
        if (octalStr !== '0' || ch === 56 || ch === 57)
          syntaxError();
        return String.fromCharCode(octal);
      }
      if (isBr(ch)) {
        // Unicode new line characters after \ get removed from output in both
        // template literals and strings
        return '';
      }
      return String.fromCharCode(ch);
  }
}

// Used to read character escape sequences ('\x', '\u', '\U').

function readHexChar (len) {
  const start = acornPos;
  let total = 0, lastCode = 0;
  for (let i = 0; i < len; ++i, ++acornPos) {
    let code = source.charCodeAt(acornPos), val;

    if (code === 95) {
      if (lastCode === 95 || i === 0) syntaxError();
      lastCode = code;
      continue;
    }

    if (code >= 97) val = code - 97 + 10; // a
    else if (code >= 65) val = code - 65 + 10; // A
    else if (code >= 48 && code <= 57) val = code - 48; // 0-9
    else break;
    if (val >= 16) break;
    lastCode = code;
    total = total * 16 + val;
  }

  if (lastCode === 95 || acornPos - start !== len) syntaxError();

  return total;
}

// Read a string value, interpreting backslash-escapes.

function readCodePointToString () {
  const ch = source.charCodeAt(acornPos);
  let code;
  if (ch === 123) { // '{'
    ++acornPos;
    code = readHexChar(source.indexOf('}', acornPos) - acornPos);
    ++acornPos;
    if (code > 0x10FFFF) syntaxError();
  } else {
    code = readHexChar(4);
  }
  // UTF-16 Decoding
  if (code <= 0xFFFF) return String.fromCharCode(code);
  code -= 0x10000;
  return String.fromCharCode((code >> 10) + 0xD800, (code & 1023) + 0xDC00);
}

function isBr (c) {
  return c === 13/*\r*/ || c === 10/*\n*/;
}

function syntaxError () {
  throw Object.assign(new Error(`Parse error ${name}:${source.slice(0, acornPos).split('\n').length}:${acornPos - source.lastIndexOf('\n', acornPos - 1)}`), { idx: acornPos });
}

// function asmInit () { ... } from lib/lexer.asm.js is concatenated at the end here
function asmInit(global,env,buffer) {
"use asm";var a=new global.Int8Array(buffer),b=new global.Int16Array(buffer),c=new global.Int32Array(buffer),d=new global.Uint8Array(buffer),e=new global.Uint16Array(buffer),v=976;function A(){var d=0,f=0,g=0,h=0,i=0,j=0;j=v;v=v+8192|0;b[367]=0;c[54]=c[2];a[737]=0;c[53]=0;a[736]=0;a[738]=0;c[55]=j;a[739]=0;d=(c[3]|0)+-2|0;c[56]=d;f=d+(c[51]<<1)|0;c[57]=f;a:while(1){g=d+2|0;c[56]=g;if(d>>>0>=f>>>0){i=62;break}b:do switch(b[g>>1]|0){case 9:case 10:case 11:case 12:case 13:case 32:break;case 105:{if(W(16,5)|0){a[738]=1;i=61}else i=61;break}case 108:{if(W(26,2)|0){a[738]=1;i=61}else i=61;break}case 118:{if(W(30,2)|0){a[738]=1;i=61}else i=61;break}case 99:{if(W(34,4)|0){a[738]=1;i=61;break b}if(W(42,5)|0){a[739]=1;i=61}else i=61;break}case 61:{a[738]=0;i=61;break}case 91:{h=c[55]|0;f=b[367]|0;i=f&65535;c[h+(i<<3)>>2]=(a[738]|0)==0?7:8;g=c[54]|0;b[367]=f+1<<16>>16;c[h+(i<<3)+4>>2]=g;a[738]=0;i=61;break}case 93:{d=b[367]|0;if(!(d<<16>>16)){i=18;break a}b[367]=d+-1<<16>>16;i=61;break}case 123:{do if(!(a[739]|0)){if((a[738]|0)==0?(b[c[54]>>1]|0)!=40:0){d=b[367]|0;if(!(d<<16>>16)){d=2;break}if((c[(c[55]|0)+((d&65535)+-1<<3)>>2]|1|0)!=9){d=2;break}}d=9}else d=6;while(0);h=c[55]|0;f=b[367]|0;i=f&65535;c[h+(i<<3)>>2]=d;g=c[54]|0;b[367]=f+1<<16>>16;c[h+(i<<3)+4>>2]=g;a[739]=0;i=61;break}case 125:{d=b[367]|0;if(!(d<<16>>16)){i=28;break a}f=c[55]|0;d=d+-1<<16>>16;b[367]=d;d=d&65535;switch(c[f+(d<<3)>>2]|0){case 4:{E();i=61;break b}case 2:{I(c[f+(d<<3)+4>>2]|0,g,0);i=61;break b}default:{i=61;break b}}}case 39:{F(39);i=61;break}case 34:{F(34);i=61;break}case 47:switch(b[d+4>>1]|0){case 47:{V();break b}case 42:{K(1);break b}default:{d=c[54]|0;h=b[d>>1]|0;c:do if(!(O(h)|0)){switch(h<<16>>16){case 41:if(X(c[(c[55]|0)+(e[367]<<3)+4>>2]|0)|0){i=49;break c}else{i=46;break c}case 125:break;default:{i=46;break c}}f=c[55]|0;g=e[367]|0;if(!(J(c[f+(g<<3)+4>>2]|0)|0)?(c[f+(g<<3)>>2]|0)!=6:0)i=46;else i=49}else switch(h<<16>>16){case 46:if(((b[d+-2>>1]|0)+-48&65535)<10){i=46;break c}else{i=49;break c}case 43:if((b[d+-2>>1]|0)==43){i=46;break c}else{i=49;break c}case 45:if((b[d+-2>>1]|0)==45){i=46;break c}else{i=49;break c}default:{i=49;break c}}while(0);d:do if((i|0)==46){i=0;if(!(B(d)|0)){switch(h<<16>>16){case 0:{i=49;break d}case 47:{if(a[737]|0){i=49;break d}break}default:{}}g=c[3]|0;f=h;do{if(d>>>0<=g>>>0)break;d=d+-2|0;c[54]=d;f=b[d>>1]|0}while(!(U(f)|0));if(Y(f)|0){do{if(d>>>0<=g>>>0)break;d=d+-2|0;c[54]=d}while(Y(b[d>>1]|0)|0);if(S(d)|0){H();a[737]=0;i=61;break b}else d=1}else d=1}else i=49}while(0);if((i|0)==49){H();d=0}a[737]=d;i=61;break b}}case 96:{h=c[55]|0;g=b[367]|0;i=g&65535;c[h+(i<<3)+4>>2]=c[54];b[367]=g+1<<16>>16;c[h+(i<<3)>>2]=3;E();i=61;break}default:i=61}while(0);if((i|0)==61){i=0;c[54]=c[56]}d=c[56]|0;f=c[57]|0}if((i|0)==18){ba();d=0}else if((i|0)==28){ba();d=0}else if((i|0)==62)d=(b[367]|0)==0&(a[736]|0)==0;v=j;return d|0}function B(a){a=a|0;a:do switch(b[a>>1]|0){case 100:switch(b[a+-2>>1]|0){case 105:{a=Q(a+-4|0,50,2)|0;break a}case 108:{a=Q(a+-4|0,54,3)|0;break a}default:{a=0;break a}}case 101:switch(b[a+-2>>1]|0){case 115:switch(b[a+-4>>1]|0){case 108:{a=T(a+-6|0,101)|0;break a}case 97:{a=T(a+-6|0,99)|0;break a}default:{a=0;break a}}case 116:{a=Q(a+-4|0,60,4)|0;break a}case 117:{a=Q(a+-4|0,68,6)|0;break a}default:{a=0;break a}}case 102:{if((b[a+-2>>1]|0)==111?(b[a+-4>>1]|0)==101:0)switch(b[a+-6>>1]|0){case 99:{a=Q(a+-8|0,80,6)|0;break a}case 112:{a=Q(a+-8|0,92,2)|0;break a}default:{a=0;break a}}else a=0;break}case 107:{a=Q(a+-2|0,96,4)|0;break}case 110:{a=a+-2|0;if(T(a,105)|0)a=1;else a=Q(a,104,5)|0;break}case 111:{a=T(a+-2|0,100)|0;break}case 114:{a=Q(a+-2|0,114,7)|0;break}case 116:{a=Q(a+-2|0,128,4)|0;break}case 119:switch(b[a+-2>>1]|0){case 101:{a=T(a+-4|0,110)|0;break a}case 111:{a=Q(a+-4|0,136,3)|0;break a}default:{a=0;break a}}default:a=0}while(0);return a|0}function E(){var a=0,d=0,e=0,f=0;d=c[57]|0;e=c[56]|0;a:while(1){a=e+2|0;if(e>>>0>=d>>>0){d=10;break}switch(b[a>>1]|0){case 96:{d=7;break a}case 36:{if((b[e+4>>1]|0)==123){d=6;break a}break}case 92:{a=e+4|0;break}default:{}}e=a}if((d|0)==6){a=e+4|0;c[56]=a;d=c[55]|0;f=b[367]|0;e=f&65535;c[d+(e<<3)>>2]=4;b[367]=f+1<<16>>16;c[d+(e<<3)+4>>2]=a}else if((d|0)==7){c[56]=a;e=c[55]|0;f=(b[367]|0)+-1<<16>>16;b[367]=f;if((c[e+((f&65535)<<3)>>2]|0)!=3)ba()}else if((d|0)==10){c[56]=a;ba()}return}function F(a){a=a|0;var d=0,e=0,f=0,g=0;g=c[57]|0;d=c[56]|0;while(1){f=d+2|0;if(d>>>0>=g>>>0){d=9;break}e=b[f>>1]|0;if(e<<16>>16==a<<16>>16){d=10;break}if(e<<16>>16==92){e=d+4|0;if((b[e>>1]|0)==13){d=d+6|0;d=(b[d>>1]|0)==10?d:e}else d=e}else if(da(e)|0){d=9;break}else d=f}if((d|0)==9){c[56]=f;ba()}else if((d|0)==10)c[56]=f;return}function G(){var a=0,d=0,e=0;e=c[57]|0;d=c[56]|0;a:while(1){a=d+2|0;if(d>>>0>=e>>>0){d=6;break}switch(b[a>>1]|0){case 13:case 10:{d=6;break a}case 93:{d=7;break a}case 92:{a=d+4|0;break}default:{}}d=a}if((d|0)==6){c[56]=a;ba();a=0}else if((d|0)==7){c[56]=a;a=93}return a|0}function H(){var a=0,d=0,e=0;a:while(1){a=c[56]|0;d=a+2|0;c[56]=d;if(a>>>0>=(c[57]|0)>>>0){e=7;break}switch(b[d>>1]|0){case 13:case 10:{e=7;break a}case 47:break a;case 91:{G()|0;break}case 92:{c[56]=a+4;break}default:{}}}if((e|0)==7)ba();return}function I(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0,h=0;e=v;v=v+16|0;g=e;c[g>>2]=0;f=c[52]|0;c[52]=f+16;h=c[49]|0;c[((h|0)==0?188:h+12|0)>>2]=f;c[g>>2]=h;c[49]=f;c[f>>2]=a;c[f+4>>2]=b;c[f+8>>2]=d;c[f+12>>2]=0;c[50]=(c[50]|0)+1;v=e;return}function J(a){a=a|0;switch(b[a>>1]|0){case 62:{a=(b[a+-2>>1]|0)==61;break}case 41:case 59:{a=1;break}case 104:{a=Q(a+-2|0,162,4)|0;break}case 121:{a=Q(a+-2|0,170,6)|0;break}case 101:{a=Q(a+-2|0,182,3)|0;break}default:a=0}return a|0}function K(a){a=a|0;var d=0,e=0,f=0,g=0,h=0;g=(c[56]|0)+2|0;c[56]=g;e=c[57]|0;while(1){d=g+2|0;if(g>>>0>=e>>>0)break;f=b[d>>1]|0;if(!a?da(f)|0:0)break;if(f<<16>>16==42?(b[g+4>>1]|0)==47:0){h=8;break}g=d}if((h|0)==8){c[56]=d;d=g+4|0}c[56]=d;return}function L(b,c,d){b=b|0;c=c|0;d=d|0;var e=0,f=0;a:do if(!d)b=0;else{while(1){e=a[b>>0]|0;f=a[c>>0]|0;if(e<<24>>24!=f<<24>>24)break;d=d+-1|0;if(!d){b=0;break a}else{b=b+1|0;c=c+1|0}}b=(e&255)-(f&255)|0}while(0);return b|0}function N(a){a=a|0;a:do switch(a<<16>>16){case 38:case 37:case 33:{a=1;break}default:if((a&-8)<<16>>16==40|(a+-58&65535)<6)a=1;else{switch(a<<16>>16){case 91:case 93:case 94:{a=1;break a}default:{}}a=(a+-123&65535)<4}}while(0);return a|0}function O(a){a=a|0;a:do switch(a<<16>>16){case 38:case 37:case 33:break;default:if(!((a+-58&65535)<6|(a+-40&65535)<7&a<<16>>16!=41)){switch(a<<16>>16){case 91:case 94:break a;default:{}}return a<<16>>16!=125&(a+-123&65535)<4|0}}while(0);return 1}function P(a){a=a|0;var c=0;c=b[a>>1]|0;a:do if((c+-9&65535)>=5){switch(c<<16>>16){case 160:case 32:{c=1;break a}default:{}}if(N(c)|0)return c<<16>>16!=46|(Z(a)|0)|0;else c=0}else c=1;while(0);return c|0}function Q(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0;e=a+(0-d<<1)|0;f=e+2|0;a=c[3]|0;if(f>>>0>=a>>>0?(L(f,b,d<<1)|0)==0:0)if((f|0)==(a|0))a=1;else a=P(e)|0;else a=0;return a|0}function R(a){a=a|0;var d=0,e=0,f=0,g=0;e=v;v=v+16|0;f=e;c[f>>2]=0;c[51]=a;d=c[3]|0;g=d+(a<<1)|0;a=g+2|0;b[g>>1]=0;c[f>>2]=a;c[52]=a;c[47]=0;c[49]=0;c[48]=0;c[50]=0;v=e;return d|0}function S(a){a=a|0;switch(b[a>>1]|0){case 107:{a=Q(a+-2|0,96,4)|0;break}case 101:{if((b[a+-2>>1]|0)==117)a=Q(a+-4|0,68,6)|0;else a=0;break}default:a=0}return a|0}function T(a,d){a=a|0;d=d|0;var e=0;e=c[3]|0;if(e>>>0<=a>>>0?(b[a>>1]|0)==d<<16>>16:0)if((e|0)==(a|0))e=1;else e=U(b[a+-2>>1]|0)|0;else e=0;return e|0}function U(a){a=a|0;a:do if((a+-9&65535)<5)a=1;else{switch(a<<16>>16){case 32:case 160:{a=1;break a}default:{}}a=a<<16>>16!=46&(N(a)|0)}while(0);return a|0}function V(){var a=0,d=0,e=0;a=c[57]|0;e=c[56]|0;a:while(1){d=e+2|0;if(e>>>0>=a>>>0)break;switch(b[d>>1]|0){case 13:case 10:break a;default:e=d}}c[56]=d;return}function W(a,b){a=a|0;b=b|0;var d=0;d=c[56]|0;if(_(d)|0?(L(d+2|0,a,b<<1)|0)==0:0){c[56]=d+(b<<1);d=1}else d=0;return d|0}function X(a){a=a|0;if(!(Q(a,142,5)|0)?!(Q(a,152,3)|0):0)a=Q(a,158,2)|0;else a=1;return a|0}function Y(a){a=a|0;switch(a<<16>>16){case 160:case 32:case 12:case 11:case 9:{a=1;break}default:a=0}return a|0}function Z(a){a=a|0;if((b[a>>1]|0)==46?(b[a+-2>>1]|0)==46:0)a=(b[a+-4>>1]|0)==46;else a=0;return a|0}function _(a){a=a|0;if((c[3]|0)==(a|0))a=1;else a=P(a+-2|0)|0;return a|0}function $(){var a=0;a=c[48]|0;a=c[((a|0)==0?188:a+12|0)>>2]|0;c[48]=a;return (a|0)!=0|0}function ba(){a[736]=1;c[53]=(c[56]|0)-(c[3]|0)>>1;c[56]=(c[57]|0)+2;return}function ca(){return (c[(c[48]|0)+4>>2]|0)-(c[3]|0)>>1|0}function da(a){a=a|0;return a<<16>>16==13|a<<16>>16==10|0}function ea(){return (c[c[48]>>2]|0)-(c[3]|0)>>1|0}function fa(a){a=a|0;c[3]=a;return}function ga(){return c[(c[48]|0)+8>>2]|0}function ma(){return c[50]|0}function na(){return c[53]|0}  function su(a) {
		a = a | 0;
		v = a + 992 + 15 & -16;
		return 992;
	}
	return {
		su,bc:ma,be:ca,bk:ga,bs:ea,e:na,p:A,rb:$,sa:R,ses:fa}}