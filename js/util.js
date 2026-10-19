/* Shared formatting, dates, and HTML helpers. */
(function (g) {
  'use strict';
  function pad(n) { return String(n).padStart(2, '0'); }
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function nowStamp() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
  function nowLocal() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function f(x) { return x || 0; }
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function money(v, d, sign) {
    if (d == null) d = 2;
    if (v == null || v === '' || Number.isNaN(v)) return '—';
    const n = Number(v);
    const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    const pre = n < 0 ? '-' : (sign && n > 0 ? '+' : '');
    return pre + '$' + s;
  }
  function num(v, digits) {
    if (v == null || v === '') return '—';
    if (typeof v !== 'number') return esc(v);
    const a = Math.abs(v);
    if (a >= 1000) return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (a < 1) {
      const p = digits == null ? 6 : digits;
      const s = v.toPrecision(Math.min(p, 8));
      return String(parseFloat(s));
    }
    const d = Math.min(digits == null ? 6 : digits, 4);
    let s = v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });
    return s;
  }
  function gnum(n) {
    if (n == null || Number.isNaN(Number(n))) return '';
    const x = Number(n);
    const a = Math.abs(x);
    if (a !== 0 && (a < 1e-4 || a >= 1e6)) return x.toExponential(5);
    return String(parseFloat(x.toPrecision(6)));
  }
  function pct(v, d) {
    if (v == null || Number.isNaN(v)) return '—';
    if (d == null) d = 1;
    return Number(v).toFixed(d) + '%';
  }
  function rr(v) {
    if (v == null || Number.isNaN(v)) return '—';
    const n = Number(v);
    return (n > 0 ? '+' : '') + n.toFixed(2) + 'R';
  }
  function clsPnL(v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : ''; }
  function isoWeekParts(iso) {
    const p = iso.split('-').map(Number);
    const date = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const isoYear = date.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return { year: isoYear, week: week };
  }
  function weekLabel(iso) {
    const w = isoWeekParts(iso);
    return w.year + '-W' + pad(w.week);
  }
  function fromIsoWeek(year, week) {
    const simple = new Date(Date.UTC(year, 0, 4));
    const day = simple.getUTCDay() || 7;
    const monday = new Date(simple);
    monday.setUTCDate(simple.getUTCDate() - day + 1 + (week - 1) * 7);
    return monday.toISOString().slice(0, 10);
  }
  function addDays(iso, n) {
    const p = iso.split('-').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.toISOString().slice(0, 10);
  }
  function monthRange(period) {
    const parts = period.split('-');
    const y = +parts[0], m = +parts[1];
    const start = parts[0] + '-' + parts[1] + '-01';
    const last = new Date(Date.UTC(y, m, 0));
    return [start, last.toISOString().slice(0, 10)];
  }
  function weekRange(period) {
    const bits = period.split('-W');
    const start = fromIsoWeek(+bits[0], +bits[1]);
    return [start, addDays(start, 6)];
  }
  function cmp(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
  function sigClass(src) {
    const w = (src || '').split(' ')[0];
    return 'sig-' + (w || 'Legacy');
  }
  function sigShort(src) {
    return (src || '').replace(' Strategy', '').replace(' Signal', '');
  }
  function sanitizeHtml(html) {
    return String(html || '')
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, '');
  }
  function cleanNotionMd(text) {
    if (!text) return '';
    let t = text;
    t = t.replace(/!\[([^\]]*)\]\(notion-file-block:\/\/[^)]*?name=([^)&]+)\)/g, '*[image: $1]*');
    t = t.replace(/<file[^>]*?name=([^"&>]+)[^>]*>[\s\S]*?<\/file>/g, '📎 $1');
    t = t.replace(/notion-file-block:\/\/\S*?name=([^)\s"&]+)\S*/g, '$1');
    t = t.replace(/<mention-(page|database)[^>]*url="([^"]+)"[^>]*\/?>(?:<\/mention-\1>)?/g, '[Notion link]');
    t = t.replace(/<mention-date start="([^"]+)"[^>]*\/>/g, '$1');
    t = t.replace(/<mention-user[^>]*\/>/g, '@user');
    t = t.replace(/<database[^>]*>([\s\S]*?)<\/database>/g, '*(Notion database: $1 — now in the app)*');
    t = t.replace(/<callout[^>]*>/g, '<div class="callout">\n');
    t = t.replace(/<\/callout>/g, '\n</div>');
    t = t.replace(/<empty-block\/>/g, '');
    t = t.replace(/\{color="[^"]*"\}/g, '');
    t = t.replace(/<\/?(columns|column|details|summary|toggle)[^>]*>/g, '');
    t = t.replace(/^\t+/gm, '');
    t = t.replace(/\\\$/g, '$');
    return t;
  }
  function renderMd(text) {
    const src = cleanNotionMd(text || '');
    if (!g.marked) return '<pre>' + esc(src) + '</pre>';
    const html = g.marked.parse(src, { gfm: true, breaks: false });
    return sanitizeHtml(html);
  }
  function qs(obj) {
    const p = new URLSearchParams();
    Object.keys(obj || {}).forEach(function (k) {
      if (obj[k] != null && obj[k] !== '') p.set(k, obj[k]);
    });
    const s = p.toString();
    return s ? '?' + s : '';
  }
  function parseHash() {
    let h = (location.hash || '#/').replace(/^#/, '');
    if (!h.startsWith('/')) h = '/' + h;
    const i = h.indexOf('?');
    const path = i >= 0 ? h.slice(0, i) : h;
    const q = {};
    new URLSearchParams(i >= 0 ? h.slice(i + 1) : '').forEach(function (v, k) { q[k] = v; });
    return { path: path, q: q };
  }
  g.PTUtil = {
    pad: pad, today: today, nowStamp: nowStamp, nowLocal: nowLocal, f: f, esc: esc,
    money: money, num: num, gnum: gnum, pct: pct, rr: rr, clsPnL: clsPnL,
    isoWeekParts: isoWeekParts, weekLabel: weekLabel, fromIsoWeek: fromIsoWeek, addDays: addDays,
    monthRange: monthRange, weekRange: weekRange, cmp: cmp, sigClass: sigClass, sigShort: sigShort,
    sanitizeHtml: sanitizeHtml, cleanNotionMd: cleanNotionMd, renderMd: renderMd, qs: qs, parseHash: parseHash
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
