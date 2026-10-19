/* Screens. Markup follows the original templates so the same stylesheet applies. */
(function (g) {
  'use strict';
  const U = g.PTUtil, M = g.PTModel, C = g.PTCalc;

  function pill(cls, text) { return '<span class="pill ' + U.esc(cls) + '">' + U.esc(text) + '</span>'; }
  function kindBadges(t, mobile) {
    const kd = t.kind === 'Spot' ? 'spot' : 'perp';
    let s = '<span class="pill kind-' + kd + '">' + (t.kind === 'Spot' ? 'SPOT' : 'PERP') + '</span>';
    if (t.kind !== 'Spot') s += ' <span class="pill dir-' + ((t.direction || 'Long') === 'Short' ? 'short' : 'long') + '">' + ((t.direction || 'Long') === 'Short' ? '▼ Short' : '▲ Long') + '</span>';
    if (t.kind_unknown) s += ' <span class="pill sev-warn" title="No type set">type?</span>';
    return s;
  }
  function sigPill(src) { return '<span class="pill ' + U.sigClass(src) + '">' + U.esc(U.sigShort(src)) + '</span>'; }
  function catBars(cats) {
    return (cats || []).map(function (c) {
      return '<div class="catrow"><span>' + U.esc(c[0]) + '</span><span class="n">' + U.money(c[1], 0) + '</span><span class="muted small right">' + U.pct(c[2]) + '</span><div class="bar"><i style="width:' + Math.max(0, Math.min(100, c[2] || 0)) + '%"></i></div></div>';
    }).join('');
  }
  function spark(hist) {
    if (!hist || hist.length < 2) return '<p class="muted">History starts with the imported month-end snapshot. Take a snapshot, or refresh prices, to add today.</p>';
    const vals = hist.map(function (h) { return h[1]; });
    const mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
    const pts = hist.map(function (h, i) {
      const x = i * 300 / (hist.length - 1);
      const y = 95 - (h[1] - mn) / ((mx - mn) || 1) * 90;
      return x.toFixed(2) + ',' + y.toFixed(2);
    }).join(' ');
    return '<svg class="spark" viewBox="0 0 300 100" preserveAspectRatio="none"><polyline fill="none" stroke="#3b82f6" stroke-width="2" points="' + pts + '"/></svg>' +
      '<div class="muted small">' + U.esc(hist[0][0]) + ' ' + U.money(hist[0][1], 0) + ' → ' + U.esc(hist[hist.length - 1][0]) + ' ' + U.money(hist[hist.length - 1][1], 0) + '</div>';
  }
  function booksOf(active) {
    const out = {};
    ['Perp', 'Spot'].forEach(function (kd) {
      const L = active.filter(function (t) { return t.kind === kd; });
      out[kd] = {
        trades: L, n: L.length,
        unreal: L.reduce(function (s, t) { return s + t.unrealized; }, 0),
        expo: L.reduce(function (s, t) { return s + t.exposure; }, 0),
        long: L.filter(function (t) { return t.direction !== 'Short'; }).reduce(function (s, t) { return s + t.exposure; }, 0),
        short: L.filter(function (t) { return t.direction === 'Short'; }).reduce(function (s, t) { return s + t.exposure; }, 0),
        nlong: L.filter(function (t) { return t.direction !== 'Short'; }).length,
        nshort: L.filter(function (t) { return t.direction === 'Short'; }).length,
        unknown: L.filter(function (t) { return t.kind_unknown; }).length
      };
    });
    return out;
  }
  function lineLink(l) {
    if (l.source === 'holding') return '<a href="#/e/holdings/' + l.ref_id + '">' + U.esc(l.name) + '</a>';
    if (l.source === 'bot') return '🤖 <a href="#/bots/' + l.ref_id + '">' + U.esc(l.name) + '</a>';
    if (l.source === 'lp') return '💧 <a href="#/lps/' + l.ref_id + '">' + U.esc(l.name) + '</a>';
    return '₿ <a href="#/btc">' + U.esc(l.name) + '</a>';
  }
  function fkOptions(db, ref) {
    const spec = M.E[ref];
    let rows = db.rows(ref).slice();
    if (ref === 'trades') rows.sort(function (a, b) { return (b.open_date || '') < (a.open_date || '') ? -1 : 1; });
    else rows.sort(function (a, b) { return String(a[spec.title] || '').localeCompare(String(b[spec.title] || '')); });
    return rows.map(function (r) {
      let lab = r[spec.title] || ('#' + r.id);
      if (ref === 'trades') lab = (r.name || '(blank)') + ' (' + (r.status || '') + ')';
      if (ref === 'holdings') {
        const ac = r.account_id ? db.get('accounts', r.account_id) : null;
        lab = (r.name || '') + (ac ? ' — ' + ac.name : '');
      }
      if (ref === 'lps') lab = (r.lp_id || '') + ' ' + (r.asset1 || '') + '/' + (r.asset2 || '');
      return [r.id, lab];
    });
  }
  function numIn(v) {
    if (v == null || v === '') return '';
    const n = Number(v);
    if (!isFinite(n)) return '';
    return String(parseFloat(n.toPrecision(12)));
  }
  function fieldHtml(db, field, value) {
    const n = field[0], label = field[1], t = field[2], o = field[3];
    let control = '';
    if (t === 'select') {
      const req = n === 'signal_source' ? ' required' : '';
      control = '<select id="f_' + n + '" name="' + n + '"' + req + '>' + (n === 'signal_source' ? '' : '<option value=""></option>');
      (o || []).forEach(function (x) { control += '<option' + (value === x ? ' selected' : '') + '>' + U.esc(x) + '</option>'; });
      if (value && (o || []).indexOf(value) < 0) control += '<option selected>' + U.esc(value) + '</option>';
      control += '</select>';
    } else if (String(t).indexOf('fk:') === 0) {
      const opts = fkOptions(db, t.slice(3));
      control = '<select id="f_' + n + '" name="' + n + '"><option value="">—</option>';
      opts.forEach(function (pair) {
        control += '<option value="' + pair[0] + '"' + (value != null && String(value) === String(pair[0]) ? ' selected' : '') + '>' + U.esc(pair[1]) + '</option>';
      });
      control += '</select>';
    } else if (t === 'bool') {
      const on = value && String(value) !== '0';
      control = '<input type="checkbox" id="f_' + n + '" name="' + n + '" value="1"' + (on ? ' checked' : '') + ' style="width:auto">';
    } else if (t === 'textarea') {
      control = '<textarea id="f_' + n + '" name="' + n + '" rows="3">' + U.esc(value || '') + '</textarea>';
    } else if (t === 'date') {
      control = '<input type="date" id="f_' + n + '" name="' + n + '" value="' + U.esc(value || '') + '">';
    } else if (t === 'num') {
      control = '<input id="f_' + n + '" name="' + n + '" inputmode="decimal" value="' + U.esc(numIn(value)) + '">';
    } else {
      control = '<input id="f_' + n + '" name="' + n + '" value="' + U.esc(value || '') + '"' + (t === 'url' ? ' type="url"' : '') + '>';
    }
    return '<div class="' + (t === 'textarea' ? 'full' : '') + '"><label for="f_' + n + '">' + U.esc(label) + (n === 'signal_source' ? ' *' : '') + '</label>' + control + '</div>';
  }
  function thumbs(atts) {
    if (!atts || !atts.length) return '';
    return '<div class="thumbs">' + atts.map(function (a) {
      const img = /\.(png|jpe?g|webp|gif)$/i.test(a.filename || '');
      if (img) return '<a href="#" data-blob-link="' + a.id + '" data-name="' + U.esc(a.filename) + '"><img alt="' + U.esc(a.filename) + '" data-blob="' + a.id + '" data-name="' + U.esc(a.filename) + '" loading="lazy" style="height:120px;background:#0d1628"></a>';
      return '<a href="#" data-blob-link="' + a.id + '" data-name="' + U.esc(a.filename) + '">📎 ' + U.esc(a.filename) + '</a>';
    }).join('') + '</div>';
  }
  function attachForm(owner, oid, next) {
    return '<form data-action="attach" class="filters" style="margin-top:10px"><input type="hidden" name="owner" value="' + U.esc(owner) + '"><input type="hidden" name="oid" value="' + oid + '"><input type="hidden" name="next" value="' + U.esc(next) + '"><input type="file" name="file" accept="image/*,.pdf,.csv,.txt" required><button class="btn sec sm">Attach</button></form>';
  }

  function dashboard(db) {
    const prices = C.assetPrices(db);
    const lines = C.portfolioLines(db, 'live', prices);
    const bc = C.byCategory(lines);
    const trades = C.loadTrades(db, prices);
    const active = Object.keys(trades).map(function (k) { return trades[k]; }).filter(function (t) { return t.status === 'Active' || t.status === 'Planned'; });
    active.sort(function (a, b) { return (b.open_date || '') < (a.open_date || '') ? -1 : 1; });
    const today = U.today();
    const mtd = C.coreTrading(trades, today.slice(0, 7) + '-01', today);
    const dca = C.dcaByAsset(db, null, null, prices);
    const histMap = {};
    db.rows('snapshots').slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id; }).forEach(function (s) { histMap[s.date] = s.total; });
    const hist = Object.keys(histMap).sort().map(function (d) { return [d, histMap[d]]; });
    const btc = C.loadBtc(db, (prices[C.btcAssetId(db)] || {}).price).live;
    const iss = g.PTIssues.counts(db);
    const botsVal = lines.filter(function (l) { return l.source === 'bot'; }).reduce(function (s, l) { return s + (l.value || 0); }, 0);
    const lpsVal = lines.filter(function (l) { return l.source === 'lp'; }).reduce(function (s, l) { return s + (l.value || 0); }, 0);
    const unreal = active.reduce(function (s, t) { return s + t.unrealized; }, 0);
    const books = booksOf(active);
    const ym = today.slice(0, 7);
    let html = '<header class="top"><h1>Dashboard</h1><form data-action="refresh-prices"><input type="hidden" name="next" value="#/"><button class="btn sec sm">↻ Refresh prices</button></form><a class="btn sm" href="#/e/trades/new">+ Trade</a><a class="btn sm" href="#/e/dca/new">+ DCA buy</a></header>';
    html += '<div class="grid">';
    html += '<div class="card kpi"><div class="l">Portfolio total</div><div class="v">' + U.money(bc.total, 0) + '</div><div class="muted small">live prices · bots, LPs & BTC protocol included</div></div>';
    html += '<div class="card kpi"><div class="l">Trading PnL this month</div><div class="v ' + U.clsPnL(mtd.pnl) + '">' + U.money(mtd.pnl, 2, true) + '</div><div class="muted small">' + U.rr(mtd.r) + ' · ' + mtd.parents + ' trades · WR ' + U.pct(mtd.wr) + '</div></div>';
    html += '<div class="card kpi"><div class="l">Open trades</div><div class="v">' + active.length + '</div><div class="muted small">⚡ ' + books.Perp.n + ' perps · 🪙 ' + books.Spot.n + ' spot · unreal. <span class="' + U.clsPnL(unreal) + '">' + U.money(unreal, 2, true) + '</span></div></div>';
    html += '<div class="card kpi"><div class="l">DCA unrealized PnL</div><div class="v ' + U.clsPnL(dca.tot.pnl) + '">' + U.money(dca.tot.pnl, 0, true) + '</div><div class="muted small">cost ' + U.money(dca.tot.cost, 0) + ' → ' + U.money(dca.tot.value, 0) + '</div></div>';
    html += '<div class="card kpi"><div class="l">Bots · LPs</div><div class="v">' + U.money(botsVal, 0) + '</div><div class="muted small">LPs ' + U.money(lpsVal, 0) + '</div></div>';
    html += '<div class="card kpi"><div class="l">BTC Protocol NSV</div><div class="v">' + (btc ? U.money(btc.nsv, 0) : '—') + '</div><div class="muted small">' + (btc ? 'LTV ' + U.pct(btc.ltv, 2) + ' · ' + U.esc(btc.risk_status) + ' · ' + U.esc(btc.month) + ' qty × live BTC' : '') + '</div></div>';
    html += '</div><div class="dash2" style="margin-top:14px"><div class="col">';
    html += '<div class="card"><h2>Portfolio by category</h2>' + catBars(bc.cats) + '<a class="small" href="#/portfolio">Open portfolio →</a></div>';
    html += '<div class="card"><h2>Portfolio history (stored snapshots)</h2>' + spark(hist) + '</div>';
    html += '<div class="card"><h2>Data health</h2><p>' + pill('error', iss.sev.error + ' errors') + ' ' + pill('warn', iss.sev.warn + ' warnings') + ' ' + pill('info', iss.sev.info + ' info') + '</p><a href="#/issues">Open Issues →</a> · <a href="#/reports/monthly/' + ym + '">This month\'s report →</a></div>';
    html += '</div><div class="col">';
    [['Perp', 'Perps', '⚡'], ['Spot', 'Spot', '🪙']].forEach(function (spec) {
      const kd = spec[0], bk = books[kd];
      html += '<div class="card book book-' + kd.toLowerCase() + '"><div class="bookhead"><h2>' + spec[2] + ' ' + spec[1] + ' <span class="cnt">' + bk.n + '</span></h2><div class="bookkpi"><span class="muted small">' + (kd === 'Perp' ? 'Exposure' : 'Market value') + '</span> <b>' + U.money(bk.expo, 0) + '</b>';
      if (kd === 'Perp') html += '<span class="muted small">L ' + bk.nlong + ' · ' + U.money(bk.long, 0) + ' / S ' + bk.nshort + ' · ' + U.money(bk.short, 0) + '</span>';
      html += '<span class="muted small">Unrealized</span> <b class="' + U.clsPnL(bk.unreal) + '">' + U.money(bk.unreal, 2, true) + '</b></div></div>';
      if (bk.unknown) html += '<p class="warn small">⚠ ' + bk.unknown + ' trade(s) with unknown type shown as Perp — <a href="#/issues">see Issues</a></p>';
      html += '<div class="tw"><table><tr><th>Trade</th><th>Signal</th><th class="n hide-m">Units</th><th class="n hide-m">' + (kd === 'Perp' ? 'Exposure' : 'Value') + '</th><th class="n">Unreal.</th><th class="n">R</th></tr>';
      if (!bk.trades.length) html += '<tr><td colspan="6" class="muted">No open ' + spec[1].toLowerCase() + '.</td></tr>';
      bk.trades.forEach(function (t) {
        html += '<tr><td class="tname">' + kindBadges(t) + (t.status !== 'Active' ? ' ' + pill(t.status, t.status) : '') + '<div><a href="#/trades/' + t.id + '">' + U.esc(t.name) + '</a></div></td>';
        html += '<td>' + sigPill(t.signal_source) + '</td><td class="n hide-m">' + U.num(t.open_units) + '</td><td class="n hide-m">' + U.money(t.exposure, 0) + '</td>';
        html += '<td class="n ' + U.clsPnL(t.unrealized) + '">' + U.money(t.unrealized, 2, true) + '</td><td class="n">' + U.rr(t.unrealized_r) + '</td></tr>';
      });
      html += '</table></div><a class="small" href="#/trades?kind=' + kd + '">All ' + spec[1].toLowerCase() + ' →</a></div>';
    });
    html += '</div></div>';
    return { title: 'Dashboard', html: html, issues: iss };
  }

  function portfolio(db, q) {
    const showZero = q.show_zero === '1';
    const lines = C.portfolioLines(db);
    const bc = C.byCategory(lines);
    const groups = {}, gtot = {};
    lines.forEach(function (l) {
      if (!showZero && !l.value) return;
      const k = l.category || 'Other';
      (groups[k] = groups[k] || []).push(l);
    });
    Object.keys(groups).forEach(function (k) {
      groups[k].sort(function (a, b) { return (b.value || 0) - (a.value || 0); });
      gtot[k] = groups[k].reduce(function (s, l) { return s + (l.value || 0); }, 0);
    });
    const seen = {};
    const order = bc.cats.map(function (c) { seen[c[0]] = 1; return c[0]; }).concat(Object.keys(groups).filter(function (k) { return !seen[k]; }));
    const archived = db.rows('holdings').filter(function (h) { return h.archived; }).length;
    const snaps = db.rows('snapshots').slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id; }).slice(0, 60);
    let html = '<header class="top"><h1>Portfolio <span class="muted">' + U.money(bc.total, 2) + '</span></h1><a class="btn sm" href="#/e/holdings/new">+ Holding</a><a class="btn sec sm" href="#/portfolio?show_zero=' + (showZero ? '0' : '1') + '">' + (showZero ? 'Hide' : 'Show') + ' zero rows</a></header>';
    html += '<p class="muted small">Quantities: <b>manual/opening balance + DCA ledger</b> (DCA buys/sells linked to a holding change it automatically). Bots = latest Balance update, LPs = current value (or capital), BTC Protocol = latest snapshot quantities × live BTC price. Edit a row to change category, account or opening balance.</p>';
    html += '<div class="card" style="margin-bottom:14px"><h2>Allocation</h2>' + catBars(bc.cats) + '</div>';
    order.forEach(function (cat) {
      if (!groups[cat]) return;
      html += '<div class="card" style="margin-bottom:12px"><h2>' + U.esc(cat) + ' · ' + U.money(gtot[cat], 2) + '</h2><div class="tw"><table><tr><th>Position</th><th class="hide-m">Account</th><th class="n">Quantity</th><th class="n">Price</th><th class="n">Value</th><th class="hide-m">Source</th></tr>';
      groups[cat].forEach(function (l) {
        html += '<tr><td>' + lineLink(l) + (l.asset && l.asset !== l.name ? ' <span class="muted small">' + U.esc(l.asset) + '</span>' : '') + '</td>';
        html += '<td class="hide-m muted">' + U.esc(l.account || '') + '</td><td class="n">' + (l.qty == null ? '' : U.num(l.qty)) + (l.ledger_qty ? '<div class="muted small">ledger ' + U.num(l.ledger_qty) + '</div>' : '') + '</td>';
        html += '<td class="n">' + (l.price == null ? '' : U.num(l.price)) + '</td><td class="n">' + U.money(l.value, 2) + '</td><td class="hide-m muted small">' + U.esc(l.price_source || '') + '</td></tr>';
      });
      html += '</table></div></div>';
    });
    html += '<div class="card" id="snapshots"><h2>Stored snapshots (month-end & daily)</h2><form data-action="take-snapshot" class="filters"><input name="label" placeholder="Label (e.g. Oct 2026 month-end)" style="min-width:240px"><button class="btn sm">📸 Take snapshot now</button></form>';
    html += '<div class="tw"><table><tr><th>Date</th><th>Kind</th><th>Label</th><th class="n">Total</th></tr>';
    snaps.forEach(function (s) {
      html += '<tr><td><a href="#/snapshots/' + s.id + '">' + U.esc(s.date) + '</a></td><td>' + U.esc(s.kind) + '</td><td>' + U.esc(s.label) + '</td><td class="n">' + U.money(s.total, 2) + '</td></tr>';
    });
    html += '</table></div><p class="muted small">Refresh prices to store today\'s snapshot (it replaces an earlier one from the same day). Reports for past months use the last snapshot on or before month-end.</p></div>';
    if (archived) html += '<p class="muted small">' + archived + ' archived holdings hidden.</p>';
    return { title: 'Portfolio', html: html };
  }

  function snapshot(db, id) {
    const s = db.get('snapshots', id);
    if (!s) return { title: 'Snapshot', html: '<p>Not found.</p>' };
    const lines = db.rows('snapshot_lines').filter(function (l) { return l.snapshot_id === s.id; });
    lines.sort(function (a, b) {
      if ((a.category || '') !== (b.category || '')) return (a.category || '') < (b.category || '') ? -1 : 1;
      return (b.value || 0) - (a.value || 0);
    });
    const bc = C.byCategory(lines);
    let html = '<header class="top"><h1>Snapshot ' + U.esc(s.date) + ' <span class="muted">' + U.money(bc.total, 2) + '</span></h1><form data-action="delete-snapshot" data-confirm="Delete this snapshot?"><input type="hidden" name="id" value="' + s.id + '"><button class="btn danger sm">Delete</button></form></header>';
    html += '<p class="muted">' + U.esc(s.kind) + ' — ' + U.esc(s.label) + '</p><div class="card" style="margin-bottom:12px">' + catBars(bc.cats) + '</div>';
    html += '<div class="card tw"><table><tr><th>Category</th><th>Position</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Value</th></tr>';
    lines.forEach(function (l) {
      html += '<tr><td>' + U.esc(l.category) + '</td><td>' + U.esc(l.name) + ' <span class="muted small">' + U.esc(l.source) + '</span></td><td class="n">' + U.num(l.qty) + '</td><td class="n">' + U.num(l.price) + '</td><td class="n">' + U.money(l.value) + '</td></tr>';
    });
    html += '</table></div>';
    return { title: 'Snapshot ' + s.date, html: html };
  }

  function assets(db) {
    const pr = C.assetPrices(db);
    const use = {};
    function bump(id) { if (id) use[id] = (use[id] || 0) + 1; }
    db.rows('holdings').forEach(function (r) { bump(r.asset_id); });
    db.rows('dca').forEach(function (r) { bump(r.asset_id); });
    db.rows('trades').forEach(function (r) { bump(r.asset_id); });
    db.rows('bots').forEach(function (r) { bump(r.asset_id); });
    const failed = db.setting('prices_failed', '');
    const rows = db.rows('assets').slice().sort(function (a, b) { return (a.symbol || '').localeCompare(b.symbol || ''); });
    let html = '<header class="top"><h1>Assets & prices</h1><form data-action="refresh-prices"><input type="hidden" name="next" value="#/assets"><button class="btn sm">↻ Refresh all prices</button></form><a class="btn sec sm" href="#/e/assets/new">+ Asset</a></header>';
    html += '<p class="muted small">Crypto prices come from CoinGecko. FX pairs come from Frankfurter. Stocks, commodities and indices use the stored price when Yahoo Finance blocks the browser — those rows are marked <span class="price-stored">stored</span>. Tick “Use manual price” on an asset to override. Last refresh: ' + U.esc((db.setting('prices_refreshed') || 'never').slice(0, 16).replace('T', ' ')) + '.' + (failed ? ' <span class="warn">Could not refresh: ' + U.esc(failed) + '</span>' : '') + '</p>';
    html += '<div class="card tw"><table><tr><th>Symbol</th><th class="hide-m">Name</th><th>Class</th><th class="n">Price</th><th>Source</th><th class="hide-m">Ticker / id</th><th class="hide-m">Updated</th><th class="n hide-m">Used</th><th></th></tr>';
    rows.forEach(function (a) {
      const p = pr[a.id] || {};
      const failedSym = failed && failed.indexOf(a.symbol + ' (') >= 0;
      let src;
      if (a.manual_override) src = pill('Planned', 'manual override');
      else if (failedSym && a.price_source === 'yahoo') src = '<span class="price-stored">stored' + (p.source ? ' · ' + U.esc(p.source) : '') + '</span>';
      else src = U.esc(p.source || '—');
      html += '<tr><td><b>' + U.esc(a.symbol) + '</b></td><td class="hide-m">' + U.esc(a.name) + '</td><td>' + U.esc(a.asset_class) + '</td><td class="n">' + U.num(p.price) + '</td><td>' + src + '</td>';
      html += '<td class="hide-m muted">' + U.esc(a.price_ticker || '') + '</td><td class="hide-m muted small">' + U.esc((p.ts || '').slice(0, 16).replace('T', ' ')) + '</td><td class="n hide-m">' + (use[a.id] || 0) + '</td>';
      html += '<td class="nowrap"><a href="#/e/assets/' + a.id + '">edit</a> · <a href="#/assets/' + a.id + '/history">history</a></td></tr>';
    });
    html += '</table></div>';
    return { title: 'Assets & prices', html: html };
  }

  function assetHistory(db, id) {
    const a = db.get('assets', id);
    if (!a) return { title: 'Prices', html: '<p>Not found.</p>' };
    const rows = db.rows('prices').filter(function (r) { return r.asset_id === a.id; }).sort(function (x, y) { return (y.ts || '') < (x.ts || '') ? -1 : 1; }).slice(0, 300);
    let html = '<header class="top"><h1>' + U.esc(a.symbol) + ' — stored prices</h1><a class="btn sec sm" href="#/e/assets/' + a.id + '">Edit asset</a></header>';
    html += '<div class="card tw"><table><tr><th>Time</th><th class="n">Price</th><th>Source</th></tr>';
    rows.forEach(function (r) { html += '<tr><td>' + U.esc(r.ts) + '</td><td class="n">' + U.num(r.price) + '</td><td>' + U.esc(r.source) + '</td></tr>'; });
    html += '</table></div>';
    return { title: a.symbol + ' prices', html: html };
  }

  function dca(db, q) {
    const asset = q.asset ? +q.asset : null;
    const pack = C.dcaByAsset(db);
    const acc = {}; db.rows('accounts').forEach(function (a) { acc[a.id] = a.name; });
    const holds = {}; db.rows('holdings').forEach(function (h) { holds[h.id] = h.name; });
    const trades = {}; db.rows('trades').forEach(function (t) { trades[t.id] = t.name; });
    const assets = {}; db.rows('assets').forEach(function (a) { assets[a.id] = a.symbol; });
    let tx = db.rows('dca').slice();
    if (asset) tx = tx.filter(function (d) { return d.asset_id === asset; });
    tx.sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : (a.date || '') < (b.date || '') ? 1 : b.id - a.id; });
    const tot = pack.tot;
    let html = '<header class="top"><h1>DCA tracker</h1><a class="btn sm" href="#/e/dca/new' + (asset ? '?asset_id=' + asset : '') + '">+ Buy / Sell</a></header>';
    html += '<div class="grid" style="margin-bottom:12px"><div class="card kpi"><div class="l">Cost basis</div><div class="v">' + U.money(tot.cost, 2) + '</div></div>';
    html += '<div class="card kpi"><div class="l">Current value</div><div class="v">' + U.money(tot.value, 2) + '</div></div>';
    html += '<div class="card kpi"><div class="l">Unrealized PnL</div><div class="v ' + U.clsPnL(tot.pnl) + '">' + U.money(tot.pnl, 2, true) + '</div><div class="muted small">' + tot.n + ' assets' + (tot.missing.length ? '; no price: ' + U.esc(tot.missing.join(', ')) : '') + '</div></div></div>';
    html += '<div class="card" style="margin-bottom:12px"><h2>By asset (live prices)</h2><div class="tw"><table><tr><th>Asset</th><th class="n">Cost</th><th class="n">Units</th><th class="n">Avg cost</th><th class="n">Price</th><th class="n">Value</th><th class="n">Sale proceeds</th><th class="n">PnL</th><th class="n">#</th></tr>';
    pack.rows.forEach(function (r) {
      html += '<tr><td><a href="#/dca?asset=' + r.asset_id + '">' + U.esc(r.symbol) + '</a></td><td class="n">' + U.money(r.cost) + '</td><td class="n">' + U.num(r.size, 8) + '</td><td class="n">' + U.num(r.avg) + '</td><td class="n">' + U.num(r.price) + '</td>';
      html += '<td class="n">' + U.money(r.value) + '</td><td class="n">' + (r.proceeds ? U.money(r.proceeds) : '') + '</td><td class="n ' + U.clsPnL(r.pnl) + '">' + U.money(r.pnl, 2, true) + '</td><td class="n">' + r.n + '</td></tr>';
    });
    html += '<tr class="tot"><td>Total</td><td class="n">' + U.money(tot.cost) + '</td><td></td><td></td><td></td><td class="n">' + U.money(tot.value) + '</td><td></td><td class="n">' + U.money(tot.pnl, 2, true) + '</td><td></td></tr></table></div>';
    html += '<p class="muted small">PnL = units × price + sale proceeds − total spent (buys include fees).</p></div>';
    html += '<div class="card"><h2>Transactions' + (asset ? ' — filtered <a href="#/dca">(clear)</a>' : '') + '</h2><div class="tw"><table><tr><th>Date</th><th>Asset</th><th>Type</th><th class="n">Size</th><th class="n">Amount $</th><th class="n">Price</th><th class="hide-m">Platform</th><th class="hide-m">Holding</th><th class="hide-m">Strategy / funding</th><th class="hide-m">Spot trade</th></tr>';
    tx.forEach(function (d) {
      html += '<tr><td class="nowrap"><a href="#/e/dca/' + d.id + '">' + U.esc(d.date) + '</a></td><td>' + U.esc(assets[d.asset_id] || '') + '</td><td>' + U.esc(d.type) + '</td><td class="n">' + U.num(d.size, 8) + '</td><td class="n">' + U.money(d.amount_usd) + '</td><td class="n">' + U.num(d.price) + '</td>';
      html += '<td class="hide-m">' + U.esc(acc[d.account_id] || '') + '</td><td class="hide-m small">' + U.esc(holds[d.holding_id] || '—') + '</td><td class="hide-m small">' + U.esc(d.strategy || '') + (d.funding_source ? ' · ' + U.esc(d.funding_source) : '') + '</td>';
      html += '<td class="hide-m small">' + (d.trade_id ? '<a href="#/trades/' + d.trade_id + '">' + U.esc(trades[d.trade_id] || '') + '</a>' : '') + '</td></tr>';
    });
    html += '</table></div></div>';
    return { title: 'DCA tracker', html: html };
  }

  function trades(db, q) {
    const status = q.status || 'open';
    const ts = C.loadTrades(db);
    let L = Object.keys(ts).map(function (k) { return ts[k]; });
    if (status === 'open') L = L.filter(function (t) { return t.status === 'Active' || t.status === 'Planned'; });
    else if (status && status !== 'all') L = L.filter(function (t) { return (t.status || '') === status; });
    if (q.signal) L = L.filter(function (t) { return t.signal_source === q.signal; });
    if (q.kind === 'Perp' || q.kind === 'Perp / Futures') L = L.filter(function (t) { return t.kind === 'Perp'; });
    else if (q.kind === 'Spot') L = L.filter(function (t) { return t.kind === 'Spot'; });
    if (q.month) L = L.filter(function (t) {
      return (t.open_date || '').indexOf(q.month) === 0 || t.tranches.some(function (x) { return (x.date || '').indexOf(q.month) === 0; });
    });
    if (q.q) L = L.filter(function (t) { return (t.name || '').toLowerCase().indexOf(q.q.toLowerCase()) >= 0; });
    L.sort(function (a, b) { return (b.open_date || '') < (a.open_date || '') ? -1 : 1; });
    const unfilled = db.rows('tranches').filter(function (x) { return x.trade_id == null; }).sort(function (a, b) {
      if ((a.status || '') !== (b.status || '')) return (a.status || '') < (b.status || '') ? -1 : 1;
      return a.id - b.id;
    });
    const f = { status: status, signal: q.signal || '', kind: q.kind || '', month: q.month || '', q: q.q || '' };
    let html = '<header class="top"><h1>Ichimoku trades</h1><a class="btn sm" href="#/e/trades/new">+ New trade</a><a class="btn sec sm" href="#/calculator">🧮 Calculator</a></header>';
    html += '<div class="tabs">';
    [['open', 'Open & planned'], ['Closed', 'Closed'], ['Canceled', 'Canceled'], ['all', 'All']].forEach(function (tab) {
      html += '<a class="' + (f.status === tab[0] ? 'on' : '') + '" href="#/trades' + U.qs({ status: tab[0], signal: f.signal, kind: f.kind, month: f.month }) + '">' + tab[1] + '</a>';
    });
    html += '</div><form class="filters" data-action="filter-trades"><input type="hidden" name="status" value="' + U.esc(f.status) + '">';
    html += '<select name="signal"><option value="">All signal sources</option>' + M.SIGNAL_SOURCES.map(function (s) { return '<option' + (f.signal === s ? ' selected' : '') + '>' + U.esc(s) + '</option>'; }).join('') + '</select>';
    html += '<select name="kind"><option value="">Perp & Spot</option><option value="Perp"' + (f.kind === 'Perp' || f.kind === 'Perp / Futures' ? ' selected' : '') + '>⚡ Perps</option><option value="Spot"' + (f.kind === 'Spot' ? ' selected' : '') + '>🪙 Spot</option></select>';
    html += '<input type="month" name="month" value="' + U.esc(f.month) + '"><input name="q" value="' + U.esc(f.q) + '" placeholder="Search name"><button class="btn sec sm">Filter</button></form>';
    html += '<div class="card tw"><table><tr><th>Trade</th><th>Signal</th><th class="hide-m">Setup / TF</th><th class="hide-m">Type</th><th>Status</th><th class="hide-m">Open</th><th class="n hide-m">Avg entry</th><th class="n hide-m">Open units</th><th class="n">Realized</th><th class="n">R</th><th class="n hide-m">Unreal.</th></tr>';
    L.forEach(function (t) {
      html += '<tr><td class="tname"><a href="#/trades/' + t.id + '">' + U.esc(t.name || '(blank trade)') + '</a>' + (t.tranches.length ? ' <span class="muted small">' + t.tranches.length + 'T</span>' : '') + '<div class="mbadges">' + kindBadges(t) + '</div></td>';
      html += '<td>' + sigPill(t.signal_source) + '</td><td class="hide-m small">' + U.esc(t.setup || '') + ' ' + U.esc(t.timeframe || '') + '</td>';
      html += '<td class="hide-m">' + kindBadges(t) + '</td><td>' + pill(t.status || '', t.status || '—') + '</td><td class="hide-m nowrap">' + U.esc(t.open_date || '') + '</td>';
      html += '<td class="n hide-m">' + U.num(t.avg_entry) + '</td><td class="n hide-m">' + U.num(t.open_units) + '</td>';
      html += '<td class="n ' + U.clsPnL(t.realized) + '">' + (t.outcome ? U.money(t.realized, 2, true) : '') + '</td><td class="n">' + (t.outcome ? U.rr(t.realized_r) : '') + '</td>';
      html += '<td class="n hide-m ' + U.clsPnL(t.unrealized) + '">' + (t.unrealized ? U.money(t.unrealized, 2, true) : '') + '</td></tr>';
    });
    if (!L.length) html += '<tr><td colspan="11" class="muted">No trades match.</td></tr>';
    html += '</table></div>';
    if ((f.status === 'open' || f.status === 'all') && unfilled.length) {
      html += '<div class="card" style="margin-top:12px"><h2>Tranches without a parent trade (unfilled orders / legacy)</h2><div class="tw"><table><tr><th>Label</th><th>Side</th><th>Status</th><th class="n">Price</th><th class="n">Size</th><th>Suggested parent</th><th></th></tr>';
      unfilled.forEach(function (x) {
        const s = x.suggested_trade_id ? db.get('trades', x.suggested_trade_id) : null;
        html += '<tr><td>' + U.esc(x.title || '(blank)') + '</td><td>' + U.esc(x.side || '') + '</td><td>' + pill(x.status, x.status) + '</td><td class="n">' + U.num(x.price) + '</td><td class="n">' + U.num(x.size) + '</td><td>' + U.esc(s ? s.name : '') + '</td>';
        html += '<td><a href="#/e/tranches/' + x.id + (x.suggested_trade_id ? '?trade_id=' + x.suggested_trade_id : '') + '">link / edit</a></td></tr>';
      });
      html += '</table></div></div>';
    }
    return { title: 'Ichimoku trades', html: html };
  }

  function trade(db, id) {
    const t = C.loadTrades(db)[id];
    if (!t) return { title: 'Trade', html: '<p>Not found. <a href="#/trades">Back</a></p>' };
    const atts = db.rows('attachments').filter(function (a) { return a.owner_type === 'trades' && a.owner_id === t.id; });
    const sz = C.sizing(t.avg_entry || t.entry_price_manual, t.sl_calc, t.risk_usd, t.portfolio_size, null, t.leverage, t.direction || 'Long');
    let html = '<header class="top"><h1>' + U.esc(t.name || '(blank trade)') + '</h1><a class="btn sm" href="#/e/trades/' + t.id + '">Edit</a><a class="btn sec sm" href="#/calculator?trade=' + t.id + '">🧮 Calculator</a></header>';
    html += '<p>' + pill(t.status || '', t.status || 'no status') + ' ' + pill(U.sigClass(t.signal_source), t.signal_source || '') + ' ' + pill('', t.trade_type || 'type?') + ' ' + pill('', t.direction || '') + ' ' + pill('', (t.setup || 'no setup') + ' · ' + (t.timeframe || '')) + ' <span class="muted small">' + U.esc(t.asset || '') + ' · open ' + U.esc(t.open_date || '—') + ((t.close_date || t.close_auto) ? ' · closed ' + U.esc(t.close_date || t.close_auto) : '') + '</span></p>';
    html += '<div class="grid">';
    html += '<div class="card kpi"><div class="l">Avg entry</div><div class="v">' + U.num(t.avg_entry) + '</div><div class="muted small">' + U.num(t.entry_units) + ' units' + (t.dca_units ? ' + ' + U.num(t.dca_units) + ' DCA' : '') + '</div></div>';
    html += '<div class="card kpi"><div class="l">Open units</div><div class="v">' + U.num(t.open_units) + '</div><div class="muted small">price ' + U.num(t.cur_price) + '</div></div>';
    html += '<div class="card kpi"><div class="l">Realized</div><div class="v ' + U.clsPnL(t.realized) + '">' + U.money(t.realized, 2, true) + '</div><div class="muted small">' + U.rr(t.realized_r) + ' · 1R = ' + U.money(t.risk_usd) + '</div></div>';
    html += '<div class="card kpi"><div class="l">Unrealized</div><div class="v ' + U.clsPnL(t.unrealized) + '">' + U.money(t.unrealized, 2, true) + '</div><div class="muted small">' + U.rr(t.unrealized_r) + '</div></div>';
    html += '<div class="card kpi"><div class="l">Stop loss</div><div class="v">' + U.num(t.sl_calc) + '</div><div class="muted small">' + U.esc(t.stop_loss ? 'locked' : (t.sl_mode || 'no SL mode')) + (sz.stop_pct ? ' · ' + U.pct(sz.stop_pct, 2) : '') + '</div></div>';
    html += '<div class="card kpi"><div class="l">Planned size</div><div class="v">' + U.num(sz.units) + '</div><div class="muted small">' + U.money(sz.notional) + (sz.margin ? ' · margin ' + U.money(sz.margin) : '') + '</div></div></div>';
    sz.warn.forEach(function (w) { html += '<p class="warn">⚠ ' + U.esc(w) + '</p>'; });
    html += '<div class="card" style="margin-top:12px"><h2>Tranches</h2><div class="tw"><table><tr><th>Date</th><th>Side</th><th>Status</th><th class="n">Price</th><th class="n">Size</th><th class="n">Fees</th><th class="n">PnL</th><th class="n">R</th><th class="hide-m">Notes</th><th></th></tr>';
    t.tranches.forEach(function (x) {
      html += '<tr><td class="nowrap">' + U.esc(x.date || '—') + '</td><td>' + U.esc(x.side || '—') + '</td><td>' + pill(x.status || '', x.status || '—') + '</td><td class="n">' + U.num(x.price) + '</td><td class="n">' + U.num(x.size) + '</td><td class="n">' + (x.fees ? U.money(x.fees) : '') + '</td>';
      html += '<td class="n ' + U.clsPnL(x.pnl) + '">' + (x.pnl != null ? U.money(x.pnl, 2, true) : '') + (x.realized_pnl_manual != null ? '<span class="muted small"> (override)</span>' : '') + '</td><td class="n">' + (x.r != null ? U.rr(x.r) : '') + '</td>';
      html += '<td class="hide-m small">' + U.esc(x.notes || '') + '</td><td><a href="#/e/tranches/' + x.id + '">edit</a></td></tr>';
    });
    t.dca.forEach(function (d) {
      html += '<tr class="muted"><td>' + U.esc(d.date) + '</td><td>DCA ' + U.esc(d.type) + '</td><td>ledger</td><td class="n">' + U.num(d.price) + '</td><td class="n">' + U.num(d.size) + '</td><td></td><td class="n">' + U.money(d.amount_usd) + '</td><td></td><td class="hide-m small">from DCA tracker</td><td><a href="#/e/dca/' + d.id + '">edit</a></td></tr>';
    });
    html += '</table></div><h3>Add tranche</h3><form class="f" data-action="quick-tranche"><input type="hidden" name="trade_id" value="' + t.id + '">';
    html += '<div><label>Side</label><select name="side">' + ['Entry', 'Add', 'Reduce', 'Exit'].map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select></div>';
    html += '<div><label>Status</label><select name="status"><option>Filled</option><option>Planned</option><option>Unfilled</option><option>Canceled</option></select></div>';
    html += '<div><label>Date</label><input type="date" name="date" value="' + U.today() + '" required></div><div><label>Price</label><input name="price" inputmode="decimal"></div><div><label>Size (units)</label><input name="size" inputmode="decimal"></div><div><label>Fees $</label><input name="fees" inputmode="decimal"></div>';
    html += '<div class="full"><label>Notes</label><input name="notes"></div><div><button class="btn">Add tranche</button></div></form>';
    html += '<p class="muted small">PnL per Exit/Reduce = (price − avg entry) × size × direction − fees (' + (t.trade_type === 'Spot' ? 'Spot: avg entry includes linked DCA buys' : 'Perp: avg of Entry/Add tranches') + '). R = PnL ÷ Risk $.</p></div>';
    html += '<div class="grid2" style="margin-top:12px"><div class="card"><h2>Plan & levels</h2><table>';
    [['portfolio_size', 'Portfolio $'], ['risk_usd', 'Risk $'], ['atr', 'ATR'], ['atr_mult', 'ATR mult'], ['sl_mode', 'SL mode'], ['tenkan', 'Tenkan'], ['kijun', 'Kijun'], ['span_a', 'Span A'], ['span_b', 'Span B'], ['fib0', 'Fib 0'], ['fib1', 'Fib 1'], ['target', 'Target'], ['leverage', 'Leverage'], ['entry_price_manual', 'Entry (manual)']].forEach(function (pair) {
      const v = t[pair[0]];
      html += '<tr><td class="muted">' + pair[1] + '</td><td class="n">' + (v == null ? '—' : (typeof v === 'number' ? U.num(v) : U.esc(v))) + '</td></tr>';
    });
    if (t.legacy_setup_note) html += '<tr><td class="muted">Notion</td><td>' + U.esc(t.legacy_setup_note) + '</td></tr>';
    if (t.signal_ref) html += '<tr><td class="muted">Signal ref</td><td>' + U.esc(t.signal_ref) + '</td></tr>';
    html += '</table></div><div class="card"><h2>Notes & attachments</h2>' + (t.notes ? '<p>' + U.esc(t.notes) + '</p>' : '') + (t.body_md ? '<div class="doc">' + U.renderMd(t.body_md) + '</div>' : '') + thumbs(atts) + attachForm('trades', t.id, '#/trades/' + t.id) + '</div></div>';
    return { title: t.name || 'Trade', html: html };
  }

  function calculator(db, q) {
    let t = null;
    if (q.trade) {
      const row = db.get('trades', q.trade);
      if (row) {
        t = Object.assign({}, row);
        const tm = C.loadTrades(db)[+q.trade];
        t.entry = tm ? tm.avg_entry : t.entry_price_manual;
      }
    }
    const assets = db.rows('assets').slice().sort(function (a, b) { return (a.symbol || '').localeCompare(b.symbol || ''); });
    const prices = {};
    const pr = C.assetPrices(db);
    Object.keys(pr).forEach(function (k) { prices[k] = pr[k].price; });
    const ps = t && t.portfolio_size ? t.portfolio_size : db.setting('default_portfolio', '29000');
    const risk = db.setting('default_risk_pct', '0.3');
    function sel(name, options, cur) {
      return '<select name="' + name + '" id="' + name + '">' + options.map(function (o) {
        const v = o[0], lab = o[1];
        return '<option value="' + U.esc(v) + '"' + (String(cur) === String(v) ? ' selected' : '') + '>' + U.esc(lab) + '</option>';
      }).join('') + '</select>';
    }
    let html = '<header class="top"><h1>🧮 Trade calculator</h1>' + (t ? '<a class="btn sec sm" href="#/trades/' + t.id + '">← ' + U.esc(t.name) + '</a>' : '') + '</header>';
    html += '<p class="muted small">Stop and size from the <a href="#/rules">Stop Loss & Position Sizing Framework</a>: SL = anchor ∓ ATR × buffer; units = Risk $ ÷ |entry − SL|; perp margin = notional ÷ leverage; the stop must trigger before liquidation.</p>';
    html += '<div class="grid2"><div class="card"><form class="f" id="calc" data-action="create-trade-from-calc">';
    html += '<div><label>Asset</label>' + sel('asset_id', [['', '—']].concat(assets.map(function (a) { return [a.id, a.symbol]; })), t ? t.asset_id : (q.asset_id || '')) + '</div>';
    html += '<div><label>Direction</label>' + sel('direction', [['Long', 'Long'], ['Short', 'Short']], t ? t.direction : 'Long') + '</div>';
    html += '<div><label>Type</label>' + sel('trade_type', [['Perp / Futures', 'Perp / Futures'], ['Spot', 'Spot']], t ? t.trade_type : 'Perp / Futures') + '</div>';
    html += '<div><label>Signal source</label><select name="signal_source">' + M.SIGNAL_SOURCES.filter(function (s) { return s !== 'Legacy'; }).map(function (s) {
      const on = (t && t.signal_source === s) || (!t && s === 'Standard Strategy');
      return '<option' + (on ? ' selected' : '') + '>' + U.esc(s) + '</option>';
    }).join('') + '</select></div>';
    const fields = [
      ['entry', 'Entry price', 'entry_price_manual', t && t.entry != null ? t.entry : ''],
      ['mode', null, null, null],
      ['atr', 'ATR', 'atr', t && t.atr != null ? t.atr : ''],
      ['mult', 'ATR mult (buffer)', 'atr_mult', t && t.atr_mult != null ? t.atr_mult : '1'],
      ['tenkan', 'Tenkan-sen', 'tenkan', t && t.tenkan != null ? t.tenkan : ''],
      ['kijun', 'Kijun-sen', 'kijun', t && t.kijun != null ? t.kijun : ''],
      ['spana', 'Senkou Span A', 'span_a', t && t.span_a != null ? t.span_a : ''],
      ['spanb', 'Senkou Span B', 'span_b', t && t.span_b != null ? t.span_b : ''],
      ['fib1', 'Fib 1 (anchor long)', 'fib1', t && t.fib1 != null ? t.fib1 : ''],
      ['fib0', 'Fib 0 (anchor short)', 'fib0', t && t.fib0 != null ? t.fib0 : ''],
      ['manual', 'Manual stop', 'stop_loss', t && t.stop_loss != null ? t.stop_loss : ''],
      ['ps', 'Portfolio size $', 'portfolio_size', ps],
      ['rp', 'Risk %', null, risk],
      ['rusd', 'Risk $ (1R) — overrides %', 'risk_usd', t && t.risk_usd ? t.risk_usd : ''],
      ['lev', 'Leverage x (perp)', 'leverage', t && t.leverage ? t.leverage : '']
    ];
    html += '<div><label>Entry price</label><input name="entry_price_manual" id="entry" inputmode="decimal" value="' + U.esc(t && t.entry != null ? numIn(t.entry) : '') + '"></div>';
    html += '<div><label>SL mode</label><select name="sl_mode" id="mode">' + M.SL_MODES.map(function (m) { return '<option' + (t && t.sl_mode === m ? ' selected' : '') + '>' + U.esc(m) + '</option>'; }).join('') + '</select></div>';
    [['atr', 'ATR', 'atr', t && t.atr], ['mult', 'ATR mult (buffer)', 'atr_mult', t && t.atr_mult != null ? t.atr_mult : 1], ['tenkan', 'Tenkan-sen', 'tenkan', t && t.tenkan], ['kijun', 'Kijun-sen', 'kijun', t && t.kijun], ['spana', 'Senkou Span A', 'span_a', t && t.span_a], ['spanb', 'Senkou Span B', 'span_b', t && t.span_b], ['fib1', 'Fib 1 (anchor long)', 'fib1', t && t.fib1], ['fib0', 'Fib 0 (anchor short)', 'fib0', t && t.fib0], ['manual', 'Manual stop', 'stop_loss', t && t.stop_loss]].forEach(function (f) {
      html += '<div><label>' + f[1] + '</label><input name="' + f[2] + '" id="' + f[0] + '" inputmode="decimal" value="' + U.esc(f[3] != null ? numIn(f[3]) : '') + '"></div>';
    });
    html += '<div><label>Portfolio size $</label><input name="portfolio_size" id="ps" inputmode="decimal" value="' + U.esc(numIn(ps)) + '"></div>';
    html += '<div><label>Risk %</label><input id="rp" inputmode="decimal" value="' + U.esc(risk) + '"></div>';
    html += '<div><label>Risk $ (1R) — overrides %</label><input name="risk_usd" id="rusd" inputmode="decimal" value="' + U.esc(t && t.risk_usd ? numIn(t.risk_usd) : '') + '"></div>';
    html += '<div><label>Leverage x (perp)</label><input name="leverage" id="lev" inputmode="decimal" value="' + U.esc(t && t.leverage ? numIn(t.leverage) : '') + '"></div>';
    html += '<div class="full"><button class="btn" type="submit">Create trade with these values →</button> <span class="muted small">opens the new-trade form pre-filled (Standard Strategy by default)</span></div></form></div>';
    html += '<div class="card" id="out"><h2>Result</h2><div class="grid">';
    html += '<div class="kpi"><div class="l">Stop loss</div><div class="v" id="o_sl">—</div><div class="muted small" id="o_anchor"></div></div>';
    html += '<div class="kpi"><div class="l">Stop distance</div><div class="v" id="o_sd">—</div><div class="muted small" id="o_sp"></div></div>';
    html += '<div class="kpi"><div class="l">Risk (1R)</div><div class="v" id="o_r">—</div></div>';
    html += '<div class="kpi"><div class="l">Position size</div><div class="v" id="o_u">—</div><div class="muted small">units</div></div>';
    html += '<div class="kpi"><div class="l">Notional</div><div class="v" id="o_n">—</div></div>';
    html += '<div class="kpi"><div class="l">Margin (perp)</div><div class="v" id="o_m">—</div><div class="muted small" id="o_liq"></div></div></div>';
    html += '<div id="o_warn" class="warn" style="margin-top:10px"></div><p class="muted small">Targets in R: <span id="o_t"></span></p></div></div>';
    html += '<script type="application/json" id="calc-prices">' + JSON.stringify(prices).replace(/</g, '\\u003c') + '</script>';
    return { title: 'Trade calculator', html: html, bind: 'calc' };
  }

  function bots(db) {
    const B = C.loadBots(db);
    const total = B.filter(function (b) { return b.status === 'Active'; }).reduce(function (s, b) { return s + b.value; }, 0);
    let html = '<header class="top"><h1>🤖 Pionex bots <span class="muted">' + U.money(total, 2) + '</span></h1><a class="btn sm" href="#/e/bots/new">+ Bot</a><a class="btn sec sm" href="#/e/bot_events/new">+ Bot tranche / balance</a></header>';
    html += '<p class="muted small">Bot value in the portfolio = latest <b>Balance update</b> event (else invested capital). Log a Balance update from Pionex whenever you check the bot.</p>';
    html += '<div class="card tw"><table><tr><th>Bot</th><th>Status</th><th class="hide-m">Direction</th><th class="hide-m">Grid</th><th class="n">Capital</th><th class="n">Value</th><th class="hide-m">Value basis</th><th class="n">PnL</th></tr>';
    B.forEach(function (b) {
      html += '<tr><td><a href="#/bots/' + b.id + '">' + U.esc(b.name) + '</a> <span class="muted small">' + U.esc(b.asset || '') + '</span></td><td>' + pill(b.status, b.status) + '</td><td class="hide-m">' + U.esc(b.direction || '') + '</td>';
      html += '<td class="hide-m small">' + U.num(b.grid_lower) + '–' + U.num(b.grid_upper) + ' · ' + U.esc(b.grid_levels || '') + '</td><td class="n">' + U.money(b.capital) + '</td><td class="n">' + U.money(b.value) + '</td><td class="hide-m small muted">' + U.esc(b.value_basis) + '</td><td class="n ' + U.clsPnL(b.pnl) + '">' + U.money(b.pnl, 2, true) + '</td></tr>';
    });
    html += '</table></div>';
    return { title: 'Pionex bots', html: html };
  }
  function bot(db, id) {
    const b = C.loadBots(db).find(function (x) { return x.id === +id; });
    if (!b) return { title: 'Bot', html: '<p>Not found.</p>' };
    const pr = C.assetPrices(db)[b.asset_id] || {};
    let html = '<header class="top"><h1>🤖 ' + U.esc(b.name) + '</h1><a class="btn sm" href="#/e/bots/' + b.id + '">Edit</a><a class="btn sec sm" href="#/e/bot_events/new?bot_id=' + b.id + '&kind=Balance%20update">+ Balance update</a><a class="btn sec sm" href="#/e/bot_events/new?bot_id=' + b.id + '&kind=Entry">+ Tranche</a></header>';
    html += '<div class="grid"><div class="card kpi"><div class="l">Value</div><div class="v">' + U.money(b.value) + '</div><div class="muted small">' + U.esc(b.value_basis) + '</div></div>';
    html += '<div class="card kpi"><div class="l">Capital</div><div class="v">' + U.money(b.capital) + '</div></div>';
    html += '<div class="card kpi"><div class="l">PnL</div><div class="v ' + U.clsPnL(b.pnl) + '">' + U.money(b.pnl, 2, true) + '</div></div>';
    html += '<div class="card kpi"><div class="l">Price now</div><div class="v">' + U.num(pr.price) + '</div><div class="muted small">' + U.esc(b.asset || '') + ' · ' + U.esc(pr.source || '') + '</div></div>';
    html += '<div class="card kpi"><div class="l">Grid</div><div class="v small">' + U.num(b.grid_lower) + ' – ' + U.num(b.grid_upper) + '</div><div class="muted small">' + U.esc(b.grid_levels || '?') + ' levels · step ' + (b.grid_step ? U.pct(b.grid_step, 2) : '—') + '</div></div>';
    html += '<div class="card kpi"><div class="l">TP / Liq.</div><div class="v small">' + U.num(b.tp_price) + ' / ' + U.num(b.liq_price) + '</div></div></div>';
    if (pr.price && b.grid_lower && b.grid_upper && (pr.price < b.grid_lower || pr.price > b.grid_upper)) html += '<p class="warn">⚠ Price is outside the grid range.</p>';
    html += '<div class="card" style="margin-top:12px"><h2>Tranches & events</h2><div class="tw"><table><tr><th>Date</th><th>Kind</th><th>#</th><th class="n">Price</th><th class="n">Investment</th><th class="n">Extra margin</th><th class="n">Value $</th><th class="n">Fees</th><th class="hide-m">Notes</th><th></th></tr>';
    b.events.forEach(function (e) {
      html += '<tr><td>' + U.esc(e.date) + '</td><td>' + U.esc(e.kind) + '</td><td>' + U.esc(e.tranche_no || '') + '</td><td class="n">' + U.num(e.price) + '</td><td class="n">' + (e.investment ? U.money(e.investment) : '') + '</td><td class="n">' + (e.extra_margin ? U.money(e.extra_margin) : '') + '</td><td class="n">' + (e.value_usd != null ? U.money(e.value_usd) : '') + '</td>';
      html += '<td class="n small">' + (e.fees_paid ? U.money(e.fees_paid) : '') + (e.fees_collected ? ' +' + U.money(e.fees_collected) : '') + '</td><td class="hide-m small">' + U.esc(e.title || '') + ' ' + U.esc(e.notes || '') + '</td><td><a href="#/e/bot_events/' + e.id + '">edit</a></td></tr>';
    });
    html += '</table></div></div>' + (b.notes ? '<div class="card" style="margin-top:12px"><p>' + U.esc(b.notes) + '</p></div>' : '');
    return { title: b.name, html: html };
  }

  function lps(db) {
    const Ls = C.loadLps(db);
    let html = '<header class="top"><h1>💧 AMM LPs</h1><a class="btn sm" href="#/e/lps/new">+ LP</a><a class="btn sec sm" href="#/e/lp_fees/new">+ Fee event</a></header>';
    html += '<p class="muted small">Active LPs count in the portfolio at <b>current value</b> (else capital). Fee events feed the BTC protocol when linked to a snapshot.</p>';
    html += '<div class="card tw"><table><tr><th>LP</th><th>Pair</th><th>Status</th><th class="hide-m">Platform</th><th class="hide-m">Opened</th><th class="n">Capital</th><th class="n">Value</th><th class="n">Fees (gross)</th><th class="n">Return</th><th class="n hide-m">Days</th></tr>';
    Ls.forEach(function (l) {
      html += '<tr><td><a href="#/lps/' + l.id + '">' + U.esc(l.lp_id) + '</a></td><td>' + U.esc(l.asset1) + '/' + U.esc(l.asset2) + '</td><td>' + pill(l.status, l.status) + '</td><td class="hide-m small">' + U.esc(l.platform) + ' · ' + U.esc(l.chain) + '</td><td class="hide-m">' + U.esc(l.opened) + '</td>';
      html += '<td class="n">' + U.money(l.capital) + '</td><td class="n">' + U.money(l.value) + '</td><td class="n">' + U.money(l.gross) + '</td><td class="n ' + U.clsPnL(l.total_return) + '">' + (l.total_return != null ? U.money(l.total_return, 2, true) : '—') + (l.total_return_pct != null ? '<div class="muted small">' + U.pct(l.total_return_pct) + '</div>' : '') + '</td><td class="n hide-m">' + (l.days == null ? '' : l.days) + '</td></tr>';
    });
    html += '</table></div>';
    return { title: 'AMM LPs', html: html };
  }
  function lp(db, id) {
    const l = C.loadLps(db).find(function (x) { return x.id === +id; });
    if (!l) return { title: 'LP', html: '<p>Not found.</p>' };
    const feeIds = {}; l.fees.forEach(function (e) { feeIds[e.id] = 1; });
    const atts = db.rows('attachments').filter(function (a) {
      return (a.owner_type === 'lps' && a.owner_id === l.id) || (a.owner_type === 'lp_fees' && feeIds[a.owner_id]);
    });
    let html = '<header class="top"><h1>💧 LP ' + U.esc(l.lp_id) + ' — ' + U.esc(l.asset1) + '/' + U.esc(l.asset2) + '</h1><a class="btn sm" href="#/e/lps/' + l.id + '">Edit</a><a class="btn sec sm" href="#/e/lp_fees/new?lp_ref=' + l.id + '">+ Fee event</a></header>';
    html += '<p>' + pill(l.status, l.status) + ' <span class="muted small">' + U.esc(l.platform) + ' · ' + U.esc(l.chain) + ' · ' + U.esc(l.opened) + ' → ' + U.esc(l.closed || 'open') + ' · ' + (l.days == null ? '?' : l.days) + ' days</span>' + (l.creation_url ? ' · <a href="' + U.esc(l.creation_url) + '" target="_blank" rel="noopener">tx</a>' : '') + '</p>';
    html += '<div class="grid"><div class="card kpi"><div class="l">Capital</div><div class="v">' + U.money(l.capital) + '</div></div>';
    html += '<div class="card kpi"><div class="l">' + (l.status === 'Closed' ? 'Closing value' : 'Current value') + '</div><div class="v">' + U.money(l.status === 'Closed' ? l.closing_effective : l.value) + '</div></div>';
    html += '<div class="card kpi"><div class="l">Fees gross / net</div><div class="v">' + U.money(l.gross) + '</div><div class="muted small">net ' + U.money(l.net) + ' (network ' + U.money(l.network) + ')</div></div>';
    html += '<div class="card kpi"><div class="l">Total return</div><div class="v ' + U.clsPnL(l.total_return) + '">' + (l.total_return != null ? U.money(l.total_return, 2, true) : '—') + '</div><div class="muted small">' + (l.total_return_pct != null ? U.pct(l.total_return_pct) : '') + '</div></div>';
    html += '<div class="card kpi"><div class="l">Range</div><div class="v small">' + U.num(l.range_min) + ' – ' + U.num(l.range_max) + '</div><div class="muted small">APR ' + (l.apr ? U.pct(l.apr * 100) : '—') + '</div></div></div>';
    html += '<div class="card" style="margin-top:12px"><h2>Fee events</h2><div class="tw"><table><tr><th>Date</th><th class="n">Gross</th><th class="n">Network fee</th><th class="n">Value at close</th><th>Role</th><th class="hide-m">BTC/Debt split</th><th></th></tr>';
    l.fees.forEach(function (e) {
      html += '<tr><td>' + U.esc(e.date) + '</td><td class="n">' + U.money(e.gross) + '</td><td class="n">' + U.money(e.network_fee) + '</td><td class="n">' + (e.value_at_close ? U.money(e.value_at_close) : '') + '</td><td>' + U.esc(e.role || '') + '</td><td class="hide-m small">' + U.esc(e.btc_pct || '') + ' / ' + U.esc(e.debt_pct || '') + '</td><td><a href="#/e/lp_fees/' + e.id + '">edit</a></td></tr>';
    });
    html += '</table></div></div>' + (l.notes ? '<div class="card" style="margin-top:12px"><p>' + U.esc(l.notes) + '</p></div>' : '');
    html += '<div class="card" style="margin-top:12px"><h2>Attachments</h2>' + thumbs(atts) + attachForm('lps', l.id, '#/lps/' + l.id) + '</div>';
    return { title: 'LP ' + l.lp_id, html: html };
  }

  function btc(db) {
    const pr = C.assetPrices(db);
    const bp = (pr[C.btcAssetId(db)] || {}).price;
    const pack = C.loadBtc(db, bp);
    const rules = db.rows('reports').find(function (r) { return r.kind === 'doc' && r.period === 'btc_rules'; });
    const snapsById = {}; pack.snaps.forEach(function (s) { snapsById[s.id] = s; });
    const dca = db.rows('dca').filter(function (d) { return d.btc_snapshot_id; }).sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
    const fees = db.rows('lp_fees').filter(function (f) { return f.btc_snapshot_id; }).sort(function (a, b) { return (a.date || '') < (b.date || '') ? -1 : 1; });
    const live = pack.live;
    let html = '<header class="top"><h1>₿ BTC Accumulation Protocol</h1><a class="btn sm" href="#/e/btc_snapshots/new">+ Monthly snapshot</a></header>';
    if (live) {
      html += '<div class="grid"><div class="card kpi"><div class="l">Net strategy value (live)</div><div class="v">' + U.money(live.nsv) + '</div><div class="muted small">' + U.num(live.nsv_btc, 6) + ' BTC @ ' + U.money(bp, 0) + '</div></div>';
      html += '<div class="card kpi"><div class="l">LTV</div><div class="v ' + (live.risk_status === 'Safe' ? 'pos' : live.risk_status === 'Caution' ? 'warn' : 'neg') + '">' + U.pct(live.ltv, 2) + '</div><div class="muted small">' + U.esc(live.risk_status) + ' · borrow ' + (live.borrow_ok ? 'OK' : 'not allowed') + '</div></div>';
      html += '<div class="card kpi"><div class="l">BTC held</div><div class="v">' + U.num(live.total_btc, 8) + '</div><div class="muted small">collateral ' + U.num(live.btc_collateral, 8) + ' · long-term ' + (live.longterm_btc ? U.num(live.longterm_btc, 8) : '0') + '</div></div>';
      html += '<div class="card kpi"><div class="l">Debt / reserve</div><div class="v small">' + U.money(live.debt) + ' / ' + U.money(live.reserve) + '</div><div class="muted small">phase ' + U.esc(live.phase || '—') + ' (latest snapshot ' + U.esc(live.month) + ')</div></div></div>';
      html += '<p class="muted small">Portfolio line “BTC Accumulation Protocol” = latest snapshot quantities × live BTC price: NSV = collateral + long-term BTC value + reserve − debt.</p>';
    }
    html += '<div class="card" style="margin-top:12px"><h2>Monthly snapshots</h2><div class="tw"><table><tr><th>Month</th><th>Phase</th><th class="n">BTC price</th><th class="n">Collateral BTC</th><th class="n">Long-term</th><th class="n">Debt</th><th class="n">Reserve</th><th class="n">LTV</th><th class="n">NSV</th><th class="n">USD perf.</th><th class="n hide-m">Costs</th><th></th></tr>';
    pack.snaps.slice().reverse().forEach(function (s) {
      html += '<tr><td>' + U.esc(s.month) + '</td><td>' + U.esc(s.phase || '') + '</td><td class="n">' + U.money(s.btc_price, 0) + '</td><td class="n">' + U.num(s.btc_collateral, 8) + '</td><td class="n">' + (s.longterm_btc ? U.num(s.longterm_btc, 8) : '—') + '</td><td class="n">' + U.money(s.debt) + '</td><td class="n">' + U.money(s.reserve) + '</td>';
      html += '<td class="n">' + (s.ltv != null ? U.pct(s.ltv, 2) : '') + '</td><td class="n"><b>' + U.money(s.nsv) + '</b></td><td class="n">' + (s.usd_perf != null ? U.money(s.usd_perf, 2, true) : '') + '</td><td class="n hide-m">' + U.money(s.total_costs) + '</td><td><a href="#/e/btc_snapshots/' + s.id + '">edit</a></td></tr>';
      if (s.lt_alloc_mismatch) html += '<tr><td></td><td colspan="11" class="warn small">⚠ Allocation lists long-term BTC but the long-term BTC quantity is blank.</td></tr>';
    });
    html += '</table></div></div><div class="grid2" style="margin-top:12px"><div class="card"><h2>Protocol DCA buys</h2><div class="tw"><table><tr><th>Date</th><th>Snapshot</th><th class="n">Size</th><th class="n">$</th><th>Funding</th></tr>';
    dca.forEach(function (d) {
      const s = snapsById[d.btc_snapshot_id];
      html += '<tr><td><a href="#/e/dca/' + d.id + '">' + U.esc(d.date) + '</a></td><td>' + U.esc(s ? s.month : '') + '</td><td class="n">' + U.num(d.size, 8) + '</td><td class="n">' + U.money(d.amount_usd) + '</td><td class="small">' + U.esc(d.funding_source || '') + '</td></tr>';
    });
    html += '</table></div></div><div class="card"><h2>LP fees routed</h2><div class="tw"><table><tr><th>Date</th><th>LP</th><th class="n">Gross</th><th>Role</th></tr>';
    fees.forEach(function (e) {
      const lp = e.lp_ref ? db.get('lps', e.lp_ref) : null;
      html += '<tr><td>' + U.esc(e.date) + '</td><td>' + U.esc(lp ? lp.lp_id : '') + '</td><td class="n">' + U.money(e.gross) + '</td><td>' + U.esc(e.role || '') + '</td></tr>';
    });
    html += '</table></div></div></div>';
    if (rules) html += '<div class="card doc" style="margin-top:12px"><h2>Protocol rules</h2>' + U.renderMd(rules.body_md) + '</div>';
    return { title: 'BTC Accumulation Protocol', html: html };
  }

  function reportBody(r, opts) {
    opts = opts || {};
    const k = r.core;
    const pf = k.pf == null ? (k.gp ? '∞' : '—') : Number(k.pf).toFixed(2);
    let html = '<header class="top"><h1>' + (r.kind === 'monthly' ? 'Monthly' : 'Weekly') + ' report ' + U.esc(r.period) + '</h1>';
    if (!opts.frozen) html += '<form data-action="freeze-report"><input type="hidden" name="kind" value="' + U.esc(r.kind) + '"><input type="hidden" name="period" value="' + U.esc(r.period) + '"><button class="btn sec sm">❄ Freeze copy</button></form>';
    if (opts.arch) html += '<a class="btn sec sm" href="#/reports/view/' + opts.arch.id + '">Notion version</a>';
    html += '</header><p class="muted small">' + U.esc(r.start) + ' → ' + U.esc(r.end) + ' · generated ' + U.esc(String(r.generated || '').slice(0, 16).replace('T', ' ')) + (opts.frozen ? ' · <b>frozen copy</b>' : '') + '</p>';
    html += '<div class="grid"><div class="card kpi"><div class="l">Realized PnL</div><div class="v ' + U.clsPnL(k.pnl) + '">' + U.money(k.pnl, 2, true) + '</div><div class="muted small">' + U.rr(k.r) + '</div></div>';
    html += '<div class="card kpi"><div class="l">Win rate</div><div class="v">' + U.pct(k.wr) + '</div><div class="muted small">' + k.wins + 'W / ' + k.losses + 'L · ' + k.parents + ' trades, ' + k.tranches + ' tranches</div></div>';
    html += '<div class="card kpi"><div class="l">Profit factor</div><div class="v">' + pf + '</div><div class="muted small">+' + U.money(k.gp) + ' / ' + U.money(k.gl) + '</div></div>';
    html += '<div class="card kpi"><div class="l">DCA PnL</div><div class="v ' + U.clsPnL(r.dca.tot.pnl) + '">' + U.money(r.dca.tot.pnl, 2, true) + '</div><div class="muted small">cost ' + U.money(r.dca.tot.cost) + ' → ' + U.money(r.dca.tot.value) + '</div></div>';
    html += '<div class="card kpi"><div class="l">Portfolio total</div><div class="v">' + U.money(r.portfolio.total) + '</div><div class="muted small">' + U.esc(r.portfolio.basis) + '</div></div>';
    html += '<div class="card kpi"><div class="l">Trades opened</div><div class="v">' + r.activity.n + '</div><div class="muted small">' + r.activity.by.map(function (a) { return U.esc(a[0]) + ' ' + U.esc(a[1]) + ': ' + a[2]; }).join(', ') + '</div></div></div>';
    html += '<div class="card" style="margin-top:12px"><h2>Realized PnL by parent trade</h2><div class="tw"><table><tr><th>Trade</th><th class="hide-m">Signal</th><th class="hide-m">Setup</th><th class="n">Tranches</th><th class="n">PnL</th><th class="n">R</th><th class="hide-m">Last exit</th></tr>';
    k.rows.forEach(function (row) {
      html += '<tr><td><a href="#/trades/' + row.trade_id + '">' + U.esc(row.name) + '</a></td><td class="hide-m small">' + U.esc(row.signal) + '</td><td class="hide-m small">' + U.esc(row.setup || '') + '</td><td class="n">' + row.n + '</td><td class="n ' + U.clsPnL(row.pnl) + '">' + U.money(row.pnl, 2, true) + '</td><td class="n">' + U.rr(row.r) + '</td><td class="hide-m">' + U.esc(row.last) + '</td></tr>';
    });
    if (!k.rows.length) html += '<tr><td colspan="7" class="muted">No closing tranches in this period.</td></tr>';
    if (k.rows.length) html += '<tr class="tot"><td>Total</td><td class="hide-m"></td><td class="hide-m"></td><td class="n">' + k.tranches + '</td><td class="n">' + U.money(k.pnl, 2, true) + '</td><td class="n">' + U.rr(k.r) + '</td><td class="hide-m"></td></tr>';
    html += '</table></div></div>';
    if (k.excluded && k.excluded.length) {
      html += '<div class="card" style="margin-top:12px"><h2 class="neg">Excluded — suspect data (' + k.excluded.length + ')</h2><p class="small muted">These closing tranches compute to implausible PnL. They are not in the totals above.</p><ul class="small">';
      k.excluded.forEach(function (x) { html += '<li>' + U.esc(x.date) + ' <a href="#/e/tranches/' + x.tranche_id + '">' + U.esc(x.name) + '</a> — ' + U.esc(x.reason) + ' (computed ' + U.money(x.pnl, 2, true) + ')</li>'; });
      html += '</ul></div>';
    }
    if (k.rows.length) {
      html += '<div class="grid2" style="margin-top:12px">';
      [['By signal source', k.by_signal], ['By setup', k.by_setup]].forEach(function (pair) {
        html += '<div class="card"><h2>' + pair[0] + '</h2><table><tr><th></th><th class="n">Trades</th><th class="n">WR</th><th class="n">PnL</th><th class="n">R</th></tr>';
        pair[1].forEach(function (x) { html += '<tr><td>' + U.esc(x.k) + '</td><td class="n">' + x.n + '</td><td class="n">' + U.pct(x.n ? x.w / x.n * 100 : null) + '</td><td class="n">' + U.money(x.pnl, 2, true) + '</td><td class="n">' + U.rr(x.r) + '</td></tr>'; });
        html += '</table></div>';
      });
      html += '</div>';
    }
    const botVal = (r.bots.active || []).reduce(function (s, b) { return s + (b.value || 0); }, 0);
    html += '<div class="grid2" style="margin-top:12px"><div class="card"><h2>Portfolio by category</h2>' + catBars(r.portfolio.cats) + '</div>';
    html += '<div class="card"><h2>DCA by asset <span class="muted small">(' + U.esc(r.dca.basis) + ')</span></h2><p class="muted small">' + r.dca.period_n + ' DCA transactions this period, ' + U.money(r.dca.period_amt) + ' invested.</p><div class="tw"><table><tr><th>Asset</th><th class="n">Cost</th><th class="n">Value</th><th class="n">PnL</th></tr>';
    (r.dca.rows || []).forEach(function (d) { html += '<tr><td>' + U.esc(d.symbol) + '</td><td class="n">' + U.money(d.cost) + '</td><td class="n">' + U.money(d.value) + '</td><td class="n">' + U.money(d.pnl, 2, true) + '</td></tr>'; });
    html += '</table></div></div></div><div class="grid2" style="margin-top:12px"><div class="card"><h2>Bots</h2><p class="small">Active value ' + U.money(botVal) + ' · ' + (r.bots.events || []).length + ' events this period</p><ul class="small">';
    (r.bots.events || []).forEach(function (e) { html += '<li>' + U.esc(e.date) + ' ' + U.esc(e.bot) + ' — ' + U.esc(e.kind) + ' ' + (e.value_usd != null ? U.money(e.value_usd) : (e.investment ? U.money(e.investment) : '')) + '</li>'; });
    html += '</ul></div><div class="card"><h2>LPs</h2><p class="small">Fees gross ' + U.money(r.lps.gross) + ' · network ' + U.money(r.lps.network) + ' · opened ' + r.lps.opened.length + ' · closed ' + r.lps.closed.length + '</p>';
    (r.btc || []).forEach(function (s) { html += '<h3>BTC protocol ' + U.esc(s.month) + '</h3><p class="small">NSV <b>' + U.money(s.nsv) + '</b> · LTV ' + U.pct(s.ltv, 2) + ' · ' + U.esc(s.risk_status) + ' · USD perf ' + (s.usd_perf != null ? U.money(s.usd_perf, 2, true) : '—') + '</p>'; });
    html += '</div></div>';
    if (r.cumulative && r.cumulative.length) {
      html += '<div class="card" style="margin-top:12px"><h2>Month by month (realized)</h2><div class="tw"><table><tr><th>Month</th><th class="n">PnL</th><th class="n">R</th><th class="n">WR</th><th class="n">PF</th><th class="n">Cumulative</th></tr>';
      r.cumulative.forEach(function (m) {
        html += '<tr><td><a href="#/reports/monthly/' + U.esc(m.month) + '">' + U.esc(m.month) + '</a></td><td class="n">' + U.money(m.pnl, 2, true) + '</td><td class="n">' + U.rr(m.r) + '</td><td class="n">' + U.pct(m.wr) + '</td><td class="n">' + (m.pf != null ? Number(m.pf).toFixed(2) : '—') + '</td><td class="n">' + U.money(m.cum, 2, true) + '</td></tr>';
      });
      html += '</table></div></div>';
    }
    return html;
  }

  function reports(db) {
    const months = C.periods(db, 'monthly');
    const weeks = C.periods(db, 'weekly').slice(0, 30);
    const arch = db.rows('reports').filter(function (r) { return r.kind === 'notion_archive'; }).sort(function (a, b) { return (b.period || '') < (a.period || '') ? -1 : 1; });
    const frozen = db.rows('reports').filter(function (r) { return r.kind === 'monthly' || r.kind === 'weekly'; }).sort(function (a, b) { return (b.generated_at || '') < (a.generated_at || '') ? -1 : 1; });
    let html = '<header class="top"><h1>📊 Reports</h1></header><p class="muted small">Reports are generated from your data (tranche-level realized PnL, R, profit factor and win rate by parent trade; DCA PnL; portfolio total from the stored month-end snapshot). Freeze stores a copy.</p>';
    html += '<div class="grid2"><div class="card"><h2>Monthly</h2><div class="chips">' + months.map(function (m) { return '<a class="chip" href="#/reports/monthly/' + m + '">' + m + '</a>'; }).join('') + '</div></div>';
    html += '<div class="card"><h2>Weekly</h2><div class="chips">' + weeks.map(function (w) { return '<a class="chip" href="#/reports/weekly/' + w + '">' + w + '</a>'; }).join('') + '</div></div></div>';
    html += '<div class="grid2" style="margin-top:12px"><div class="card"><h2>Notion archive (imported)</h2><ul>' + arch.map(function (a) { return '<li><a href="#/reports/view/' + a.id + '">' + U.esc(a.title) + '</a> <span class="muted small">' + U.esc(a.period) + '</span></li>'; }).join('') + '</ul></div>';
    html += '<div class="card"><h2>Frozen copies</h2><ul>' + (frozen.length ? frozen.map(function (f) { return '<li><a href="#/reports/view/' + f.id + '">' + U.esc(f.title) + '</a> <span class="muted small">' + U.esc(String(f.generated_at || '').slice(0, 16).replace('T', ' ')) + '</span></li>'; }).join('') : '<li class="muted">None yet.</li>') + '</ul></div></div>';
    return { title: 'Reports', html: html };
  }
  function report(db, kind, period) {
    const r = C.buildReport(db, kind, period);
    const arch = kind === 'monthly' ? db.rows('reports').find(function (x) { return x.kind === 'notion_archive' && x.period === period; }) : null;
    return { title: kind + ' report ' + period, html: reportBody(r, { arch: arch }) };
  }
  function reportView(db, id) {
    const x = db.get('reports', id);
    if (!x) return { title: 'Report', html: '<p>Not found.</p>' };
    if (x.data_json) {
      const r = JSON.parse(x.data_json);
      return { title: x.title, html: reportBody(r, { frozen: x }) };
    }
    const atts = db.rows('attachments').filter(function (a) { return a.owner_type === 'reports' && a.owner_id === x.id; });
    let html = '<header class="top"><h1>' + U.esc(x.title) + '</h1></header>';
    if (x.source) html += '<p class="muted small">Source: ' + U.esc(x.source) + (x.period ? ' · ' + U.esc(x.period) : '') + '</p>';
    html += '<div class="card doc">' + U.renderMd(x.body_md || '') + '</div>';
    if (atts.length) html += '<div class="card" style="margin-top:12px"><h2>Attachments</h2>' + thumbs(atts) + '</div>';
    return { title: x.title, html: html };
  }
  function rules(db) {
    const docs = db.rows('reports').filter(function (r) { return r.kind === 'doc'; }).sort(function (a, b) { return a.id - b.id; });
    let html = '<header class="top"><h1>📘 Rules & docs</h1></header><div class="chips" style="margin-bottom:12px">' + docs.map(function (d) { return '<a class="chip" href="#/rules#' + U.esc(d.period) + '">' + U.esc(d.title) + '</a>'; }).join('') + '</div>';
    docs.forEach(function (d, i) {
      html += '<details class="card doc" id="' + U.esc(d.period) + '" style="margin-bottom:12px"' + (i === 0 ? ' open' : '') + '><summary><b>' + U.esc(d.title) + '</b></summary>' + U.renderMd(d.body_md || '') + '</details>';
    });
    return { title: 'Rules & docs', html: html };
  }
  function issues(db, q) {
    const resolved = q.resolved === '1';
    const liveAll = g.PTIssues.live(db);
    const notesAll = g.PTIssues.importNotes(db, resolved);
    const live = liveAll.filter(function (i) { return i.severity !== 'ignored'; });
    const notes = notesAll.filter(function (i) { return i.severity !== 'ignored'; });
    const ign = liveAll.concat(notesAll).filter(function (i) { return i.severity === 'ignored'; });
    let html = '<header class="top"><h1>⚠ Issues</h1><a class="btn sec sm" href="#/reconciliation">Reconciliation vs Notion</a><a class="btn sec sm" href="#/issues?resolved=' + (resolved ? '0' : '1') + '">' + (resolved ? 'Hide' : 'Show') + ' resolved</a></header>';
    html += '<p class="muted small">Live checks recompute every visit. Import notes can be marked resolved. Trades opened before September 2026 stay in history and are listed as ignored.</p>';
    html += '<div class="card" style="margin-bottom:12px"><h2>Live checks (' + live.length + ')</h2><div class="tw"><table><tr><th>Severity</th><th>Area</th><th>Issue</th><th></th></tr>';
    if (!live.length) html += '<tr><td colspan="4" class="muted">All clear.</td></tr>';
    live.forEach(function (i) {
      html += '<tr><td>' + pill('sev-' + i.severity, i.severity) + '</td><td class="small">' + U.esc(i.area) + '</td><td>' + U.esc(i.message) + '</td><td>' + (i.link ? '<a href="' + i.link + '">fix →</a>' : '') + '</td></tr>';
    });
    html += '</table></div></div><div class="card"><h2>Import notes (' + notes.length + ')</h2><div class="tw"><table><tr><th>Severity</th><th>Entity</th><th>Code</th><th>Note</th><th></th><th></th></tr>';
    notes.forEach(function (n) {
      html += '<tr class="' + (n.resolved ? 'muted' : '') + '"><td>' + pill('sev-' + n.severity, n.severity) + '</td><td class="small">' + U.esc(n.entity) + '</td><td class="small">' + U.esc(n.code) + '</td><td>' + U.esc(n.message) + '</td><td>' + (n.link ? '<a href="' + n.link + '">open</a>' : '') + '</td>';
      html += '<td><form data-action="resolve-note"><input type="hidden" name="id" value="' + n.id + '"><button class="btn sec sm">' + (n.resolved ? 'Reopen' : 'Resolve') + '</button></form></td></tr>';
    });
    html += '</table></div></div><details class="card" style="margin-top:12px"><summary><b>Ignored (pre-Sep legacy) — ' + ign.length + '</b> <span class="muted small">trades opened before 2026-09-01 belong to the old system</span></summary><div class="tw"><table><tr><th>Was</th><th>Area</th><th>Issue</th><th>Why ignored</th><th></th></tr>';
    ign.forEach(function (i) {
      html += '<tr class="muted"><td>' + pill('', i.orig_severity || '') + '</td><td class="small">' + U.esc(i.area || i.entity) + '</td><td class="small">' + U.esc(i.message) + '</td><td class="small">' + U.esc(i.ignored_reason) + '</td><td>' + (i.link ? '<a href="' + i.link + '">open</a>' : '') + '</td></tr>';
    });
    html += '</table></div></details>';
    return { title: 'Issues', html: html };
  }
  function reconciliation(db) {
    const md = g.PTReconcile.run(db);
    return { title: 'Reconciliation vs Notion', html: '<header class="top"><h1>Reconciliation vs Notion</h1></header><p class="muted small">Source: computed in the browser</p><div class="card doc">' + U.renderMd(md) + '</div>' };
  }
  function exportPage() {
    let html = '<header class="top"><h1>💾 Backup & export</h1></header><div class="grid">';
    html += '<a class="card kpi" href="#" data-action-click="export-json"><div class="l">Full backup</div><div class="v">JSON</div><div class="muted small">all tables, decrypted, downloaded only to this device</div></a>';
    html += '<a class="card kpi" href="#" data-action-click="export-csv"><div class="l">Spreadsheet</div><div class="v">CSV (zip)</div><div class="muted small">one CSV per table</div></a>';
    html += '<a class="card kpi" href="#/settings"><div class="l">Live copy</div><div class="v">Encrypted</div><div class="muted small">data/portfolio.enc in the GitHub repo is the synced database</div></a></div>';
    html += '<p class="muted small" style="margin-top:12px">Downloads stay on this device. Nothing in the export is committed unless you sync, and sync writes only ciphertext. A SQLite file is not produced here — JSON and CSV are the portable backups. Attachment images open from the trade, LP and report screens.</p>';
    return { title: 'Backup & export', html: html };
  }
  function tokenGuide() {
    return '<ol class="guide"><li>On GitHub open <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens</b> and choose <b>Generate new token</b>.</li>' +
      '<li>Resource owner: the account that owns this repo (<b>JMP90</b>).</li>' +
      '<li>Repository access: <b>Only select repositories</b> → <b>portfolio-tracker</b>.</li>' +
      '<li>Permissions → Repository permissions → <b>Contents: Read and write</b>. Leave every other permission at No access.</li>' +
      '<li>Generate the token and copy it. It starts with <code class="k">github_pat_</code>.</li>' +
      '<li>Paste it below. It is encrypted with your portfolio password and stored only in this browser. It is never written into the repository.</li>' +
      '<li>Each device needs the token pasted once. Revoke it on GitHub to cut off that device. Saving re-encrypts <code class="k">data/portfolio.enc</code> and commits it with the Contents API. If GitHub has a newer copy, the app reloads it, merges by record, and warns when both sides edited the same row.</li></ol>';
  }
  function settings(db, tokenSet) {
    const ps = db.setting('default_portfolio', '29000');
    const risk = db.setting('default_risk_pct', '0.3');
    let html = '<header class="top"><h1>⚙ Settings</h1></header>';
    html += '<div class="card"><h2>GitHub token — how edits sync</h2><p class="small">This site is static. To save a change back to the repo, paste a fine-grained personal access token with <b>Contents: Read and write</b> on <b>JMP90/portfolio-tracker</b> only.</p>' + tokenGuide();
    html += '<form class="f" data-action="save-token" style="margin-top:12px"><div class="full"><label>Token for this browser</label><input type="password" name="token" autocomplete="off" placeholder="' + (tokenSet ? 'Token saved on this device — paste to replace' : 'github_pat_…') + '"></div><div><button class="btn">' + (tokenSet ? 'Replace token' : 'Save token') + '</button></div></form>';
    html += '<p class="small muted" style="margin-top:8px">' + (tokenSet ? 'A token is stored on this device.' : 'No token yet — edits stay in this browser until you add one.') + ' <button class="btn sec sm" type="button" data-action-click="forget-token">Remove token</button> <button class="btn sec sm" type="button" data-action-click="sync-now">Sync now</button></p></div>';
    html += '<div class="card" style="margin-top:12px"><form class="f" data-action="save-settings"><div><label>Default portfolio size $ (calculator / new trades)</label><input name="default_portfolio" value="' + U.esc(ps) + '" inputmode="decimal"></div>';
    html += '<div><label>Default risk % per trade</label><input name="default_risk_pct" value="' + U.esc(risk) + '" inputmode="decimal"></div>';
    html += '<div class="full"><h3>Change password</h3><p class="small muted">Changing the password re-wraps the encryption key and commits a new <code class="k">data/portfolio.enc</code>. Attachment files stay valid. Minimum 10 characters.</p></div>';
    html += '<div><label>Current password</label><input type="password" name="old" autocomplete="current-password"></div><div><label>New password</label><input type="password" name="new" autocomplete="new-password"></div>';
    html += '<div class="full"><button class="btn">Save</button></div></form></div>';
    html += '<div class="card" style="margin-top:12px"><h2>Data</h2><p class="small">Imported from Notion: ' + U.esc(db.setting('imported_at') || '—') + '</p>';
    html += '<p class="small"><a href="#/e/accounts">Accounts / platforms</a> · <a href="#/assets">Assets & price sources</a> · <a href="#/portfolio">Snapshots</a> · <a href="#/export">Backup</a> · <a href="#/reconciliation">Reconciliation</a></p>';
    html += '<p class="small"><a href="#/e/tranches">All tranches</a> · <a href="#/e/bot_events">All bot events</a> · <a href="#/e/lp_fees">All LP fee events</a> · <a href="#/e/holdings">All holdings (table)</a></p>';
    html += '<p class="small"><button class="btn danger sm" type="button" data-action-click="forget-device">Forget this device</button> <span class="muted">clears the local cache and token. The encrypted repo copy is unchanged.</span></p></div>';
    return { title: 'Settings', html: html };
  }

  function entityList(db, table) {
    const spec = M.E[table];
    if (!spec) return { title: 'Not found', html: '<p>Unknown table.</p>' };
    const cols = spec.fields.slice(0, 7);
    let rows = db.rows(table).slice();
    rows.sort(function (a, b) {
      const ord = spec.order || '';
      const desc = /desc/i.test(ord);
      const key = ord.split(',')[0].replace(/desc/i, '').trim();
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return a.id - b.id;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
      return b.id - a.id;
    });
    let html = '<header class="top"><h1>' + U.esc(spec.label) + '</h1><a class="btn sm" href="#/e/' + table + '/new">+ New</a></header><div class="card tw"><table><tr>';
    cols.forEach(function (f) { html += '<th>' + U.esc(f[1]) + '</th>'; });
    html += '<th></th></tr>';
    rows.forEach(function (r) {
      html += '<tr>';
      cols.forEach(function (f) {
        const v = r[f[0]];
        html += '<td class="small">' + (typeof v === 'number' ? U.num(v) : U.esc(v == null ? '' : v)) + '</td>';
      });
      html += '<td><a href="#/e/' + table + '/' + r.id + '">edit</a></td></tr>';
    });
    html += '</table></div>';
    return { title: spec.label, html: html };
  }
  function entityEdit(db, table, rid, q) {
    const spec = M.E[table];
    if (!spec) return { title: 'Not found', html: '<p>Unknown table.</p>' };
    const isNew = rid === 'new';
    let row = {};
    if (isNew) {
      row = Object.assign({}, q);
      if (table === 'trades') {
        if (!row.signal_source) row.signal_source = 'Standard Strategy';
        if (!row.status) row.status = 'Planned';
        if (!row.open_date) row.open_date = U.today();
        if (!row.portfolio_size) row.portfolio_size = db.setting('default_portfolio', '29000');
      }
      if ((table === 'tranches' || table === 'dca' || table === 'bot_events' || table === 'lp_fees') && !row.date) row.date = U.today();
      if (table === 'tranches' && !row.status) row.status = 'Filled';
      if (table === 'dca') { if (!row.type) row.type = 'Buy'; if (!row.strategy) row.strategy = 'General DCA'; }
    } else {
      const found = db.get(table, rid);
      if (!found) return { title: 'Not found', html: '<p>Record not found.</p>' };
      row = found;
    }
    const atts = isNew ? [] : db.rows('attachments').filter(function (a) { return a.owner_type === table && a.owner_id === +rid; });
    const title = (isNew ? 'New ' : 'Edit ') + spec.label.replace(/s$/, '');
    let html = '<header class="top"><h1>' + U.esc(title) + '</h1></header><div class="card"><form class="f" data-action="save-entity"><input type="hidden" name="_table" value="' + table + '"><input type="hidden" name="_id" value="' + U.esc(rid) + '">';
    if (table === 'tranches' && !isNew && !row.trade_id) html += '<input type="hidden" name="_was_orphan" value="1">';
    spec.fields.forEach(function (f) { html += fieldHtml(db, f, row[f[0]]); });
    html += '<div class="full"><button class="btn">Save</button> <a class="btn sec" href="' + (q.next && q.next.charAt(0) === '#' ? U.esc(q.next) : '#/e/' + table) + '">Cancel</a></div></form>';
    if (row.body_md) html += '<div class="doc" style="margin-top:12px"><h3>Imported Notion page</h3>' + U.renderMd(row.body_md) + '</div>';
    html += '</div>';
    if (!isNew) {
      html += '<div class="card" style="margin-top:12px"><h2>Attachments</h2>' + thumbs(atts) + attachForm(table, rid, '#/e/' + table + '/' + rid);
      html += '<form data-action="delete-entity" data-confirm="Delete this record permanently?" style="margin-top:14px"><input type="hidden" name="_table" value="' + table + '"><input type="hidden" name="_id" value="' + rid + '"><button class="btn danger sm">Delete</button></form></div>';
    }
    return { title: title, html: html };
  }

  function render(db, path, q) {
    const parts = path.split('/').filter(Boolean);
    if (!parts.length) return dashboard(db);
    const head = parts[0];
    if (head === 'portfolio') return portfolio(db, q);
    if (head === 'snapshots' && parts[1]) return snapshot(db, parts[1]);
    if (head === 'assets' && parts[2] === 'history') return assetHistory(db, parts[1]);
    if (head === 'assets') return assets(db);
    if (head === 'dca') return dca(db, q);
    if (head === 'trades' && parts[1]) return trade(db, +parts[1]);
    if (head === 'trades') return trades(db, q);
    if (head === 'calculator') return calculator(db, q);
    if (head === 'bots' && parts[1]) return bot(db, parts[1]);
    if (head === 'bots') return bots(db);
    if (head === 'lps' && parts[1]) return lp(db, parts[1]);
    if (head === 'lps') return lps(db);
    if (head === 'btc') return btc(db);
    if (head === 'reports' && parts[1] === 'view') return reportView(db, parts[2]);
    if (head === 'reports' && (parts[1] === 'monthly' || parts[1] === 'weekly') && parts[2]) return report(db, parts[1], decodeURIComponent(parts[2]));
    if (head === 'reports') return reports(db);
    if (head === 'rules') return rules(db);
    if (head === 'issues') return issues(db, q);
    if (head === 'reconciliation') return reconciliation(db);
    if (head === 'export') return exportPage();
    if (head === 'settings') return settings(db, !!(q && q._token));
    if (head === 'e' && parts[1] && parts[2]) return entityEdit(db, parts[1], parts[2], q);
    if (head === 'e' && parts[1]) return entityList(db, parts[1]);
    return { title: 'Not found', html: '<p>That page does not exist. <a href="#/">Dashboard</a></p>' };
  }

  function bindCalc() {
    const form = document.getElementById('calc');
    if (!form) return;
    let prices = {};
    const tag = document.getElementById('calc-prices');
    if (tag) { try { prices = JSON.parse(tag.textContent); } catch (e) {} }
    const v = function (id) {
      const el = document.getElementById(id);
      if (!el) return null;
      const x = String(el.value).replace(',', '.');
      return x === '' ? null : parseFloat(x);
    };
    const fmt = function (x) {
      if (x == null || isNaN(x)) return '—';
      if (Math.abs(x) >= 1000) return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
      return String(+x.toPrecision(6));
    };
    const usd = function (x) {
      if (x == null || isNaN(x)) return '—';
      return '$' + x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    function calcNow() {
      const long = document.getElementById('direction').value === 'Long';
      const mode = document.getElementById('mode').value;
      const perp = document.getElementById('trade_type').value !== 'Spot';
      const atr = v('atr'), mult = v('mult') == null ? 1 : v('mult'), buf = atr ? atr * mult : 0;
      let anchor = null, name = '';
      if (mode.indexOf('Ichimoku — Safe') === 0) {
        if (long) { anchor = v('spanb'); name = 'Senkou Span B'; }
        else { const a = v('spana'), b = v('spanb'); anchor = (a == null && b == null) ? null : Math.max(a == null ? -Infinity : a, b == null ? -Infinity : b); name = 'Top of cloud'; }
      } else if (mode.indexOf('Ichimoku — Balanced') === 0) { anchor = v('kijun'); name = 'Kijun-sen'; }
      else if (mode.indexOf('Ichimoku — Aggressive') === 0) { anchor = v('tenkan'); name = 'Tenkan-sen'; }
      else if (mode.indexOf('Fib') === 0) { anchor = long ? v('fib1') : v('fib0'); name = long ? 'Fib 1' : 'Fib 0'; }
      let sl = mode.indexOf('Manual') === 0 ? v('manual') : (anchor == null ? v('manual') : (long ? anchor - buf : anchor + buf));
      const e = v('entry'), ps = v('ps'), rp = v('rp');
      let r = v('rusd'); if (r == null && ps && rp) r = ps * rp / 100;
      const W = []; let sd = null, u = null, n = null, m = null, liq = null;
      if (e && sl != null) {
        sd = Math.abs(e - sl);
        if ((long && sl >= e) || (!long && sl <= e)) W.push('Stop is on the wrong side of entry.');
        if (r && sd) {
          u = r / sd; n = u * e; const lev = v('lev');
          if (perp && lev) { m = n / lev; liq = long ? e * (1 - 1 / lev) : e * (1 + 1 / lev); if ((long && sl <= liq) || (!long && sl >= liq)) W.push('Stop does not trigger before the approximate liquidation price — reduce leverage.'); }
          if (!perp && ps && n > ps) W.push('Spot notional exceeds portfolio size (cash cap).');
        }
      }
      document.getElementById('o_sl').textContent = fmt(sl);
      document.getElementById('o_anchor').textContent = anchor != null ? (name + ' ' + fmt(anchor) + ' ' + (long ? '−' : '+') + ' ATR×' + mult + ' (' + fmt(buf) + ')') : '';
      document.getElementById('o_sd').textContent = fmt(sd);
      document.getElementById('o_sp').textContent = sd && e ? (sd / e * 100).toFixed(2) + '% of entry' : '';
      document.getElementById('o_r').textContent = usd(r);
      document.getElementById('o_u').textContent = fmt(u);
      document.getElementById('o_n').textContent = usd(n);
      document.getElementById('o_m').textContent = perp ? usd(m) : 'n/a (spot)';
      document.getElementById('o_liq').textContent = liq ? '≈ liq ' + fmt(liq) : '';
      document.getElementById('o_warn').innerHTML = W.map(function (w) { return '⚠ ' + U.esc(w); }).join('<br>');
      document.getElementById('o_t').textContent = (e && sd) ? [1, 2, 3].map(function (k) { return k + 'R ' + fmt(long ? e + k * sd : e - k * sd); }).join(' · ') : '—';
    }
    form.addEventListener('input', calcNow);
    const asset = document.getElementById('asset_id');
    asset.addEventListener('change', function () {
      const entry = document.getElementById('entry');
      if (asset.value && prices[asset.value] != null && !entry.value) { entry.value = prices[asset.value]; calcNow(); }
    });
    calcNow();
    form._prices = prices;
  }

  g.PTViews = { render: render, bindCalc: bindCalc, tokenGuide: tokenGuide };
})(typeof globalThis !== 'undefined' ? globalThis : this);
