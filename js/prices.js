/* Live prices from the browser.
   Crypto: CoinGecko (CORS open). FX pairs like USDCHF=X: Frankfurter (CORS open).
   Stocks, commodities and indices: Yahoo Finance has no CORS header, so a failed
   fetch keeps the stored price and the screen marks it as stored. Manual override wins. */
(function (g) {
  'use strict';
  const U = g.PTUtil;
  function store(db, a, p, src) {
    const now = U.nowLocal();
    db.update('assets', a.id, { last_price: p, last_price_at: now, last_price_source: src });
    db.insert('prices', { asset_id: a.id, ts: now, price: p, source: src });
  }
  async function fetchYahoo(ticker) {
    const fx = /^([A-Z]{3})([A-Z]{3})=X$/.exec(ticker);
    if (fx) {
      const res = await fetch('https://api.frankfurter.dev/v1/latest?from=' + fx[1] + '&to=' + fx[2]);
      if (!res.ok) throw new Error('frankfurter ' + res.status);
      const j = await res.json();
      const p = j.rates && j.rates[fx[2]];
      if (p == null) throw new Error('no fx rate');
      return { price: +p, source: 'frankfurter' };
    }
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?range=1d&interval=1d';
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('yahoo ' + res.status);
    const j = await res.json();
    const meta = j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
    const p = meta && meta.regularMarketPrice;
    if (p == null) throw new Error('yahoo: no price');
    let px = +p;
    const cur = meta.currency || 'USD';
    if (cur && cur !== 'USD' && !ticker.endsWith('=X')) {
      if (cur === 'GBp') {
        const fxr = await fetchYahoo('GBPUSD=X');
        px = px * (fxr.price / 100);
      } else {
        const fxr = await fetchYahoo(cur + 'USD=X');
        px = px * fxr.price;
      }
    }
    return { price: px, source: 'yahoo' };
  }
  async function refresh(db) {
    const assets = db.rows('assets').filter(function (a) {
      return (a.price_source === 'coingecko' || a.price_source === 'yahoo') && a.price_ticker;
    });
    const ok = [], fail = [];
    const cg = assets.filter(function (a) { return a.price_source === 'coingecko'; });
    try {
      const ids = [];
      cg.forEach(function (a) { if (ids.indexOf(a.price_ticker) < 0) ids.push(a.price_ticker); });
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=' + encodeURIComponent(ids.join(',')));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const px = await res.json();
      cg.forEach(function (a) {
        const p = px[a.price_ticker] && px[a.price_ticker].usd;
        if (p == null) { fail.push([a.symbol, 'coingecko: id not found']); return; }
        store(db, a, +p, 'coingecko');
        ok.push(a.symbol);
      });
    } catch (e) {
      cg.forEach(function (a) { fail.push([a.symbol, 'coingecko: ' + (e.message || e)]); });
    }
    const yh = assets.filter(function (a) { return a.price_source === 'yahoo'; });
    for (let i = 0; i < yh.length; i++) {
      const a = yh[i];
      try {
        const got = await fetchYahoo(a.price_ticker);
        store(db, a, got.price, got.source);
        ok.push(a.symbol);
      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e);
        const stored = /failed to fetch|network|cors|yahoo/i.test(msg)
          ? 'stored price kept (Yahoo does not allow browser requests)'
          : msg.slice(0, 80);
        fail.push([a.symbol, stored]);
      }
    }
    const now = U.nowLocal();
    db.setSetting('prices_refreshed', now);
    db.setSetting('prices_failed', fail.map(function (x) { return x[0] + ' (' + x[1] + ')'; }).join('; '));
    return { ok: ok, fail: fail };
  }
  g.PTPrices = { refresh: refresh };
})(typeof globalThis !== 'undefined' ? globalThis : this);
