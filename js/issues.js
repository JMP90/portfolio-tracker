/* Live data-quality checks. Port of issues.py, including the pre-Sep 2026 ignore rule. */
(function (g) {
  'use strict';
  const C = g.PTCalc;
  const REVIEW_FROM = '2026-09-01';

  function linkFor(ent, eid) {
    if (!ent || eid == null) return null;
    const map = {
      trades: '#/trades/', tranches: '#/e/tranches/', holdings: '#/e/holdings/', assets: '#/e/assets/',
      bots: '#/bots/', bot_events: '#/e/bot_events/', lps: '#/lps/', lp_fees: '#/e/lp_fees/',
      dca: '#/e/dca/', btc_snapshots: '#/e/btc_snapshots/'
    };
    return map[ent] ? map[ent] + eid : null;
  }
  function tradeOpen(db, tid) {
    const r = db.get('trades', tid);
    if (!r) return null;
    if (r.open_date) return r.open_date;
    const dates = db.rows('tranches').filter(function (x) { return x.trade_id === r.id && x.date; }).map(function (x) { return x.date; }).sort();
    if (dates.length) return dates[0];
    const m = /(\d{1,2})\/\s*(\d{1,2})\/(\d{2,4})/.exec(r.name || '');
    if (m) {
      let y = parseInt(m[3], 10);
      if (m[3].length === 2) y += 2000;
      const p = g.PTUtil.pad;
      return y + '-' + p(parseInt(m[2], 10)) + '-' + p(parseInt(m[1], 10));
    }
    return (r.created || '').slice(0, 10) || null;
  }
  function tradeOpenFor(db, link) {
    if (!link) return null;
    const path = link.replace(/^#/, '').replace(/^\//, '');
    const m = /^(trades|e\/tranches)\/(\d+)/.exec(path);
    if (!m) return null;
    const rid = +m[2];
    if (m[1] === 'trades') return tradeOpen(db, rid);
    const r = db.get('tranches', rid);
    if (!r) return null;
    return (r.trade_id ? tradeOpen(db, r.trade_id) : null) || (r.suggested_trade_id ? tradeOpen(db, r.suggested_trade_id) : null) || r.date || '';
  }
  function markLegacy(db, items) {
    items.forEach(function (i) {
      const od = tradeOpenFor(db, i.link);
      if (od != null && od !== '' && od < REVIEW_FROM) {
        i.orig_severity = i.severity;
        i.severity = 'ignored';
        i.ignored_reason = 'ignored (pre-Sep legacy) — trade opened ' + od;
      }
    });
    return items;
  }
  function live(db) {
    const out = [];
    function add(sev, area, msg, ent, eid) {
      out.push({ severity: sev, area: area, message: msg, link: linkFor(ent, eid) });
    }
    const prices = C.assetPrices(db);
    const trades = C.loadTrades(db, prices);
    const now = new Date();
    const used = {};
    db.rows('holdings').forEach(function (h) { if (!h.archived && h.asset_id) used[h.asset_id] = 1; });
    db.rows('dca').forEach(function (d) { if (d.asset_id) used[d.asset_id] = 1; });
    db.rows('bots').forEach(function (b) { if (b.asset_id) used[b.asset_id] = 1; });
    db.rows('trades').forEach(function (t) { if ((t.status === 'Active' || t.status === 'Planned') && t.asset_id) used[t.asset_id] = 1; });
    db.rows('assets').forEach(function (a) {
      if (!used[a.id] || a.price_source === 'fixed') return;
      const p = prices[a.id] || {};
      if (p.price == null) { add('error', 'Prices', a.symbol + ': no price (auto or manual).', 'assets', a.id); return; }
      if ((a.price_source === 'coingecko' || a.price_source === 'yahoo') && !a.manual_override) {
        if (!a.last_price_at) add('warn', 'Prices', a.symbol + ': auto price never fetched; using manual ' + a.manual_price + '.', 'assets', a.id);
        else {
          const ts = new Date(a.last_price_at);
          if ((now - ts) / 1000 > 86400 * 2) add('warn', 'Prices', a.symbol + ': price is stale (' + String(a.last_price_at).slice(0, 16) + ').', 'assets', a.id);
        }
      }
      const notion = db.rows('prices').filter(function (r) { return r.asset_id === a.id && r.source === 'notion'; }).sort(function (x, y) { return (x.ts || '') < (y.ts || '') ? 1 : -1; })[0];
      if (notion && p.price && notion.price && Math.abs(p.price / notion.price - 1) > 0.30) {
        add('info', 'Prices', a.symbol + ': live price ' + p.price.toPrecision(6) + ' differs ' + ((p.price / notion.price - 1) * 100).toFixed(0) + '% from Notion\'s stored ' + Number(notion.price).toPrecision(6) + ' — check the price source/ticker (' + (a.price_ticker || '') + ') is the right instrument.', 'assets', a.id);
      }
    });
    Object.keys(trades).forEach(function (id) {
      const t = trades[id];
      t.tranches.forEach(function (x) {
        if (x.suspect) add('error', 'Trades', 'Tranche ' + x.date + " of '" + t.name + "' looks wrong — " + x.suspect + '; computed PnL ' + Number(x.pnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' is EXCLUDED from realized totals/reports until fixed (or set a Realized PnL override).', 'tranches', x.id);
      });
      if (t.closeout && Math.abs(t.open_units) > 1e-6)
        add('info', 'Trades', "Trade '" + t.name + "': closed without recorded exit — " + (t.open_units >= 0 ? '+' : '') + t.open_units.toPrecision(6) + ' leftover units closed out, no realized PnL added.', 'trades', t.id);
      else if (t.status === 'Closed' && t.open_units > 1e-6 && t.trade_type !== 'Spot')
        add('warn', 'Trades', "Closed trade '" + t.name + "' still has " + t.open_units.toPrecision(6) + ' open units per tranches.', 'trades', t.id);
      if (t.status === 'Active' && t.entry_units + t.dca_units > 0 && Math.abs(t.open_units) < 1e-9)
        add('warn', 'Trades', "Active trade '" + t.name + "' is fully exited (last exit " + t.last_exit + ') — mark Closed?', 'trades', t.id);
      if ((t.status === 'Active' || t.status === 'Planned') && t.kind_unknown)
        add('warn', 'Trades', "Open trade '" + t.name + "' has no type (Spot/Perp) — shown as Perp on the Dashboard; set Type.", 'trades', t.id);
      if ((t.status === 'Active' || t.status === 'Planned') && !t.risk_usd)
        add('warn', 'Trades', "Open trade '" + t.name + "' has no Risk $ (1R).", 'trades', t.id);
      if (t.open_units < -1e-6 && !t.closeout) {
        const tiny = -t.open_units <= 0.002 * Math.max(t.entry_units + t.dca_units, 1e-12);
        add(tiny ? 'info' : 'error', 'Trades', "Trade '" + t.name + "': exits exceed entries by " + (-t.open_units).toFixed(6) + ' units.', 'trades', t.id);
      }
      t.tranches.forEach(function (x) {
        if ((x.side === 'Exit' || x.side === 'Reduce') && C.EXEC.indexOf(x.status) >= 0 && x.pnl == null)
          add('warn', 'Trades', "Closing tranche " + x.date + " of '" + t.name + "' can't be valued (missing price/size/entry).", 'tranches', x.id);
      });
    });
    db.rows('tranches').forEach(function (x) {
      if (x.trade_id != null || x.status !== 'Unfilled') return;
      const s = x.suggested_trade_id ? db.get('trades', x.suggested_trade_id) : null;
      add('info', 'Unfilled orders', 'Unfilled order without parent: ' + (x.title || '(blank)') + ' ' + (x.side || '') + ' ' + (x.price || '') + '×' + (x.size || '') + (s ? ' — suggested parent: ' + s.name : ''), 'tranches', x.id);
    });
    db.rows('dca').forEach(function (d) {
      if (d.holding_id == null && d.btc_snapshot_id == null && (d.strategy || '') !== 'BTC Accumulation Protocol') {
        const a = db.get('assets', d.asset_id);
        add('warn', 'DCA', 'DCA ' + (a ? a.symbol : '') + ' ' + d.date + " not linked to a holding — units don't reach Portfolio.", 'dca', d.id);
      }
    });
    const dca = C.dcaByAsset(db, null, null, prices);
    dca.rows.forEach(function (r) {
      if (r.oversold) add('error', 'DCA', 'DCA ' + r.symbol + ': more units sold than bought (' + r.size.toFixed(6) + ').');
    });
    C.portfolioLines(db, 'live', prices).forEach(function (h) {
      if (h.source === 'holding' && h.qty < -1e-9) add('error', 'Holdings', "Holding '" + h.name + "' has negative quantity " + h.qty.toFixed(6) + '.', 'holdings', h.ref_id);
    });
    C.loadBots(db).forEach(function (b) {
      if (b.status !== 'Active') return;
      const lb = b.last_balance;
      if (!lb) add('warn', 'Bots', "Bot '" + b.name + "' has no Balance update — valued at capital $" + b.capital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '.', 'bots', b.id);
      else {
        const days = (Date.parse(g.PTUtil.today() + 'T00:00:00') - Date.parse(lb.date + 'T00:00:00')) / 86400000;
        if (days > 35) add('info', 'Bots', "Bot '" + b.name + "' balance last updated " + lb.date + '.', 'bots', b.id);
      }
    });
    C.loadLps(db).forEach(function (l) {
      if (l.status === 'Closed' && l.closing_effective == null) add('warn', 'LPs', 'LP ' + l.lp_id + ' is Closed but has no closing value.', 'lps', l.id);
      if (l.status !== 'Closed' && l.current_value == null) add('info', 'LPs', 'LP ' + l.lp_id + ' valued at cost ($' + Number(l.capital || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ') — enter current value.', 'lps', l.id);
    });
    const snaps = C.loadBtc(db).snaps;
    if (snaps.length) {
      const last = snaps[snaps.length - 1];
      const ym = g.PTUtil.today().slice(0, 7);
      if (last.month < ym && now.getDate() >= 2) add('warn', 'BTC Protocol', 'No BTC Protocol snapshot for ' + ym + ' yet (latest ' + last.month + ').');
      snaps.forEach(function (s) {
        if (s.ltv && s.ltv > 10) add('error', 'BTC Protocol', s.month + ': Strategic LTV ' + s.ltv.toFixed(2) + '% > 10% limit.', 'btc_snapshots', s.id);
      });
    }
    const tday = g.PTUtil.today();
    const parts = tday.split('-').map(Number);
    const prev = new Date(Date.UTC(parts[0], parts[1] - 1, 0)).toISOString().slice(0, 10);
    if (!db.rows('snapshots').some(function (s) { return s.date === prev; }))
      add('info', 'Snapshots', 'No stored portfolio snapshot dated ' + prev + ' (last month-end).');
    return markLegacy(db, out);
  }
  function importNotes(db, includeResolved) {
    const out = [];
    db.rows('import_notes').forEach(function (r) {
      if (!includeResolved && r.resolved) return;
      out.push({
        id: r.id, entity: r.entity, entity_id: r.entity_id, severity: r.severity, code: r.code,
        message: r.message, resolved: r.resolved, link: linkFor(r.entity, r.entity_id)
      });
    });
    const rank = { error: 0, warn: 1, info: 2 };
    out.sort(function (a, b) {
      const d = (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
      if (d) return d;
      if ((a.entity || '') !== (b.entity || '')) return (a.entity || '') < (b.entity || '') ? -1 : 1;
      return a.id - b.id;
    });
    return markLegacy(db, out);
  }
  function counts(db) {
    const L = live(db);
    const N = importNotes(db, false);
    let n = 0;
    L.concat(N).forEach(function (i) { if ((i.severity === 'error' || i.severity === 'warn') && !i.resolved) n++; });
    const sev = { error: 0, warn: 0, info: 0 };
    L.concat(N).forEach(function (i) { if (sev[i.severity] != null) sev[i.severity]++; });
    return { n: n, sev: sev, live: L, notes: N };
  }
  g.PTIssues = { live: live, importNotes: importNotes, counts: counts, tradeOpen: tradeOpen };
})(typeof globalThis !== 'undefined' ? globalThis : this);
