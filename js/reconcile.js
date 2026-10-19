/* Reconciliation vs the imported Notion month-end figures.
   Target numbers live in the encrypted settings (key recon_targets), not in source. */
(function (g) {
  'use strict';
  const C = g.PTCalc;
  const U = g.PTUtil;
  function m(v) {
    if (v == null || Number.isNaN(v)) return '—';
    return U.money(v, 2, false);
  }
  function ok(a, b, tol) {
    if (tol == null) tol = 0.01;
    return a != null && b != null && Math.abs(a - b) <= tol;
  }
  function mark(a, b, tol) { return ok(a, b, tol) ? '✅' : '❌'; }
  function run(db) {
    let targets = null;
    try { targets = JSON.parse(db.setting('recon_targets') || 'null'); } catch (e) { targets = null; }
    const N = (targets && targets.notion) || {};
    const lines = [];
    const P = function (s) { lines.push(s); };
    P('# Reconciliation — Portfolio Tracker vs Notion');
    P('');
    P('Targets are the September 2026 month-end figures stored with the imported data. Notion values use Notion\'s stored prices. Live prices differ and are shown only for information.');
    P('');
    const trades = C.loadTrades(db);
    const k = C.coreTrading(trades, '2026-09-01', '2026-09-30');
    P('## 1. September core trading (Exit/Reduce tranches dated 1–30 Sep)');
    P('');
    P('| Metric | Notion | App | |');
    P('|---|---:|---:|:-:|');
    const rows = [
      ['Realized PnL', N.pnl != null ? m(N.pnl) : '—', m(k.pnl), N.pnl != null ? mark(k.pnl, N.pnl) : ''],
      ['R', N.r != null ? U.rr(N.r) : '—', U.rr(k.r), N.r != null ? mark(k.r, N.r, 0.005) : ''],
      ['Profit factor', N.pf != null ? N.pf.toFixed(2) : '—', k.pf != null ? k.pf.toFixed(2) : '—', N.pf != null && k.pf != null ? mark(+k.pf.toFixed(2), N.pf) : ''],
      ['Win rate (by parent trade)', N.wr != null ? N.wr + '%' : '—', k.wr != null ? k.wr.toFixed(1) + '%' : '—', N.wr != null && k.wr != null ? mark(+k.wr.toFixed(1), N.wr) : ''],
      ['Parent trades / closing tranches', (N.parents != null ? N.parents + ' / ' + N.tranches : '—'), k.parents + ' / ' + k.tranches, (N.parents != null && k.parents === N.parents && k.tranches === N.tranches) ? '✅' : (N.parents != null ? '❌' : '')]
    ];
    rows.forEach(function (r) { P('| ' + r.join(' | ') + ' |'); });
    P('');
    P('Rule (same as the Notion report): PnL per closing tranche = manual Realized PnL override, else (exit − parent avg entry) × size × direction − fees; avg entry = weighted Filled Entry/Add tranches (spot trades also include their linked DCA buys); R = PnL ÷ parent\'s Risk $; win rate and profit factor are aggregated by parent trade.');
    if (k.excluded.length) P('');
    if (k.excluded.length) P('⚠ ' + k.excluded.length + ' suspect tranche(s) excluded in September.');
    const pm = {};
    db.rows('prices').forEach(function (r) { if (r.source === 'notion') pm[r.asset_id] = r.price; });
    const totAll = C.dcaByAsset(db, '2026-09-30', pm);
    const qrows = [];
    db.rows('dca').forEach(function (row) {
      if (!row.date || row.date > '2026-09-30') return;
      if ((row.notion_id || '').indexOf('corr:') === 0) return;
      const d = Object.assign({}, row);
      if (d.orig_json) {
        try { Object.assign(d, JSON.parse(d.orig_json)); } catch (e) {}
      }
      qrows.push(d);
    });
    const gmap = {};
    qrows.forEach(function (d) {
      const x = gmap[d.asset_id] || (gmap[d.asset_id] = { cost: 0, size: 0, proceeds: 0 });
      if (d.type === 'Sell') { x.size -= d.size || 0; x.proceeds += d.amount_usd || 0; }
      else { x.size += d.size || 0; x.cost += d.amount_usd || 0; }
    });
    let cost = 0, value = 0, proceeds = 0;
    Object.keys(gmap).forEach(function (a) {
      if (pm[a] == null) return;
      cost += gmap[a].cost; value += gmap[a].size * pm[a]; proceeds += gmap[a].proceeds;
    });
    const pnl = value + proceeds - cost;
    const totLive = C.dcaByAsset(db, null, null);
    P('');
    P('## 2. DCA (purchases to 30 Sep, valued at Notion\'s stored prices)');
    P('');
    P('| | Notion | App — excluding correction rows | App — all rows dated ≤ 30 Sep | |');
    P('|---|---:|---:|---:|:-:|');
    P('| Cost basis | ' + m(N.dca_cost) + ' | ' + m(cost) + ' | ' + m(totAll.tot.cost) + ' | ' + (N.dca_cost != null ? mark(cost, N.dca_cost) : '') + ' |');
    P('| Value | ' + m(N.dca_value) + ' | ' + m(value) + ' | ' + m(totAll.tot.value) + ' | ' + (N.dca_value != null ? mark(value, N.dca_value, 0.02) : '') + ' |');
    P('| Unrealized PnL | ' + m(N.dca_pnl) + ' | ' + m(pnl) + ' | ' + m(totAll.tot.pnl) + ' | ' + (N.dca_pnl != null ? mark(pnl, N.dca_pnl, 0.02) : '') + ' |');
    P('');
    P('Rows whose notion id starts with corr: (app corrections) are excluded from the middle column. DCA buys entered in Notion after the September report was written can also explain a gap; those created-times are not stored on the row.');
    const corrs = db.rows('dca').filter(function (d) { return (d.notion_id || '').indexOf('corr:') === 0 || d.orig_json; });
    if (corrs.length) {
      P('');
      P('**App corrections are excluded from the Notion comparison above** and included in the app\'s own figures:');
      corrs.forEach(function (x) {
        const a = db.get('assets', x.asset_id);
        P('- ' + x.date + ' ' + (a ? a.symbol : '') + ' ' + x.type + ' ' + x.size + ' @ ' + x.price + ' = ' + m(x.amount_usd) + (x.orig_json ? ' (original values kept on the row)' : ' (row added by correction)'));
      });
    }
    P('');
    P('For information — DCA at the prices currently loaded: cost ' + m(totLive.tot.cost) + ', value ' + m(totLive.tot.value) + ', PnL ' + m(totLive.tot.pnl) + '.');
    const L = C.portfolioLines(db, 'notion', null, '2026-09-30');
    const by = {};
    L.forEach(function (l) { by[l.source] = (by[l.source] || 0) + (l.value || 0); });
    let notionScope = 0, appTotal = 0;
    Object.keys(by).forEach(function (s) { appTotal += by[s]; if (s !== 'lp') notionScope += by[s]; });
    const liveTot = C.portfolioLines(db).reduce(function (s, l) { return s + (l.value || 0); }, 0);
    P('');
    P('## 3. Portfolio holdings total (Notion stored prices, 30 Sep)');
    P('');
    P('| | Notion | App | |');
    P('|---|---:|---:|:-:|');
    P('| Holdings + bots + BTC protocol (Notion scope) | ' + m(N.holdings) + ' | ' + m(notionScope) + ' | ' + (N.holdings != null ? mark(notionScope, N.holdings) : '') + ' |');
    P('| …of which holdings / bots / BTC protocol | | ' + m(by.holding) + ' / ' + m(by.bot) + ' / ' + m(by.btc_protocol) + ' | |');
    P('| + active AMM LPs (new in the app) | not counted | ' + m(by.lp) + ' | ℹ |');
    P('| **App portfolio total (Sep-30 snapshot basis)** | | **' + m(appTotal) + '** | |');
    P('');
    P('Quantities = opening balance + DCA ledger. The app replaces Notion\'s hand-typed protocol row with the automatic protocol line. Active LPs are included in the app total and were not in Notion\'s holdings total. At the prices currently loaded the app shows ' + m(liveTot) + '.');
    const snaps = C.loadBtc(db).snaps;
    const s = snaps.filter(function (x) { return x.month === '2026-09'; })[0];
    const nsv = s ? s.nsv : null;
    P('');
    P('## 4. BTC Accumulation Protocol — September net strategy value');
    P('');
    P('| | Notion | App | |');
    P('|---|---:|---:|:-:|');
    P('| Net strategy value | ' + m(N.btc_nsv) + ' | ' + m(nsv) + ' | ' + (N.btc_nsv != null ? mark(nsv, N.btc_nsv) : '') + ' |');
    if (s) P('');
    if (s) P('NSV = collateral ' + s.btc_collateral + ' BTC × ' + m(s.btc_price) + ' + long-term BTC (' + (s.longterm_btc || 0) + ') + reserve ' + m(s.reserve) + ' − debt ' + m(s.debt) + '. LTV ' + (s.ltv != null ? s.ltv.toFixed(2) : '—') + '% (' + s.risk_status + ').');
    const other = (targets && targets.other) || [];
    if (other.length) {
      P('');
      P('## 5. Other months (Notion reports used different rules at the time)');
      P('');
      P('| Month | Notion report basis | Notion PnL / R / WR / PF | App (current rule) |');
      P('|---|---|---|---|');
      other.forEach(function (o) {
        const rg = U.monthRange(o.period);
        const kk = C.coreTrading(trades, rg[0], rg[1]);
        const nv = m(o.pnl) + ' / ' + (o.r != null ? U.rr(o.r) : '—') + ' / ' + (o.wr != null ? o.wr.toFixed(1) + '%' : '—') + ' / ' + (o.pf != null ? o.pf.toFixed(2) : '—');
        const av = m(kk.pnl) + ' / ' + U.rr(kk.r) + ' / ' + (kk.wr != null ? kk.wr.toFixed(1) + '%' : '—') + ' / ' + (kk.pf != null ? kk.pf.toFixed(2) : '—') + ' (' + kk.parents + ' trades, ' + kk.tranches + ' tranches)';
        P('| ' + o.period + ' | ' + (o.basis || '') + ' | ' + nv + ' | ' + av + ' |');
      });
      P('');
      P('May/June Notion reports counted only closed trades opened in that month. July excluded rows that needed cleanup. August and October were produced before later tranche edits. The app applies the September rule (all Exit/Reduce tranches dated in the period) to every month. Suspect tranches are excluded from totals and listed on Issues. The original Notion report pages are archived under Reports.');
    }
    const coreOk = N.pnl == null || rows.every(function (r) { return !r[3] || r[3] === '✅'; });
    P('');
    P('## Result');
    P('');
    P('- September trading: ' + (coreOk && N.pnl != null ? '✅ exact match' : (N.pnl == null ? 'targets not stored' : '❌ mismatch')));
    P('- Holdings total (Notion scope): ' + (N.holdings == null ? '—' : (ok(notionScope, N.holdings) ? '✅ exact match' : '❌')));
    P('- BTC protocol Sept NSV: ' + (N.btc_nsv == null ? '—' : (ok(nsv, N.btc_nsv) ? '✅ exact match' : '❌')));
    return lines.join('\n');
  }
  g.PTReconcile = { run: run };
})(typeof globalThis !== 'undefined' ? globalThis : this);
