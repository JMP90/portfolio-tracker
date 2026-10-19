/* Shell, routing, unlock, and GitHub sync. */
(function (g) {
  'use strict';
  const U = g.PTUtil;
  const TOKEN_KEY = 'pt.token';
  const S = {
    db: null, dek: null, wrap: null, password: null, sha: null, token: '',
    base: null, blobs: new Map(), pending: new Set(), flash: '', sync: 'off', conflict: null
  };

  function $(id) { return document.getElementById(id); }
  function bytesEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function canon(row) {
    if (row == null || typeof row !== 'object') return row;
    const o = {};
    Object.keys(row).sort().forEach(function (k) { o[k] = row[k]; });
    return o;
  }
  function indexRows(rows, table) {
    const m = new Map();
    (rows || []).forEach(function (r) { m.set(table === 'settings' ? r.key : r.id, r); });
    return m;
  }
  function mergePayloads(base, local, remote) {
    const names = {};
    [base, local, remote].forEach(function (p) { Object.keys(p.tables || {}).forEach(function (t) { names[t] = 1; }); });
    const tables = {};
    const conflicts = [];
    Object.keys(names).forEach(function (t) {
      const bm = indexRows(base.tables[t], t);
      const lm = indexRows(local.tables[t], t);
      const rm = indexRows(remote.tables[t], t);
      const ids = new Set([].concat(Array.from(bm.keys()), Array.from(lm.keys()), Array.from(rm.keys())));
      const rows = [];
      ids.forEach(function (id) {
        const b = bm.get(id), l = lm.get(id), r = rm.get(id);
        const js = function (x) { return JSON.stringify(canon(x)); };
        if (js(l) === js(r)) { if (l) rows.push(l); return; }
        if (js(l) === js(b)) { if (r) rows.push(JSON.parse(JSON.stringify(r))); return; }
        if (js(r) === js(b)) { if (l) rows.push(l); return; }
        conflicts.push({ table: t, id: id });
        const pick = !l ? r : !r ? l : ((r.updated_at || '') > (l.updated_at || '') ? r : l);
        if (pick) rows.push(JSON.parse(JSON.stringify(pick)));
      });
      if (t !== 'settings') rows.sort(function (a, b) { return a.id - b.id; });
      tables[t] = rows;
    });
    return { v: 1, tables: tables, conflicts: conflicts };
  }
  function mime(name) {
    const n = (name || '').toLowerCase();
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
    if (n.endsWith('.webp')) return 'image/webp';
    if (n.endsWith('.gif')) return 'image/gif';
    if (n.endsWith('.pdf')) return 'application/pdf';
    if (n.endsWith('.csv')) return 'text/csv';
    if (n.endsWith('.html') || n.endsWith('.htm')) return 'text/plain';
    return 'application/octet-stream';
  }
  function download(name, bytes, type) {
    const blob = new Blob([bytes], { type: type || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function copyBuf(bytes) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
  }

  async function loadEnc() {
    let net = null;
    try {
      const res = await fetch('data/portfolio.enc?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) net = new Uint8Array(await res.arrayBuffer());
    } catch (e) { /* offline */ }
    let working = null, dirty = false;
    try {
      dirty = !!(await g.PTCache.get('dirty'));
      const w = await g.PTCache.get('working');
      if (w) working = new Uint8Array(w);
    } catch (e) { /* private mode */ }
    if (dirty && working) return { bytes: working, dirty: true, remote: net };
    if (net) {
      try {
        await g.PTCache.put('working', copyBuf(net));
        await g.PTCache.put('published', copyBuf(net));
        await g.PTCache.put('dirty', false);
      } catch (e) {}
      return { bytes: net, dirty: false, remote: net };
    }
    if (working) return { bytes: working, dirty: false, remote: null };
    try {
      const pub = await g.PTCache.get('published');
      if (pub) return { bytes: new Uint8Array(pub), dirty: false, remote: null };
    } catch (e) {}
    throw new Error('Could not download the encrypted portfolio, and this device has no saved copy.');
  }

  function renderLogin(err, busy) {
    const app = $('app');
    document.title = 'Login · Portfolio';
    app.innerHTML = '<div class="login-wrap"><div class="card"><h1 style="margin:0 0 4px;font-size:22px">📈 Portfolio Tracker</h1>' +
      '<p class="muted small" style="margin-top:0">Private — unlocked in this browser. Nothing is sent except encrypted files when you sync.</p>' +
      (err ? '<div class="flash" style="background:#7f1d1d;border-color:#ef4444">' + U.esc(err) + '</div>' : '') +
      '<form id="login"><label>Password</label><input type="password" name="password" autofocus autocomplete="current-password" required ' + (busy ? 'disabled' : '') + '>' +
      '<button class="btn" style="width:100%;justify-content:center;margin-top:12px" ' + (busy ? 'disabled' : '') + '>' + (busy || 'Unlock') + '</button></form>' +
      '<p class="muted small">Data in the repository is AES-GCM ciphertext. The password never leaves this page.</p></div></div>';
    const form = $('login');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      unlock(new FormData(form).get('password'));
    });
  }

  async function unlock(pw) {
    renderLogin(null, 'Decrypting…');
    try {
      const loaded = await loadEnc();
      const opened = await g.PTCrypto.decryptPortfolio(pw, loaded.bytes);
      S.password = String(pw);
      S.dek = opened.dek;
      S.wrap = opened.wrap;
      S.db = new g.PTDB.MemDB(opened.data);
      S.base = g.PTDB.clonePayload(opened.data);
      try {
        const stored = localStorage.getItem(TOKEN_KEY);
        S.token = stored ? await g.PTCrypto.decryptToken(S.dek, stored) : '';
      } catch (e) { S.token = ''; localStorage.removeItem(TOKEN_KEY); }
      if (loaded.dirty && loaded.remote && !bytesEqual(loaded.bytes, loaded.remote)) {
        try {
          const remote = await g.PTCrypto.decryptPortfolio(pw, loaded.remote);
          let base = remote.data;
          const baseEnc = await g.PTCache.get('base');
          if (baseEnc) {
            try { base = (await g.PTCrypto.decryptPortfolio(pw, new Uint8Array(baseEnc))).data; } catch (e) {}
          }
          const merged = mergePayloads(base, opened.data, remote.data);
          S.db = new g.PTDB.MemDB({ v: 1, tables: merged.tables });
          S.base = remote.data;
          S.flash = merged.conflicts.length
            ? 'Opened an offline copy and merged it with GitHub. ' + merged.conflicts.length + ' overlapping edit(s) kept the newer timestamp.'
            : 'Opened an offline copy and merged it with the GitHub copy.';
        } catch (e) { S.flash = 'Opened the copy saved on this device.'; }
      }
      if (S.token) {
        try { await refreshSha(); } catch (e) { S.flash = (S.flash ? S.flash + ' ' : '') + 'GitHub: ' + e.message; }
      }
      S.sync = S.token ? 'synced' : 'local';
      window.addEventListener('hashchange', onRoute);
      if (!location.hash) location.hash = '#/';
      onRoute();
    } catch (e) {
      renderLogin(e.code === 'bad-password' || /wrong password/i.test(e.message || '') ? 'Wrong password.' : (e.message || 'Could not unlock'));
    }
  }

  async function refreshSha() {
    const remote = await g.PTGitHub.getFile(S.token, 'data/portfolio.enc');
    S.sha = remote.sha;
    try { await g.PTCache.put('sha', S.sha); } catch (e) {}
    return remote;
  }

  function issueCount() {
    try { return g.PTIssues.counts(S.db).n; } catch (e) { return 0; }
  }
  function navClass(href, exact) {
    const path = U.parseHash().path;
    const on = exact || href === '/' ? path === href : path === href || path.indexOf(href + '/') === 0;
    return on ? 'on' : '';
  }
  function shell(view) {
    const n = issueCount();
    const path = U.parseHash().path;
    const dot = S.sync === 'synced' ? 'ok' : (S.sync === 'error' || S.sync === 'conflict' ? 'bad' : (S.sync === 'syncing' ? 'warn' : 'warn'));
    const label = { synced: 'Synced to GitHub', local: 'Saved on this device only', syncing: 'Syncing…', error: 'Sync failed — kept on this device', conflict: 'Needs a decision', off: '' }[S.sync] || '';
    const links = [
      ['/', '🏠', 'Dashboard', true], ['/portfolio', '💼', 'Portfolio'], ['/assets', '🪙', 'Assets & prices'],
      ['/dca', '💎', 'DCA tracker'], ['/trades', '📊', 'Ichimoku trades'], ['/calculator', '🧮', 'Trade calculator']
    ];
    const links2 = [
      ['/bots', '🤖', 'Pionex bots'], ['/lps', '💧', 'AMM LPs'], ['/btc', '₿', 'BTC Protocol']
    ];
    const links3 = [
      ['/reports', '🗓️', 'Reports'], ['/rules', '📜', 'Rules & docs'],
      ['/reconciliation', '🔁', 'Reconciliation'], ['/export', '💾', 'Backup / export'], ['/settings', '⚙️', 'Settings']
    ];
    function a(href, icon, label, exact) {
      return '<a href="#' + href + '" class="' + navClass(href, exact) + '">' + icon + ' ' + label + '</a>';
    }
    let side = '<div class="brand">📈 Portfolio Tracker</div>' + links.map(function (l) { return a(l[0], l[1], l[2], l[3]); }).join('');
    side += '<div class="sep"></div>' + links2.map(function (l) { return a(l[0], l[1], l[2]); }).join('');
    side += '<div class="sep"></div>' + a('/reports', '🗓️', 'Reports') + a('/rules', '📜', 'Rules & docs');
    side += '<a href="#/issues" class="' + navClass('/issues') + '">⚠️ Issues ' + (n ? '<span class="badge">' + n + '</span>' : '') + '</a>';
    side += links3.slice(2).map(function (l) { return a(l[0], l[1], l[2]); }).join('');
    side += '<a href="#/logout">🚪 Log out</a><div class="muted small" style="padding:10px">Prices: ' + U.esc((S.db.setting('prices_refreshed') || 'never').slice(0, 16).replace('T', ' ')) + '</div>';
    let html = '<div class="layout"><nav class="side">' + side + '</nav><main>';
    html += '<div class="syncbar"><span class="dot ' + dot + '"></span><span>' + U.esc(label) + '</span>';
    if (!S.token) html += '<a href="#/settings">Add a GitHub token to save from this device</a>';
    html += '</div>';
    if (S.flash) html += '<div class="flash">' + U.esc(S.flash) + '</div>';
    if (!S.token && path === '/') html += '<div class="banner">Edits stay in this browser until you add a fine-grained GitHub token. <a href="#/settings">Short guide in Settings</a>.</div>';
    if (S.conflict) {
      html += '<div class="banner warn"><b>' + S.conflict.conflicts.length + ' overlapping edit(s)</b> changed both here and on GitHub. The newer timestamp is pre-selected. <button class="btn sm" type="button" data-action-click="conflict-sync">Sync merged</button> <button class="btn sec sm" type="button" data-action-click="conflict-theirs">Load GitHub copy</button></div>';
    }
    html += view.html + '</main></div>';
    html += '<nav class="bottom"><a href="#/" class="' + navClass('/', true) + '"><b>🏠</b>Home</a><a href="#/portfolio" class="' + navClass('/portfolio') + '"><b>💼</b>Portfolio</a><a href="#/trades" class="' + navClass('/trades') + '"><b>📊</b>Trades</a><a href="#/calculator" class="' + navClass('/calculator') + '"><b>🧮</b>Calc</a><a href="javascript:void(0)" class="morebtn" id="morebtn"><b>☰</b>More' + (n ? ' •' : '') + '</a></nav>';
    html += '<div id="moremenu"><a href="#/dca">💎 DCA</a><a href="#/assets">🪙 Assets</a><a href="#/bots">🤖 Bots</a><a href="#/lps">💧 LPs</a><a href="#/btc">₿ BTC Protocol</a><a href="#/reports">🗓️ Reports</a><a href="#/rules">📜 Rules</a><a href="#/issues">⚠️ Issues ' + (n || '') + '</a><a href="#/reconciliation">🔁 Reconcile</a><a href="#/export">💾 Export</a><a href="#/settings">⚙️ Settings</a><a href="#/logout">🚪 Log out</a></div>';
    return html;
  }

  function onRoute() {
    if (U.parseHash().path === '/logout') { logout(); return; }
    if (!S.db) { renderLogin(); return; }
    const route = U.parseHash();
    const q = Object.assign({}, route.q);
    if (route.path === '/settings') q._token = S.token ? '1' : '';
    let view;
    try { view = g.PTViews.render(S.db, route.path, q); }
    catch (e) { view = { title: 'Error', html: '<p class="warn">' + U.esc(e.message || String(e)) + '</p>' }; console.error(e); }
    document.title = (view.title || 'Portfolio') + ' · Portfolio';
    $('app').innerHTML = shell(view);
    const flash = S.flash; S.flash = '';
    if (view.bind === 'calc') g.PTViews.bindCalc();
    hydrate();
    const more = $('morebtn');
    if (more) more.addEventListener('click', function (e) { e.preventDefault(); $('moremenu').classList.toggle('open'); });
  }

  function fileRel(url) {
    const s = String(url || '');
    const i = s.indexOf('/files/');
    if (i < 0) return '';
    const rel = s.slice(i + 7).split('?')[0].split('#')[0];
    try { return decodeURIComponent(rel); } catch (e) { return rel; }
  }
  function bindStoredFiles() {
    const byPath = {};
    S.db.rows('attachments').forEach(function (a) { if (a.path) byPath[a.path] = a; });
    document.querySelectorAll('img[src], a[href]').forEach(function (el) {
      const attr = el.tagName === 'IMG' ? 'src' : 'href';
      const rel = fileRel(el.getAttribute(attr));
      const row = rel && byPath[rel];
      if (!row) return;
      const name = row.filename || rel.split('/').pop();
      if (el.tagName === 'IMG') {
        el.setAttribute('data-blob', row.id);
        el.setAttribute('data-name', name);
        el.removeAttribute('src');
      } else {
        el.setAttribute('data-blob-link', row.id);
        el.setAttribute('data-name', name);
        el.setAttribute('href', '#');
      }
    });
  }
  async function hydrate() {
    bindStoredFiles();
    const imgs = document.querySelectorAll('[data-blob]');
    for (let i = 0; i < imgs.length; i++) {
      const el = imgs[i];
      try {
        const url = await blobUrl(+el.getAttribute('data-blob'), el.getAttribute('data-name'));
        if (el.tagName === 'IMG') el.src = url;
      } catch (e) { el.alt = 'Attachment unavailable'; }
    }
  }
  async function blobUrl(id, name) {
    let plain = S.blobs.get(id);
    if (!plain) {
      let enc = null;
      try { enc = await g.PTCache.get('blob:' + id); } catch (e) {}
      if (!enc) {
        const res = await fetch('data/blobs/' + id + '.enc');
        if (!res.ok) throw new Error('missing');
        enc = await res.arrayBuffer();
        try { await g.PTCache.put('blob:' + id, enc); } catch (e) {}
      }
      plain = await g.PTCrypto.decryptBlob(S.dek, new Uint8Array(enc));
      S.blobs.set(id, plain);
    }
    return URL.createObjectURL(new Blob([plain], { type: mime(name) }));
  }

  async function openBlob(id, name) {
    const url = await blobUrl(id, name);
    window.open(url, '_blank', 'noopener');
  }

  function numOrNull(raw, fk) {
    const s = String(raw || '').replace(/,/g, '').trim();
    if (s === '') return null;
    const n = fk ? parseInt(s, 10) : parseFloat(s);
    if (Number.isNaN(n)) return NaN;
    return n;
  }
  function readEntity(form, table) {
    const spec = g.PTModel.E[table];
    const fd = new FormData(form);
    const vals = {};
    for (let i = 0; i < spec.fields.length; i++) {
      const f = spec.fields[i];
      const name = f[0], label = f[1], typ = f[2];
      if (typ === 'bool') vals[name] = fd.get(name) ? 1 : 0;
      else if (typ === 'num' || String(typ).indexOf('fk:') === 0) {
        const n = numOrNull(fd.get(name), String(typ).indexOf('fk:') === 0);
        if (Number.isNaN(n)) throw new Error('"' + label + '" must be a number.');
        vals[name] = n;
      } else vals[name] = String(fd.get(name) || '').trim() || null;
    }
    if (table === 'trades' && !vals.signal_source) vals.signal_source = 'Standard Strategy';
    if (table === 'trades' && !vals.name) {
      const a = vals.asset_id ? S.db.get('assets', vals.asset_id) : null;
      const d = vals.open_date || U.today();
      const p = d.split('-');
      vals.name = ((a && a.symbol) || '?') + ' - ' + (vals.direction || 'Long') + ' - ' + (vals.setup || '') + ' - ' + parseInt(p[2], 10) + '/' + parseInt(p[1], 10) + '/' + p[0].slice(2);
      vals.name = vals.name.replace(' -  - ', ' - ');
    }
    if (table === 'tranches' && vals.trade_id && vals.status === 'Unfilled' && fd.get('_was_orphan')) vals.status = 'Filled';
    return vals;
  }
  function go(hash) { if (location.hash === hash) onRoute(); else location.hash = hash; }
  function backFor(table, vals, id) {
    if (table === 'tranches' && vals.trade_id) return '#/trades/' + vals.trade_id;
    if (table === 'bot_events' && vals.bot_id) return '#/bots/' + vals.bot_id;
    if (table === 'lp_fees' && vals.lp_ref) return '#/lps/' + vals.lp_ref;
    const map = { trades: '#/trades/' + id, bots: '#/bots/' + id, lps: '#/lps/' + id, holdings: '#/portfolio', dca: '#/dca', assets: '#/assets', btc_snapshots: '#/btc' };
    return map[table] || ('#/e/' + table);
  }
  function deleteBack(table) {
    return { trades: '#/trades', bots: '#/bots', lps: '#/lps', holdings: '#/portfolio', dca: '#/dca', assets: '#/assets', btc_snapshots: '#/btc' }[table] || ('#/e/' + table);
  }

  let saving = false;
  async function persist(message) {
    if (saving) return;
    saving = true;
    S.sync = 'syncing';
    try {
      const payload = S.db.exportPayload();
      const packed = await g.PTCrypto.encryptPortfolio(payload, S.dek, S.wrap, S.password);
      S.wrap = packed.wrap;
      try { await g.PTCache.put('working', copyBuf(packed.bytes)); await g.PTCache.put('dirty', true); } catch (e) {}
      const ids = Array.from(S.pending);
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const plain = S.blobs.get(id);
        if (!plain) continue;
        const enc = await g.PTCrypto.encryptBlob(S.dek, plain);
        try { await g.PTCache.put('blob:' + id, copyBuf(enc)); } catch (e) {}
        if (S.token) {
          let sha = null;
          try { sha = (await g.PTGitHub.getFile(S.token, 'data/blobs/' + id + '.enc')).sha; }
          catch (e) { if (e.status !== 404) throw e; }
          await g.PTGitHub.putFile(S.token, 'data/blobs/' + id + '.enc', enc, sha, 'Add attachment ' + id);
        }
        S.pending.delete(id);
      }
      if (!S.token) {
        S.sync = 'local';
        if (!S.flash) S.flash = 'Saved on this device. Add a GitHub token in Settings to sync.';
        return;
      }
      await pushFile(packed.bytes, message || 'Update portfolio', 0);
    } catch (e) {
      S.sync = 'error';
      S.flash = 'Saved on this device. Sync failed: ' + (e.message || e);
    } finally { saving = false; }
  }
  async function pushFile(bytes, message, attempt) {
    try {
      if (!S.sha) {
        try { await refreshSha(); } catch (e) { if (e.status !== 404) throw e; }
      }
      const res = await g.PTGitHub.putFile(S.token, 'data/portfolio.enc', bytes, S.sha, message);
      S.sha = res.content && res.content.sha;
      S.base = S.db.exportPayload();
      try {
        await g.PTCache.put('base', copyBuf(bytes));
        await g.PTCache.put('dirty', false);
        if (S.sha) await g.PTCache.put('sha', S.sha);
      } catch (e) {}
      S.sync = 'synced';
      S.conflict = null;
      if (!S.flash) S.flash = 'Synced to GitHub.';
    } catch (e) {
      if ((e.status === 409 || e.status === 422) && attempt < 2) {
        const remote = await g.PTGitHub.getFile(S.token, 'data/portfolio.enc');
        S.sha = remote.sha;
        const opened = await g.PTCrypto.decryptPortfolio(S.password, remote.bytes);
        const merged = mergePayloads(S.base || opened.data, S.db.exportPayload(), opened.data);
        if (merged.conflicts.length) {
          S.conflict = merged;
          S.sync = 'conflict';
          S.flash = 'GitHub has a newer copy and some of the same records changed here. Choose Sync merged or Load GitHub copy.';
          return;
        }
        S.db = new g.PTDB.MemDB({ v: 1, tables: merged.tables });
        S.base = opened.data;
        const again = await g.PTCrypto.encryptPortfolio(S.db.exportPayload(), S.dek, S.wrap, S.password);
        S.wrap = again.wrap;
        await pushFile(again.bytes, message, attempt + 1);
        return;
      }
      throw e;
    }
  }

  async function onSubmit(ev) {
    const form = ev.target;
    if (!form || !form.getAttribute) return;
    const action = form.getAttribute('data-action');
    if (!action) return;
    ev.preventDefault();
    if (form.dataset.confirm && !confirm(form.dataset.confirm)) return;
    const fd = new FormData(form);
    try {
      if (action === 'filter-trades') {
        go('#/trades' + U.qs({ status: fd.get('status'), signal: fd.get('signal'), kind: fd.get('kind'), month: fd.get('month'), q: fd.get('q') }));
        return;
      }
      if (action === 'save-entity') {
        const table = fd.get('_table'), rid = fd.get('_id');
        const vals = readEntity(form, table);
        let id;
        if (rid === 'new') id = S.db.insert(table, vals).id;
        else { id = +rid; S.db.update(table, id, vals); }
        S.flash = 'Saved.';
        await persist('Update ' + table + ' ' + id);
        go(backFor(table, vals, id));
        return;
      }
      if (action === 'delete-entity') {
        const table = fd.get('_table'), id = +fd.get('_id');
        if (table === 'trades') {
          S.db.rows('tranches').filter(function (x) { return x.trade_id === id; }).forEach(function (x) {
            S.db.update('tranches', x.id, { trade_id: null, status: 'Unfilled' });
          });
        }
        if (table === 'bots') S.db.rows('bot_events').filter(function (e) { return e.bot_id === id; }).forEach(function (e) { S.db.remove('bot_events', e.id); });
        S.db.remove(table, id);
        S.flash = 'Deleted.';
        await persist('Delete ' + table + ' ' + id);
        go(deleteBack(table));
        return;
      }
      if (action === 'quick-tranche') {
        const fl = function (v) { const s = String(v || '').trim(); return s === '' ? null : parseFloat(s); };
        const tid = +fd.get('trade_id');
        const parent = S.db.get('trades', tid);
        S.db.insert('tranches', {
          trade_id: tid, side: fd.get('side'), status: fd.get('status'), date: fd.get('date'),
          price: fl(fd.get('price')), size: fl(fd.get('size')), fees: fl(fd.get('fees')),
          title: parent ? parent.name : null, notes: String(fd.get('notes') || '').trim() || null
        });
        S.flash = fd.get('side') + ' tranche added.';
        await persist('Add tranche');
        go('#/trades/' + tid);
        return;
      }
      if (action === 'take-snapshot') {
        g.PTCalc.takeSnapshot(S.db, String(fd.get('label') || '').trim() || 'Manual snapshot', 'manual');
        S.flash = 'Snapshot stored.';
        await persist('Portfolio snapshot');
        go('#/portfolio');
        return;
      }
      if (action === 'delete-snapshot') {
        const id = +fd.get('id');
        S.db.remove('snapshots', id);
        S.db.tables.snapshot_lines = S.db.rows('snapshot_lines').filter(function (l) { return l.snapshot_id !== id; });
        S.flash = 'Snapshot deleted.';
        await persist('Delete snapshot');
        go('#/portfolio');
        return;
      }
      if (action === 'refresh-prices') {
        S.flash = 'Refreshing prices…';
        onRoute();
        const res = await g.PTPrices.refresh(S.db);
        g.PTCalc.takeSnapshot(S.db, 'Daily (auto)', 'daily');
        S.flash = 'Prices updated for ' + res.ok.length + ' assets' + (res.fail.length ? '. Kept stored prices for ' + res.fail.length + ' (see Assets).' : '.');
        await persist('Refresh prices');
        go(String(fd.get('next') || '#/assets'));
        return;
      }
      if (action === 'freeze-report') {
        const kind = fd.get('kind'), period = fd.get('period');
        const r = g.PTCalc.buildReport(S.db, kind, period);
        S.db.insert('reports', { kind: kind, period: period, title: kind.charAt(0).toUpperCase() + kind.slice(1) + ' report ' + period + ' (frozen)', generated_at: r.generated, data_json: JSON.stringify(r), source: 'app' });
        S.flash = 'Report frozen (stored copy).';
        await persist('Freeze report ' + period);
        go('#/reports');
        return;
      }
      if (action === 'resolve-note') {
        const row = S.db.get('import_notes', fd.get('id'));
        if (row) S.db.update('import_notes', row.id, { resolved: row.resolved ? 0 : 1 });
        await persist('Update issue');
        go('#/issues');
        return;
      }
      if (action === 'attach') {
        const file = form.querySelector('input[type=file]').files[0];
        if (!file) return;
        const owner = fd.get('owner'), oid = +fd.get('oid');
        const buf = new Uint8Array(await file.arrayBuffer());
        const row = S.db.insert('attachments', {
          owner_type: owner, owner_id: oid, filename: file.name, path: owner + '/' + oid + '/' + file.name, created: U.nowStamp()
        });
        S.blobs.set(row.id, buf);
        S.pending.add(row.id);
        S.flash = 'File attached.';
        await persist('Attach file');
        go(String(fd.get('next') || '#/'));
        return;
      }
      if (action === 'save-settings') {
        if (fd.get('default_portfolio')) S.db.setSetting('default_portfolio', String(fd.get('default_portfolio')).trim());
        if (fd.get('default_risk_pct')) S.db.setSetting('default_risk_pct', String(fd.get('default_risk_pct')).trim());
        const neu = String(fd.get('new') || '');
        const old = String(fd.get('old') || '');
        if (neu) {
          if (neu.length < 10) { S.flash = 'New password must be at least 10 characters.'; onRoute(); return; }
          if (old !== S.password) { S.flash = 'Current password is wrong.'; onRoute(); return; }
          S.wrap = await g.PTCrypto.wrapDek(neu, S.dek, g.PTCrypto.ITERATIONS);
          S.password = neu;
          if (S.token) localStorage.setItem(TOKEN_KEY, await g.PTCrypto.encryptToken(S.dek, S.token));
          S.flash = 'Password changed. Data re-encrypted.';
          await persist('Re-encrypt portfolio');
        } else {
          S.flash = 'Settings saved.';
          await persist('Update settings');
        }
        go('#/settings');
        return;
      }
      if (action === 'save-token') {
        const token = String(fd.get('token') || '').trim();
        if (!token) { S.flash = 'Paste a token first.'; onRoute(); return; }
        S.token = token;
        localStorage.setItem(TOKEN_KEY, await g.PTCrypto.encryptToken(S.dek, token));
        S.flash = 'Token saved on this device (encrypted).';
        try {
          const remote = await refreshSha();
          const opened = await g.PTCrypto.decryptPortfolio(S.password, remote.bytes);
          const local = S.db.exportPayload();
          if (JSON.stringify(canonPayload(local)) !== JSON.stringify(canonPayload(opened.data))) {
            const merged = mergePayloads(opened.data, local, opened.data);
            S.db = new g.PTDB.MemDB({ v: 1, tables: merged.tables });
            S.base = opened.data;
            if (merged.conflicts.length) {
              S.conflict = merged;
              S.sync = 'conflict';
              S.flash = 'Token saved. Some records differ from GitHub.';
              onRoute();
              return;
            }
            await persist('Sync portfolio');
          } else S.sync = 'synced';
        } catch (e) {
          S.flash = 'Token saved, but GitHub said: ' + e.message;
          S.sync = 'error';
        }
        go('#/settings');
        return;
      }
      if (action === 'create-trade-from-calc') {
        const params = new URLSearchParams();
        Array.from(form.elements).forEach(function (el) {
          if (!el.name || el.type === 'submit') return;
          if (el.value != null && el.value !== '') params.set(el.name, el.value);
        });
        if (!params.get('risk_usd')) {
          const ps = parseFloat(params.get('portfolio_size') || '');
          const rp = parseFloat((document.getElementById('rp') || {}).value || '');
          if (ps && rp) params.set('risk_usd', (ps * rp / 100).toFixed(2));
        }
        if (!params.get('signal_source')) params.set('signal_source', 'Standard Strategy');
        go('#/e/trades/new?' + params.toString());
        return;
      }
    } catch (e) {
      S.flash = e.message || String(e);
      onRoute();
    }
  }
  function canonPayload(p) {
    const tables = {};
    Object.keys(p.tables).sort().forEach(function (t) {
      tables[t] = (p.tables[t] || []).map(canon);
    });
    return { v: 1, tables: tables };
  }

  async function onClick(ev) {
    const blob = ev.target.closest ? ev.target.closest('[data-blob-link]') : null;
    if (blob) {
      ev.preventDefault();
      try { await openBlob(+blob.getAttribute('data-blob-link'), blob.getAttribute('data-name')); }
      catch (e) { S.flash = 'Could not open attachment.'; onRoute(); }
      return;
    }
    const el = ev.target.closest ? ev.target.closest('[data-action-click]') : null;
    if (!el) return;
    const action = el.getAttribute('data-action-click');
    ev.preventDefault();
    if (action === 'export-json') {
      const data = S.db.exportPayload();
      data._meta = { exported_at: U.nowLocal(), app: 'Portfolio Tracker' };
      download('portfolio-backup-' + U.today() + '.json', JSON.stringify(data, null, 1), 'application/json');
      return;
    }
    if (action === 'export-csv') {
      const data = S.db.exportPayload();
      const files = Object.keys(data.tables).map(function (t) { return { name: t + '.csv', data: g.PTZip.csvTable(data.tables[t] || []) }; });
      download('portfolio-backup-' + U.today() + '-csv.zip', g.PTZip.build(files), 'application/zip');
      return;
    }
    if (action === 'sync-now') {
      S.flash = '';
      await persist('Sync portfolio');
      onRoute();
      return;
    }
    if (action === 'forget-token') {
      S.token = ''; S.sha = null; localStorage.removeItem(TOKEN_KEY); S.sync = 'local'; S.flash = 'Token removed from this browser.'; onRoute(); return;
    }
    if (action === 'forget-device') {
      if (!confirm('Clear the saved copy and token on this device?')) return;
      try { await g.PTCache.clear(); } catch (e) {}
      localStorage.removeItem(TOKEN_KEY);
      logout();
      return;
    }
    if (action === 'conflict-sync') {
      if (!S.conflict) return;
      S.db = new g.PTDB.MemDB({ v: 1, tables: S.conflict.tables });
      S.conflict = null;
      S.flash = 'Merged and syncing.';
      await persist('Merge portfolio');
      onRoute();
      return;
    }
    if (action === 'conflict-theirs') {
      if (!S.conflict) return;
      try {
        const remote = await g.PTGitHub.getFile(S.token, 'data/portfolio.enc');
        const opened = await g.PTCrypto.decryptPortfolio(S.password, remote.bytes);
        S.sha = remote.sha;
        S.db = new g.PTDB.MemDB(opened.data);
        S.base = g.PTDB.clonePayload(opened.data);
        S.conflict = null;
        S.sync = 'synced';
        try { await g.PTCache.put('working', copyBuf(remote.bytes)); await g.PTCache.put('dirty', false); await g.PTCache.put('base', copyBuf(remote.bytes)); } catch (e) {}
        S.flash = 'Loaded the GitHub copy. Local overlapping edits were dropped.';
      } catch (e) { S.flash = e.message; }
      onRoute();
    }
  }

  function logout() {
    S.db = null; S.dek = null; S.wrap = null; S.password = null; S.token = ''; S.blobs.clear(); S.pending.clear(); S.conflict = null;
    window.removeEventListener('hashchange', onRoute);
    location.hash = '';
    renderLogin();
  }

  function boot() {
    document.addEventListener('submit', onSubmit);
    document.addEventListener('click', function (e) {
      const menu = $('moremenu');
      if (menu && menu.classList.contains('open') && !e.target.closest('#moremenu') && !e.target.closest('#morebtn')) menu.classList.remove('open');
      onClick(e);
    });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
    renderLogin();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
