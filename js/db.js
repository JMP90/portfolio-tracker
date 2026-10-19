/* In-memory database over the decrypted JSON payload. */
(function (g) {
  'use strict';
  const U = g.PTUtil;
  const TABLES = g.PTModel.TABLES;

  function MemDB(payload) {
    this.tables = {};
    const src = (payload && payload.tables) || {};
    const self = this;
    TABLES.forEach(function (t) {
      self.tables[t] = (src[t] || []).map(function (r) { return Object.assign({}, r); });
    });
    this.nextId = {};
    const self2 = this;
    TABLES.forEach(function (t) {
      if (t === 'settings') return;
      let m = 0;
      self2.tables[t].forEach(function (r) { if (r.id > m) m = r.id; });
      self2.nextId[t] = m + 1;
    });
  }
  MemDB.prototype.rows = function (t) { return this.tables[t] || []; };
  MemDB.prototype.get = function (t, id) {
    id = +id;
    return this.rows(t).find(function (r) { return r.id === id; }) || null;
  };
  MemDB.prototype.setting = function (k, def) {
    const r = this.rows('settings').find(function (s) { return s.key === k; });
    return r && r.value != null && r.value !== '' ? r.value : (def == null ? null : def);
  };
  MemDB.prototype.setSetting = function (k, v) {
    const r = this.rows('settings').find(function (s) { return s.key === k; });
    if (r) r.value = v == null ? '' : String(v);
    else this.tables.settings.push({ key: k, value: v == null ? '' : String(v) });
  };
  MemDB.prototype.insert = function (t, obj) {
    const row = Object.assign({}, obj);
    if (t !== 'settings') {
      if (row.id == null) row.id = this.nextId[t]++;
      else if (row.id >= this.nextId[t]) this.nextId[t] = row.id + 1;
      row.updated_at = U.nowStamp();
    }
    this.tables[t].push(row);
    return row;
  };
  MemDB.prototype.update = function (t, id, patch) {
    const row = this.get(t, id);
    if (!row) return null;
    Object.keys(patch).forEach(function (k) { row[k] = patch[k]; });
    row.updated_at = U.nowStamp();
    return row;
  };
  MemDB.prototype.remove = function (t, id) {
    id = +id;
    this.tables[t] = this.rows(t).filter(function (r) { return r.id !== id; });
  };
  MemDB.prototype.exportPayload = function () {
    const tables = {};
    const self = this;
    TABLES.forEach(function (t) { tables[t] = self.tables[t].map(function (r) { return Object.assign({}, r); }); });
    return { v: 1, tables: tables };
  };
  function clonePayload(p) { return JSON.parse(JSON.stringify(p)); }

  g.PTDB = { MemDB: MemDB, clonePayload: clonePayload };
})(typeof globalThis !== 'undefined' ? globalThis : this);
