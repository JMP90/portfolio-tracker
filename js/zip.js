/* Stored-method ZIP (no compression) so backups can download as one file. */
(function (g) {
  'use strict';
  function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (~c) >>> 0;
  }
  function u16(n) { return [n & 255, (n >> 8) & 255]; }
  function u32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]; }
  function dosDate(d) {
    const dt = d || new Date();
    const time = (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1);
    const date = ((dt.getFullYear() - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate();
    return { time: time, date: date };
  }
  function build(files) {
    const dd = dosDate(new Date());
    const parts = [];
    const central = [];
    let offset = 0;
    files.forEach(function (f) {
      const name = new TextEncoder().encode(f.name);
      const data = f.data instanceof Uint8Array ? f.data : new TextEncoder().encode(f.data);
      const crc = crc32(data);
      const local = [].concat(
        [0x50, 0x4b, 0x03, 0x04], u16(20), u16(0), u16(0), u16(dd.time), u16(dd.date),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)
      );
      parts.push(new Uint8Array(local), name, data);
      const cen = [].concat(
        [0x50, 0x4b, 0x01, 0x02], u16(20), u16(20), u16(0), u16(0), u16(dd.time), u16(dd.date),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset)
      );
      central.push(new Uint8Array(cen), name);
      offset += local.length + name.length + data.length;
    });
    const centralStart = offset;
    let centralSize = 0;
    central.forEach(function (p) { centralSize += p.length; });
    const end = [].concat(
      [0x50, 0x4b, 0x05, 0x06], u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralSize), u32(centralStart), u16(0)
    );
    const all = parts.concat(central, [new Uint8Array(end)]);
    let n = 0;
    all.forEach(function (p) { n += p.length; });
    const out = new Uint8Array(n);
    let o = 0;
    all.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }
  function csvTable(rows) {
    if (!rows.length) return '';
    const cols = [];
    rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); }); });
    function cell(v) {
      if (v == null) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    return cols.join(',') + '\n' + rows.map(function (r) { return cols.map(function (c) { return cell(r[c]); }).join(','); }).join('\n') + '\n';
  }
  g.PTZip = { build: build, csvTable: csvTable };
})(typeof globalThis !== 'undefined' ? globalThis : this);
