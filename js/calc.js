/* Derived numbers. Line-for-line port of the original calc.py. */
(function (g) {
  'use strict';
  const U = g.PTUtil;
  const f = U.f;
  const EXEC = [null, '', 'Filled'];
  const SUSPECT_R = 25;

  function rows(db, t) { return db.rows ? db.rows(t) : (db.tables[t] || []); }
  function inExec(status) { return EXEC.indexOf(status) >= 0; }
  function today() { return (g.PTCalc && g.PTCalc._today) || U.today(); }

  function assetPrices(db) {
    const out = {};
    rows(db, 'assets').forEach(function (a) {
      let p, src, ts;
      if (a.price_source === 'fixed') {
        p = a.manual_price != null ? a.manual_price : 1.0; src = 'fixed'; ts = null;
      } else if (a.manual_override && a.manual_price != null) {
        p = a.manual_price; src = 'manual override'; ts = null;
      } else if (a.last_price != null) {
        p = a.last_price; src = a.last_price_source; ts = a.last_price_at;
      } else {
        p = a.manual_price; src = a.manual_price != null ? 'manual' : null; ts = null;
      }
      out[a.id] = { price: p, source: src, ts: ts, symbol: a.symbol };
    });
    return out;
  }
  function priceOn(db, assetId, date) {
    const lim = date + 'T23:59:59';
    let best = null;
    rows(db, 'prices').forEach(function (r) {
      if (r.asset_id !== assetId || !r.ts || r.ts > lim) return;
      if (!best || r.ts > best.ts) best = r;
    });
    return best ? best.price : null;
  }
  function stopLoss(mode, direction, atr, mult, tenkan, kijun, spanA, spanB, fib0, fib1, manual) {
    const buf = atr ? f(atr) * (mult != null ? mult : 1.0) : 0.0;
    const long = (direction || 'Long') === 'Long';
    mode = mode || '';
    let anchor = null;
    if (mode.indexOf('Ichimoku — Safe') === 0) {
      if (long) anchor = spanB;
      else {
        const xs = [spanA, spanB].filter(function (x) { return x != null; });
        anchor = xs.length ? Math.max.apply(null, xs) : null;
      }
    } else if (mode.indexOf('Ichimoku — Balanced') === 0) anchor = kijun;
    else if (mode.indexOf('Ichimoku — Aggressive') === 0) anchor = tenkan;
    else if (mode.indexOf('Fibonacci') === 0) anchor = long ? fib1 : fib0;
    else if (mode.indexOf('Manual') === 0) return manual;
    if (anchor == null) return manual;
    return long ? anchor - buf : anchor + buf;
  }
  function sizing(entry, sl, riskUsd, portfolio, riskPct, leverage, direction) {
    direction = direction || 'Long';
    if (riskUsd == null && portfolio && riskPct) riskUsd = portfolio * riskPct / 100.0;
    const out = { risk_usd: riskUsd, stop_distance: null, stop_pct: null, units: null, notional: null, margin: null, liq_approx: null, warn: [] };
    if (entry && sl != null) {
      const d = Math.abs(entry - sl);
      out.stop_distance = d; out.stop_pct = d / entry * 100;
      if ((direction === 'Long' && sl >= entry) || (direction === 'Short' && sl <= entry)) out.warn.push('Stop is on the wrong side of entry.');
      if (riskUsd && d) {
        out.units = riskUsd / d; out.notional = out.units * entry;
        if (leverage && leverage > 0) {
          out.margin = out.notional / leverage;
          const liq = direction === 'Long' ? entry * (1 - 1 / leverage) : entry * (1 + 1 / leverage);
          out.liq_approx = liq;
          if ((direction === 'Long' && sl <= liq) || (direction === 'Short' && sl >= liq))
            out.warn.push('Stop does not trigger before the (approximate) liquidation price — lower leverage.');
        } else if (portfolio && out.notional > portfolio) {
          out.warn.push('Spot notional exceeds portfolio size (cash cap).');
        }
      }
    }
    return out;
  }
  function tranchePnl(x, avg, sign) {
    if (x.realized_pnl_manual != null) return x.realized_pnl_manual;
    if (!(x.price && x.size && avg)) return null;
    return (x.price - avg) * x.size * sign - f(x.fees);
  }
  function suspect(x, avg) {
    if (x.realized_pnl_manual != null || x.pnl == null) return null;
    if (avg && x.price && !(0.2 <= x.price / avg && x.price / avg <= 5))
      return 'exit price ' + U.gnum(x.price) + ' is ' + Math.round(Math.abs(x.price / avg - 1) * 100) + '% away from avg entry ' + U.gnum(avg) + ' (unit/ticker mismatch?)';
    if (x.r != null && Math.abs(x.r) > SUSPECT_R)
      return (x.r > 0 ? '+' : '') + x.r.toFixed(1) + 'R on one tranche (size ' + U.gnum(x.size) + ' looks like a typo?)';
    return null;
  }
  function tradeMetrics(t, prices) {
    const sign = t.direction === 'Short' ? -1 : 1;
    const ex = (t.tranches || []).filter(function (x) { return inExec(x.status); });
    const ent = ex.filter(function (x) { return (x.side === 'Entry' || x.side === 'Add') && x.price && x.size; });
    let notional = 0, units = 0;
    ent.forEach(function (x) { notional += x.price * x.size; units += x.size; });
    let dcaUnits = 0, dcaCost = 0;
    if (t.trade_type === 'Spot') {
      (t.dca || []).forEach(function (d) {
        if (d.type !== 'Sell' && d.size) { dcaUnits += d.size; dcaCost += f(d.amount_usd); }
      });
    }
    const avg = (units + dcaUnits) ? (notional + dcaCost) / (units + dcaUnits) : t.entry_price_manual;
    const exits = ex.filter(function (x) { return x.side === 'Exit' || x.side === 'Reduce'; });
    const exitSet = new Set(exits);
    let exitUnits = 0; exits.forEach(function (x) { exitUnits += f(x.size); });
    let realized = 0, lastExit = null;
    (t.tranches || []).forEach(function (x) {
      x.pnl = null; x.r = null;
      if (exitSet.has(x)) {
        x.pnl = tranchePnl(x, avg, sign);
        x.r = (x.pnl != null && t.risk_usd) ? x.pnl / t.risk_usd : null;
        x.suspect = suspect(x, avg);
        if (x.suspect) return;
        realized += f(x.pnl);
        const dt = x.date || '';
        lastExit = (lastExit || '') > dt ? lastExit : (dt || lastExit);
        if (!lastExit && dt) lastExit = dt;
      }
    });
    // Match Python: last_exit = max(last_exit or '', date or '') or last_exit
    lastExit = null;
    realized = 0;
    (t.tranches || []).forEach(function (x) {
      x.pnl = null; x.r = null; x.suspect = null;
      if (!exitSet.has(x)) return;
      x.pnl = tranchePnl(x, avg, sign);
      x.r = (x.pnl != null && t.risk_usd) ? x.pnl / t.risk_usd : null;
      x.suspect = suspect(x, avg);
      if (x.suspect) return;
      realized += f(x.pnl);
      const mx = (lastExit || '') > (x.date || '') ? (lastExit || '') : (x.date || '');
      lastExit = mx || lastExit;
    });
    const openUnits = units + dcaUnits - exitUnits;
    const p = t.current_price_manual || (prices[t.asset_id] && prices[t.asset_id].price);
    const unreal = (p && avg && openUnits > 1e-12 && t.status !== 'Closed') ? (p - avg) * openUnits * sign : 0.0;
    const sl = t.stop_loss || stopLoss(t.sl_mode, t.direction, t.atr, t.atr_mult, t.tenkan, t.kijun, t.span_a, t.span_b, t.fib0, t.fib1, null);
    const kind = t.trade_type === 'Spot' ? 'Spot' : 'Perp';
    const expo = (p && openUnits > 1e-12 && t.status !== 'Closed') ? openUnits * p : 0.0;
    t.kind = kind; t.kind_unknown = !t.trade_type; t.exposure = expo;
    t.avg_entry = avg; t.entry_units = units; t.dca_units = dcaUnits; t.exit_units = exitUnits; t.open_units = openUnits;
    t.realized = realized; t.realized_r = t.risk_usd ? realized / t.risk_usd : null; t.cur_price = p;
    t.unrealized = unreal; t.unrealized_r = t.risk_usd ? unreal / t.risk_usd : null; t.sl_calc = sl;
    t.last_exit = lastExit;
    t.close_auto = (exits.length && Math.abs(openUnits) < 1e-9) ? lastExit : null;
    t.outcome = exits.length ? (realized > 0 ? 'Win' : realized < 0 ? 'Loss' : '') : '';
    return t;
  }
  function loadTrades(db, prices) {
    prices = prices || assetPrices(db);
    const assets = {};
    rows(db, 'assets').forEach(function (a) { assets[a.id] = a; });
    const trades = {};
    rows(db, 'trades').forEach(function (r) {
      const t = Object.assign({}, r);
      t.asset = assets[t.asset_id] ? assets[t.asset_id].symbol : null;
      t.tranches = []; t.dca = [];
      trades[t.id] = t;
    });
    const tranches = rows(db, 'tranches').slice().sort(function (a, b) {
      if ((a.date || '') !== (b.date || '')) return (a.date || '') < (b.date || '') ? -1 : 1;
      return a.id - b.id;
    });
    tranches.forEach(function (x) {
      if (trades[x.trade_id]) trades[x.trade_id].tranches.push(Object.assign({}, x));
    });
    rows(db, 'dca').forEach(function (d) {
      if (d.trade_id != null && trades[d.trade_id]) trades[d.trade_id].dca.push(Object.assign({}, d));
    });
    Object.keys(trades).forEach(function (id) { tradeMetrics(trades[id], prices); });
    return trades;
  }
  function dcaByAsset(db, end, priceMap, prices) {
    prices = prices || assetPrices(db);
    const useMap = priceMap != null;
    const gmap = {};
    rows(db, 'dca').forEach(function (d) {
      if (end && (!d.date || d.date > end)) return;
      const assets = rows(db, 'assets');
      const sym = (assets.find(function (a) { return a.id === d.asset_id; }) || {}).symbol;
      const k = d.asset_id;
      if (!gmap[k]) gmap[k] = { asset_id: k, symbol: sym, cost: 0, bought: 0, size: 0, proceeds: 0, n: 0, last: null };
      const x = gmap[k];
      x.n += 1; x.last = (x.last || '') > (d.date || '') ? x.last : (d.date || x.last);
      if (d.type === 'Sell') { x.size -= f(d.size); x.proceeds += f(d.amount_usd); }
      else { x.size += f(d.size); x.bought += f(d.size); x.cost += f(d.amount_usd); }
    });
    const out = [];
    Object.keys(gmap).forEach(function (k) {
      const x = gmap[k];
      const p = useMap ? priceMap[x.asset_id] : (prices[x.asset_id] && prices[x.asset_id].price);
      x.avg = x.bought ? x.cost / x.bought : null;
      x.price = p == null ? null : p;
      x.oversold = x.size < -1e-12;
      if (p != null && !x.oversold) { x.value = x.size * p; x.pnl = x.value + x.proceeds - x.cost; }
      else { x.value = null; x.pnl = null; }
      out.push(x);
    });
    out.sort(function (a, b) { return b.cost - a.cost; });
    const ok = out.filter(function (r) { return r.pnl != null; });
    const tot = {
      cost: ok.reduce(function (s, r) { return s + r.cost; }, 0),
      value: ok.reduce(function (s, r) { return s + r.value; }, 0),
      pnl: ok.reduce(function (s, r) { return s + r.pnl; }, 0),
      n: ok.length,
      missing: out.filter(function (r) { return r.pnl == null; }).map(function (r) { return r.symbol; })
    };
    return { rows: out, tot: tot };
  }
  function botMetrics(b, events) {
    b = Object.assign({}, b);
    const ev = events || [];
    b.events = ev;
    const ent = ev.filter(function (e) { return e.kind === 'Entry'; });
    b.capital = ent.reduce(function (s, e) { return s + f(e.investment) + f(e.extra_margin); }, 0);
    b.fees_collected = ev.reduce(function (s, e) { return s + f(e.fees_collected); }, 0);
    b.fees_paid = ev.reduce(function (s, e) { return s + f(e.fees_paid); }, 0);
    b.exit_value = ev.filter(function (e) { return e.kind === 'Exit'; }).reduce(function (s, e) { return s + f(e.value_usd); }, 0);
    const bal = ev.filter(function (e) { return e.kind === 'Balance update' && e.value_usd != null; });
    b.last_balance = bal.length ? bal[bal.length - 1] : null;
    if (b.status === 'Closed') { b.value = 0; b.value_basis = 'closed'; }
    else if (bal.length) { b.value = bal[bal.length - 1].value_usd; b.value_basis = 'balance ' + bal[bal.length - 1].date; }
    else { b.value = b.capital; b.value_basis = 'capital (no balance update)'; }
    b.pnl = b.value + b.exit_value + b.fees_collected - b.capital - b.fees_paid;
    const L = b.grid_lower, Up = b.grid_upper, N = b.grid_levels;
    b.grid_mid = (L && Up) ? Math.sqrt(L * Up) : null;
    b.grid_step = (L && Up && N) ? (Math.pow(Up / L, 1 / N) - 1) * 100 : null;
    b.tokens = b.grid_mid ? b.capital / b.grid_mid : null;
    b.qty_per_grid = (b.tokens && N) ? b.tokens / N : null;
    return b;
  }
  function loadBots(db) {
    const assets = {};
    rows(db, 'assets').forEach(function (a) { assets[a.id] = a.symbol; });
    const ev = {};
    rows(db, 'bot_events').slice().sort(function (a, b) {
      if ((a.date || '') !== (b.date || '')) return (a.date || '') < (b.date || '') ? -1 : 1;
      return a.id - b.id;
    }).forEach(function (e) {
      (ev[e.bot_id] = ev[e.bot_id] || []).push(Object.assign({}, e));
    });
    const bots = rows(db, 'bots').map(function (b) {
      const x = botMetrics(b, ev[b.id] || []);
      x.asset = assets[b.asset_id] || null;
      return x;
    });
    bots.sort(function (a, b) {
      if ((a.status || '') !== (b.status || '')) return (a.status || '') < (b.status || '') ? -1 : 1;
      if (!a.start_date && b.start_date) return 1;
      if (a.start_date && !b.start_date) return -1;
      if ((a.start_date || '') !== (b.start_date || '')) return (a.start_date || '') < (b.start_date || '') ? 1 : -1;
      return 0;
    });
    return bots;
  }
  function loadLps(db) {
    const fees = {};
    rows(db, 'lp_fees').slice().sort(function (a, b) {
      if ((a.date || '') !== (b.date || '')) return (a.date || '') < (b.date || '') ? -1 : 1;
      return a.id - b.id;
    }).forEach(function (e) { (fees[e.lp_ref] = fees[e.lp_ref] || []).push(Object.assign({}, e)); });
    const out = rows(db, 'lps').map(function (raw) {
      const l = Object.assign({}, raw);
      const fe = fees[l.id] || [];
      l.fees = fe;
      l.gross = fe.reduce(function (s, e) { return s + f(e.gross); }, 0);
      l.network = fe.reduce(function (s, e) { return s + Math.abs(f(e.network_fee)); }, 0);
      l.net = l.gross - l.network;
      const closeFromLog = fe.reduce(function (s, e) { return s + f(e.value_at_close); }, 0) || null;
      l.closing_effective = l.closing_value != null ? l.closing_value : closeFromLog;
      const end = l.closed || today();
      try { l.days = l.opened ? Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(l.opened + 'T00:00:00Z')) / 86400000) : null; }
      catch (e) { l.days = null; }
      if (l.status === 'Closed') {
        l.value = 0;
        l.total_return = l.closing_effective != null ? (l.closing_effective + l.gross - f(l.capital)) : null;
      } else {
        l.value = l.current_value != null ? l.current_value : f(l.capital);
        l.total_return = l.value + l.gross - f(l.capital);
      }
      l.total_return_pct = (l.total_return != null && l.capital) ? l.total_return / l.capital * 100 : null;
      l.est_annual_fees = (l.capital && l.apr) ? l.capital * l.apr : null;
      return l;
    });
    out.sort(function (a, b) {
      if ((a.status || '') !== (b.status || '')) return (a.status || '') < (b.status || '') ? -1 : 1;
      if (!a.opened && b.opened) return 1;
      if (a.opened && !b.opened) return -1;
      if ((a.opened || '') !== (b.opened || '')) return (a.opened || '') < (b.opened || '') ? 1 : -1;
      return 0;
    });
    return out;
  }
  function btcMetrics(s, price, prev) {
    s = Object.assign({}, s);
    const p = price != null ? price : s.btc_price;
    s.price_used = p;
    const coll = f(s.btc_collateral), lt = f(s.longterm_btc);
    s.coll_value = coll * f(p); s.lt_value = lt * f(p);
    s.total_btc = coll + lt; s.total_btc_value = s.coll_value + s.lt_value;
    s.btc_accumulated = s.initial_btc_base != null ? s.total_btc - f(s.initial_btc_base) : null;
    s.btc_this_month = f(s.btc_bought_borrow) + f(s.btc_bought_lpfees);
    s.reserve = f(s.reserve_start) - f(s.reserve_used) + f(s.reserve_replenished);
    s.ltv = s.coll_value ? f(s.debt) / s.coll_value * 100 : null;
    s.nsv = s.coll_value + s.lt_value + s.reserve - f(s.debt);
    s.nsv_btc = p ? s.nsv / p : null;
    s.net_ext_flow = f(s.ext_contrib) - f(s.ext_withdraw);
    s.total_costs = f(s.gas) + f(s.swap_fees) + f(s.other_costs) + f(s.interest_paid);
    const prevNsv = s.prev_nsv != null ? s.prev_nsv : (prev ? prev.nsv : null);
    s.usd_perf = prevNsv != null ? (s.nsv - prevNsv - s.net_ext_flow) : null;
    const ltv = s.ltv || 0;
    s.risk_status = ltv <= 5 ? 'Safe' : ltv <= 10 ? 'Caution' : 'Over limit';
    s.borrow_ok = (s.phase === 'Accumulation' && ltv <= 10);
    s.lt_alloc_mismatch = !!(s.btc_alloc_longterm) && !s.longterm_btc;
    return s;
  }
  function loadBtc(db, livePrice) {
    const raw = rows(db, 'btc_snapshots').slice().sort(function (a, b) { return (a.month || '') < (b.month || '') ? -1 : 1; });
    const out = []; let prev = null;
    raw.forEach(function (r) { const m = btcMetrics(r, null, prev); out.push(m); prev = m; });
    const latest = (raw.length && livePrice) ? btcMetrics(raw[raw.length - 1], livePrice, out.length > 1 ? out[out.length - 2] : null) : null;
    return { snaps: out, live: latest };
  }
  function btcAssetId(db) {
    const a = rows(db, 'assets').find(function (x) { return x.symbol === 'BTC'; });
    return a ? a.id : null;
  }
  function portfolioLines(db, mode, prices, asOf) {
    mode = mode || 'live';
    prices = prices || assetPrices(db);
    const led = {};
    rows(db, 'dca').forEach(function (d) {
      if (d.holding_id == null) return;
      led[d.holding_id] = (led[d.holding_id] || 0) + ((d.type === 'Sell' ? -1 : 1) * f(d.size));
    });
    const accounts = {};
    rows(db, 'accounts').forEach(function (a) { accounts[a.id] = a.name; });
    const assets = {};
    rows(db, 'assets').forEach(function (a) { assets[a.id] = a; });
    const lines = [];
    rows(db, 'holdings').forEach(function (h) {
      if (h.archived) return;
      let qty = f(h.qty_manual) + (h.ledger ? (led[h.id] || 0) : 0);
      let p, src;
      if (mode === 'notion' && h.notion_id) qty = f(h.notion_qty);
      if (mode === 'notion') { p = h.notion_price; src = 'Notion stored'; }
      else { const pi = prices[h.asset_id] || {}; p = pi.price; src = pi.source; }
      lines.push({
        source: 'holding', ref_id: h.id, name: h.name, category: h.category,
        asset: assets[h.asset_id] ? assets[h.asset_id].symbol : null,
        account: accounts[h.account_id] || null,
        qty: qty, price: p, value: p != null ? qty * p : null, price_source: src,
        ledger_qty: h.ledger ? (led[h.id] || 0) : null
      });
    });
    loadBots(db).forEach(function (b) {
      if (b.status === 'Closed' || (asOf && b.start_date && b.start_date > asOf)) return;
      if (asOf) {
        const bal = b.events.filter(function (e) { return e.kind === 'Balance update' && e.value_usd != null && (e.date || '') <= asOf; });
        if (bal.length) { b.value = bal[bal.length - 1].value_usd; b.value_basis = 'balance ' + bal[bal.length - 1].date; }
      }
      lines.push({
        source: 'bot', ref_id: b.id, name: b.name, category: b.category || 'BOT', asset: b.asset, account: 'Pionex',
        qty: null, price: null, value: b.value, price_source: b.value_basis
      });
    });
    loadLps(db).forEach(function (l) {
      if (asOf && l.opened && l.opened > asOf) return;
      if (l.status === 'Closed' && !(asOf && l.closed && l.closed > asOf)) return;
      const val = l.status !== 'Closed' ? l.value : f(l.capital);
      lines.push({
        source: 'lp', ref_id: l.id, name: 'LP ' + l.lp_id + ' ' + l.asset1 + '/' + l.asset2,
        category: l.category || 'DRY POWDER - LP', asset: null, account: l.platform,
        qty: null, price: null, value: val,
        price_source: l.current_value != null ? 'current value' : 'at cost (capital)'
      });
    });
    let snaps = loadBtc(db).snaps;
    if (asOf) snaps = snaps.filter(function (s) { return s.month <= asOf.slice(0, 7); });
    if (snaps.length) {
      const s = snaps[snaps.length - 1];
      const bp = mode === 'notion' ? s.btc_price : ((prices[btcAssetId(db)] && prices[btcAssetId(db)].price) || s.btc_price);
      const m = btcMetrics(s, bp);
      lines.push({
        source: 'btc_protocol', ref_id: s.id, name: 'BTC Accumulation Protocol — Net (' + s.month + ')', category: 'BTC HODL',
        asset: 'BTC', account: 'Aave', qty: m.total_btc, price: bp, value: m.nsv,
        price_source: 'snapshot qty × ' + (mode === 'notion' ? 'snapshot price' : 'live BTC')
      });
    }
    return lines;
  }
  function byCategory(lines) {
    const cat = {};
    lines.forEach(function (l) {
      if (l.value) cat[l.category || 'Other'] = (cat[l.category || 'Other'] || 0) + l.value;
    });
    const keys = Object.keys(cat);
    const tot = keys.reduce(function (s, k) { return s + cat[k]; }, 0);
    const arr = keys.map(function (k) { return [k, cat[k], tot ? cat[k] / tot * 100 : 0]; });
    arr.sort(function (a, b) { return b[1] - a[1]; });
    return { total: tot, cats: arr };
  }
  function takeSnapshot(db, label, kind, date, lines) {
    kind = kind || 'daily';
    date = date || today();
    lines = lines || portfolioLines(db);
    const tot = lines.reduce(function (s, l) { return s + (l.value || 0); }, 0);
    if (kind === 'daily') {
      const drop = rows(db, 'snapshots').filter(function (r) { return r.kind === 'daily' && r.date === date; }).map(function (r) { return r.id; });
      drop.forEach(function (id) {
        db.remove('snapshots', id);
        db.tables.snapshot_lines = rows(db, 'snapshot_lines').filter(function (l) { return l.snapshot_id !== id; });
      });
    }
    const snap = db.insert('snapshots', { date: date, label: label, kind: kind, total: tot, created: U.nowStamp() });
    lines.forEach(function (l) {
      db.insert('snapshot_lines', {
        snapshot_id: snap.id, source: l.source, ref_id: l.ref_id, name: l.name, category: l.category,
        asset: l.asset, qty: l.qty, price: l.price, value: l.value
      });
    });
    return snap.id;
  }
  function snapshotAt(db, end) {
    let best = null;
    rows(db, 'snapshots').forEach(function (r) {
      if (!r.date || r.date > end) return;
      if (!best || r.date > best.date || (r.date === best.date && r.id > best.id)) best = r;
    });
    return best;
  }
  function coreTrading(trades, start, end) {
    const agg = {}; const excluded = [];
    Object.keys(trades).forEach(function (id) {
      const t = trades[id];
      (t.tranches || []).forEach(function (x) {
        const closing = (x.side === 'Exit' || x.side === 'Reduce') && inExec(x.status) && x.date && start <= x.date && x.date <= end;
        if (closing && x.suspect) {
          excluded.push({ trade_id: t.id, name: t.name, date: x.date, price: x.price, size: x.size, pnl: x.pnl, reason: x.suspect, tranche_id: x.id });
          return;
        }
        if (closing && x.pnl != null) {
          if (!agg[t.id]) agg[t.id] = { trade_id: t.id, name: t.name, asset: t.asset, setup: t.setup, signal: t.signal_source, status: t.status, pnl: 0, r: 0, n: 0, last: '' };
          const g = agg[t.id];
          g.pnl += x.pnl; g.r += f(x.r); g.n += 1; if (x.date > g.last) g.last = x.date;
        }
      });
    });
    const list = Object.keys(agg).map(function (k) { return agg[k]; });
    list.sort(function (a, b) { return a.last < b.last ? -1 : a.last > b.last ? 1 : 0; });
    const gp = list.reduce(function (s, g0) { return s + (g0.pnl > 0 ? g0.pnl : 0); }, 0);
    const gl = list.reduce(function (s, g0) { return s + (g0.pnl < 0 ? g0.pnl : 0); }, 0);
    const w = list.reduce(function (s, g0) { return s + (g0.pnl > 0 ? 1 : 0); }, 0);
    function group(key) {
      const d = {};
      list.forEach(function (g0) {
        const k = g0[key] || '—';
        if (!d[k]) d[k] = { k: k, n: 0, w: 0, pnl: 0, r: 0 };
        d[k].n += 1; d[k].w += g0.pnl > 0 ? 1 : 0; d[k].pnl += g0.pnl; d[k].r += g0.r;
      });
      return Object.keys(d).map(function (k) { return d[k]; }).sort(function (a, b) { return b.pnl - a.pnl; });
    }
    const srt = list.slice().sort(function (a, b) { return b.pnl - a.pnl; });
    return {
      rows: list,
      pnl: list.reduce(function (s, g0) { return s + g0.pnl; }, 0),
      r: list.reduce(function (s, g0) { return s + g0.r; }, 0),
      parents: list.length,
      tranches: list.reduce(function (s, g0) { return s + g0.n; }, 0),
      wins: w, losses: list.length - w,
      wr: list.length ? w / list.length * 100 : null,
      pf: gl ? gp / -gl : null,
      gp: gp, gl: gl,
      by_setup: group('setup'), by_signal: group('signal'), by_asset: group('asset'),
      top: srt.slice(0, 3), bottom: srt.slice().reverse().slice(0, 3), excluded: excluded
    };
  }
  function buildReport(db, kind, period) {
    const range = kind === 'monthly' ? U.monthRange(period) : U.weekRange(period);
    const start = range[0], end = range[1];
    const prices = assetPrices(db);
    const trades = loadTrades(db, prices);
    const core = coreTrading(trades, start, end);
    const opened = Object.keys(trades).map(function (k) { return trades[k]; }).filter(function (t) {
      return t.open_date && start <= t.open_date && t.open_date <= end;
    });
    const act = {};
    opened.forEach(function (t) {
      const k = (t.trade_type || '—') + '\0' + (t.status || '—');
      act[k] = (act[k] || 0) + 1;
    });
    const activityBy = Object.keys(act).sort().map(function (k) {
      const p = k.split('\0'); return [p[0], p[1], act[k]];
    });
    const isPast = end < today();
    const snap = isPast ? snapshotAt(db, end) : null;
    let plines, pbasis, pmap;
    if (snap) {
      plines = rows(db, 'snapshot_lines').filter(function (r) { return r.snapshot_id === snap.id; }).map(function (r) { return Object.assign({}, r); });
      pbasis = 'stored snapshot ' + snap.date + ' (' + snap.label + ')';
      pmap = {};
      rows(db, 'assets').forEach(function (a) {
        const v = priceOn(db, a.id, end);
        if (v != null) pmap[a.id] = v;
      });
      Object.keys(prices).forEach(function (aid) {
        if (pmap[aid] == null) pmap[aid] = prices[aid].price;
      });
    } else {
      plines = portfolioLines(db, 'live', prices, null);
      pbasis = 'live prices (no stored snapshot for period end)';
      pmap = null;
    }
    const pc = byCategory(plines);
    const dca = dcaByAsset(db, end, pmap, prices);
    let periodN = 0, periodAmt = 0;
    rows(db, 'dca').forEach(function (d) {
      if (d.date && start <= d.date && d.date <= end) {
        periodN += 1;
        if (d.type !== 'Sell') periodAmt += f(d.amount_usd);
      }
    });
    const bots = loadBots(db);
    const botEv = [];
    bots.forEach(function (b) {
      b.events.forEach(function (e) {
        if (e.date && start <= e.date && e.date <= end) botEv.push(Object.assign({ bot: b.name }, e));
      });
    });
    const lps = loadLps(db);
    const lpOpen = lps.filter(function (l) { return l.opened && start <= l.opened && l.opened <= end; });
    const lpClosed = lps.filter(function (l) { return l.closed && start <= l.closed && l.closed <= end; });
    const feeEv = [];
    lps.forEach(function (l) {
      l.fees.forEach(function (e) {
        if (e.date && start <= e.date && e.date <= end) feeEv.push(Object.assign({ lp: l.lp_id }, e));
      });
    });
    const btcAll = loadBtc(db).snaps;
    const btc = kind === 'monthly'
      ? btcAll.filter(function (s) { return s.month === period.slice(0, 7); })
      : btcAll.filter(function (s) { return s.snapshot_date && start <= s.snapshot_date && s.snapshot_date <= end; });
    const cum = [];
    if (kind === 'monthly') {
      const months = {};
      Object.keys(trades).forEach(function (id) {
        (trades[id].tranches || []).forEach(function (x) {
          if (x.date && (x.side === 'Exit' || x.side === 'Reduce')) months[x.date.slice(0, 7)] = 1;
        });
      });
      let run = 0;
      Object.keys(months).sort().forEach(function (m) {
        if (m > period) return;
        const rg = U.monthRange(m);
        const ct = coreTrading(trades, rg[0], rg[1]);
        run += ct.pnl;
        cum.push({ month: m, pnl: ct.pnl, r: ct.r, cum: run, wr: ct.wr, pf: ct.pf });
      });
    }
    return {
      kind: kind, period: period, start: start, end: end, generated: U.nowLocal(),
      core: core,
      activity: { n: opened.length, by: activityBy },
      dca: { rows: dca.rows, tot: dca.tot, period_n: periodN, period_amt: periodAmt, basis: pmap ? ('prices on/before ' + end) : 'live prices' },
      portfolio: { total: pc.total, cats: pc.cats, basis: pbasis },
      bots: { active: bots.filter(function (b) { return b.status === 'Active'; }), events: botEv },
      lps: {
        opened: lpOpen, closed: lpClosed, fees: feeEv,
        gross: feeEv.reduce(function (s, e) { return s + f(e.gross); }, 0),
        network: feeEv.reduce(function (s, e) { return s + Math.abs(f(e.network_fee)); }, 0)
      },
      btc: btc, cumulative: cum
    };
  }
  function periods(db, kind) {
    const ds = [];
    rows(db, 'tranches').forEach(function (x) { if (x.date) ds.push(x.date); });
    rows(db, 'dca').forEach(function (d) { if (d.date) ds.push(d.date); });
    rows(db, 'trades').forEach(function (t) { if (t.open_date) ds.push(t.open_date); });
    if (kind === 'monthly') {
      const set = {};
      ds.forEach(function (d) { set[d.slice(0, 7)] = 1; });
      set[today().slice(0, 7)] = 1;
      return Object.keys(set).sort().reverse();
    }
    const w = {};
    ds.concat([today()]).forEach(function (d) { w[U.weekLabel(d)] = 1; });
    return Object.keys(w).sort().reverse();
  }

  g.PTCalc = {
    _today: null, EXEC: EXEC, assetPrices: assetPrices, priceOn: priceOn, stopLoss: stopLoss, sizing: sizing,
    loadTrades: loadTrades, tradeMetrics: tradeMetrics, dcaByAsset: dcaByAsset, loadBots: loadBots, loadLps: loadLps,
    btcMetrics: btcMetrics, loadBtc: loadBtc, btcAssetId: btcAssetId, portfolioLines: portfolioLines, byCategory: byCategory,
    takeSnapshot: takeSnapshot, snapshotAt: snapshotAt, coreTrading: coreTrading, buildReport: buildReport, periods: periods,
    today: today
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
