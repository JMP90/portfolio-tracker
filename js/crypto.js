/* WebCrypto AES-GCM. Password -> PBKDF2-SHA256 -> wrapping key for a random data key.
   File layout (portfolio.enc), all multi-byte integers big-endian:
     0  8  magic "PTENC2\0\0"
     8  1  flags (bit 0 = gzip plaintext)
     9  1  reserved
    10  4  PBKDF2 iterations
    14 16  salt
    30 12  wrap IV
    42 48  wrapped DEK (32-byte key || 16-byte GCM tag)
    90 12  data IV
   102  *  data ciphertext (gzip(JSON) || tag) encrypted with the DEK
   Attachment blobs (data/blobs/<id>.enc):
     0  7  magic "PTBLOB1"
     7 12  IV
    19  *  ciphertext encrypted with the same DEK
   The DEK does not change when the password changes — only the wrap is rewritten —
   so blobs stay valid. A new data IV is used every time the portfolio is saved.
*/
(function (g) {
  'use strict';
  const ITERATIONS = 600000;
  const MAGIC = new Uint8Array([0x50, 0x54, 0x45, 0x4e, 0x43, 0x32, 0x00, 0x00]);
  const BMAGIC = new Uint8Array([0x50, 0x54, 0x42, 0x4c, 0x4f, 0x42, 0x31]); // PTBLOB1
  const HEADER = 102;

  function u32(n) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, false);
    return b;
  }
  function readU32(b, o) { return new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(o, false); }
  function concat(parts) {
    let n = 0;
    parts.forEach(function (p) { n += p.length; });
    const out = new Uint8Array(n);
    let o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }
  function eq(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  async function deriveKey(password, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  function importAes(raw) {
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  async function gzip(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function gunzip(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function wrapDek(password, dek, iterations) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, iterations || ITERATIONS);
    const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, dek));
    if (wrapped.length !== 48) throw new Error('Unexpected wrap length');
    return { iterations: iterations || ITERATIONS, salt: salt, wrapIv: iv, wrappedDek: wrapped };
  }
  function pack(wrap, flags, dataIv, dataCt) {
    return concat([MAGIC, new Uint8Array([flags, 0]), u32(wrap.iterations), wrap.salt, wrap.wrapIv, wrap.wrappedDek, dataIv, dataCt]);
  }
  function splitHeader(bytes) {
    if (bytes.length < HEADER || !eq(bytes.slice(0, 8), MAGIC)) throw new Error('Not a portfolio file');
    return {
      flags: bytes[8],
      iterations: readU32(bytes, 10),
      salt: bytes.slice(14, 30),
      wrapIv: bytes.slice(30, 42),
      wrappedDek: bytes.slice(42, 90),
      dataIv: bytes.slice(90, 102),
      dataCt: bytes.slice(102)
    };
  }
  async function unwrapDek(password, h) {
    const key = await deriveKey(password, h.salt, h.iterations);
    try {
      const dek = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: h.wrapIv }, key, h.wrappedDek));
      if (dek.length !== 32) throw new Error('bad dek');
      return dek;
    } catch (e) {
      const err = new Error('Wrong password');
      err.code = 'bad-password';
      throw err;
    }
  }
  async function encryptPortfolio(obj, dek, wrap, password) {
    if (!wrap) {
      if (!dek) dek = crypto.getRandomValues(new Uint8Array(32));
      wrap = await wrapDek(password, dek, ITERATIONS);
    }
    const json = new TextEncoder().encode(JSON.stringify(obj));
    const gz = await gzip(json);
    const dataIv = crypto.getRandomValues(new Uint8Array(12));
    const aes = await importAes(dek);
    const dataCt = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: dataIv }, aes, gz));
    return { bytes: pack(wrap, 1, dataIv, dataCt), dek: dek, wrap: wrap };
  }
  async function decryptPortfolio(password, bytes) {
    const h = splitHeader(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    const dek = await unwrapDek(password, h);
    const aes = await importAes(dek);
    let plain;
    try {
      plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: h.dataIv }, aes, h.dataCt));
    } catch (e) {
      const err = new Error('Could not decrypt portfolio');
      err.code = 'bad-data';
      throw err;
    }
    if (h.flags & 1) plain = await gunzip(plain);
    const data = JSON.parse(new TextDecoder().decode(plain));
    const wrap = { iterations: h.iterations, salt: h.salt, wrapIv: h.wrapIv, wrappedDek: h.wrappedDek };
    return { data: data, dek: dek, wrap: wrap };
  }
  async function rewrap(password, newPassword, bytes, dek) {
    const opened = dek ? { dek: dek, wrap: null, data: (await decryptPortfolio(password, bytes)).data }
      : await decryptPortfolio(password, bytes);
    const wrap = await wrapDek(newPassword, opened.dek, ITERATIONS);
    return encryptPortfolio(opened.data, opened.dek, wrap, newPassword);
  }
  async function encryptBlob(dek, plain) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aes = await importAes(dek);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, aes, plain));
    return concat([BMAGIC, iv, ct]);
  }
  async function decryptBlob(dek, bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length < 19 || !eq(b.slice(0, 7), BMAGIC)) throw new Error('Not an attachment blob');
    const iv = b.slice(7, 19);
    const ct = b.slice(19);
    const aes = await importAes(dek);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, aes, ct));
  }
  async function encryptToken(dek, token) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aes = await importAes(dek);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, aes, new TextEncoder().encode(token)));
    return b64(concat([iv, ct]));
  }
  async function decryptToken(dek, stored) {
    if (!stored) return '';
    const raw = unb64(stored);
    const iv = raw.slice(0, 12);
    const ct = raw.slice(12);
    const aes = await importAes(dek);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, aes, ct);
    return new TextDecoder().decode(plain);
  }
  function b64(bytes) {
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(s);
  }
  function unb64(s) {
    const bin = atob(String(s).replace(/\s+/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  g.PTCrypto = {
    ITERATIONS: ITERATIONS, encryptPortfolio: encryptPortfolio, decryptPortfolio: decryptPortfolio,
    rewrap: rewrap, encryptBlob: encryptBlob, decryptBlob: decryptBlob,
    encryptToken: encryptToken, decryptToken: decryptToken, b64: b64, unb64: unb64, wrapDek: wrapDek
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
