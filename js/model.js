/* Entity definitions — same fields as the original app's forms. */
(function (g) {
  'use strict';
  const SIGNAL_SOURCES = ['Standard Strategy', 'Raziel Strategy Signal', 'KT Strategy Signal', 'Legacy'];
  const TRANCHE_SIDES = ['Entry', 'Add', 'Reduce', 'Exit'];
  const TRANCHE_STATUS = ['Filled', 'Planned', 'Unfilled', 'Canceled', 'Legacy'];
  const TRADE_STATUS = ['Planned', 'Active', 'Closed', 'Canceled'];
  const SL_MODES = ['Ichimoku — Safe (Kumo)', 'Ichimoku — Balanced (Kijun)', 'Ichimoku — Aggressive (Tenkan)',
    'Fibonacci (Fib 1 / Fib 0 anchor)', 'Manual stop'];
  const ASSET_CLASSES = ['crypto', 'equity', 'commodity', 'fx', 'index', 'cash'];
  const PRICE_SOURCES = ['coingecko', 'yahoo', 'fixed', 'manual'];
  const CATEGORIES = ['BTC HODL', 'BTC TRADING', 'DRY POWDER', 'DRY POWDER - LP', 'BOT', 'COMMODITIES', 'ETH', 'SOL',
    'CRYPTO', 'Crypto AI', 'DEX', 'Privacy', 'CRYPTO DePin', 'STOCK', 'STOCK TECH', 'STOCK BIOTECH',
    'STOCK SEMICONDUCTOR', 'Tokenized STOCK', 'Living Cost', 'Other'];
  const TRADE_CATS = ['Crypto', 'Stock', 'Equity', 'Commodities', 'FX', 'Index'];
  const E = {
    accounts: { label: 'Accounts / Platforms', title: 'name', order: 'name', fields: [
      ['name', 'Name', 'text', null], ['kind', 'Type', 'select', ['exchange', 'wallet', 'broker', 'bank', 'defi', 'other']],
      ['notes', 'Notes', 'textarea', null]] },
    assets: { label: 'Assets', title: 'symbol', order: 'symbol', fields: [
      ['symbol', 'Symbol', 'text', null], ['name', 'Name', 'text', null], ['asset_class', 'Class', 'select', ASSET_CLASSES],
      ['category', 'Default category', 'select', CATEGORIES],
      ['price_source', 'Price source', 'select', PRICE_SOURCES], ['price_ticker', 'Price ticker / CoinGecko id', 'text', null],
      ['manual_price', 'Manual price', 'num', null], ['manual_override', 'Use manual price (override)', 'bool', null],
      ['notes', 'Notes', 'textarea', null]] },
    holdings: { label: 'Holdings', title: 'name', order: 'category, name', fields: [
      ['name', 'Name', 'text', null], ['asset_id', 'Asset', 'fk:assets', null], ['account_id', 'Account', 'fk:accounts', null],
      ['category', 'Category', 'select', CATEGORIES],
      ['qty_manual', 'Manual quantity / opening balance', 'num', null],
      ['ledger', 'Add DCA ledger quantity (DCA rows linked to this holding)', 'bool', null],
      ['website', 'Website', 'url', null], ['notes', 'Notes', 'textarea', null], ['archived', 'Archived', 'bool', null]] },
    dca: { label: 'DCA transactions', title: 'title', order: 'date desc', fields: [
      ['date', 'Date', 'date', null], ['asset_id', 'Asset', 'fk:assets', null], ['holding_id', 'Holding (quantity flows here)', 'fk:holdings', null],
      ['type', 'Type', 'select', ['Buy', 'Sell']], ['size', 'Size (units)', 'num', null], ['amount_usd', 'Amount USD (buys incl. fees)', 'num', null],
      ['price', 'Price', 'num', null], ['account_id', 'Platform', 'fk:accounts', null],
      ['funding_source', 'Funding source', 'select', ['External Cash', 'Borrowed Stablecoin', 'LP Fees', 'Stablecoin Reserve', 'Betfury Payout', 'Prison Break']],
      ['strategy', 'Strategy', 'select', ['General DCA', 'Spot Long', 'BTC Accumulation Protocol', 'Betfury Payout']],
      ['trade_id', 'Spot trade', 'fk:trades', null], ['btc_snapshot_id', 'BTC Protocol snapshot', 'fk:btc_snapshots', null],
      ['btc_to_aave', 'BTC to Aave', 'num', null], ['btc_to_longterm', 'BTC to long-term', 'num', null],
      ['title', 'Label', 'text', null], ['notes', 'Notes', 'textarea', null]] },
    trades: { label: 'Ichimoku trades', title: 'name', order: 'open_date desc', fields: [
      ['name', 'Trade name', 'text', null], ['signal_source', 'Signal source', 'select', SIGNAL_SOURCES],
      ['signal_ref', 'Signal reference (link/id)', 'text', null],
      ['asset_id', 'Asset', 'fk:assets', null], ['category', 'Category', 'select', TRADE_CATS],
      ['direction', 'Direction', 'select', ['Long', 'Short']], ['trade_type', 'Type', 'select', ['Perp / Futures', 'Spot']],
      ['platform_id', 'Platform', 'fk:accounts', null], ['setup', 'Setup / strategy', 'text', null],
      ['timeframe', 'Timeframe', 'select', ['15min', '1H', '4H', '12H', 'Daily', 'Weekly']],
      ['status', 'Status', 'select', TRADE_STATUS], ['open_date', 'Open date', 'date', null], ['close_date', 'Close date', 'date', null],
      ['portfolio_size', 'Portfolio size $', 'num', null], ['risk_usd', 'Risk $ (1R)', 'num', null],
      ['atr', 'ATR', 'num', null], ['atr_mult', 'ATR mult (SL buffer)', 'num', null], ['sl_mode', 'SL mode', 'select', SL_MODES],
      ['tenkan', 'Tenkan-sen', 'num', null], ['kijun', 'Kijun-sen', 'num', null], ['span_a', 'Senkou Span A', 'num', null],
      ['span_b', 'Senkou Span B', 'num', null], ['fib0', 'Fib 0 (anchor short)', 'num', null], ['fib1', 'Fib 1 (anchor long)', 'num', null],
      ['stop_loss', 'Stop loss (locked)', 'num', null], ['target', 'Target', 'num', null], ['leverage', 'Leverage x', 'num', null],
      ['entry_price_manual', 'Entry price (manual fallback)', 'num', null], ['current_price_manual', 'Current price (manual)', 'num', null],
      ['holding_id', 'Portfolio holding', 'fk:holdings', null], ['notes', 'Notes', 'textarea', null],
      ['legacy_setup_note', 'Original Notion SL mode / extra', 'text', null]] },
    tranches: { label: 'Trade tranches', title: 'title', order: 'date desc', fields: [
      ['trade_id', 'Parent trade', 'fk:trades', null], ['side', 'Side', 'select', TRANCHE_SIDES], ['status', 'Status', 'select', TRANCHE_STATUS],
      ['date', 'Date', 'date', null], ['price', 'Price', 'num', null], ['size', 'Size (units)', 'num', null], ['fees', 'Fees $', 'num', null],
      ['realized_pnl_manual', 'Realized PnL override $', 'num', null], ['title', 'Label', 'text', null], ['notes', 'Notes', 'textarea', null]] },
    bots: { label: 'Pionex bots', title: 'name', order: 'status, start_date desc', fields: [
      ['name', 'Bot name', 'text', null], ['asset_id', 'Asset', 'fk:assets', null], ['account_id', 'Exchange', 'fk:accounts', null],
      ['direction', 'Direction', 'select', ['Long', 'Short']], ['status', 'Status', 'select', ['Active', 'Closed']],
      ['start_date', 'Start', 'date', null], ['end_date', 'End', 'date', null], ['grid_lower', 'Grid lower', 'num', null],
      ['grid_upper', 'Grid upper', 'num', null], ['grid_levels', 'Grid levels', 'num', null], ['tp_price', 'Take profit', 'num', null],
      ['liq_price', 'Liquidation', 'num', null], ['category', 'Portfolio category', 'select', CATEGORIES], ['notes', 'Notes', 'textarea', null]] },
    bot_events: { label: 'Bot tranches / events', title: 'title', order: 'date desc', fields: [
      ['bot_id', 'Bot', 'fk:bots', null], ['kind', 'Type', 'select', ['Entry', 'Exit', 'Fee Collection', 'Balance update']],
      ['date', 'Date', 'date', null], ['tranche_no', 'Tranche #', 'num', null], ['price', 'Price executed', 'num', null],
      ['grid_level', 'Grid level', 'num', null], ['investment', 'Actual investment $', 'num', null], ['extra_margin', 'Extra margin $', 'num', null],
      ['fees_paid', 'Fees paid $', 'num', null], ['fees_collected', 'Fees collected $', 'num', null],
      ['value_usd', 'Balance / value $ (Balance update or Exit proceeds)', 'num', null], ['title', 'Label', 'text', null],
      ['notes', 'Notes', 'textarea', null]] },
    lps: { label: 'AMM LPs', title: 'lp_id', order: 'status, opened desc', fields: [
      ['lp_id', 'LP id', 'text', null], ['asset1', 'Asset 1', 'text', null], ['asset2', 'Asset 2', 'text', null],
      ['platform', 'Platform', 'text', null], ['chain', 'Chain', 'text', null], ['status', 'Status', 'select', ['Active', 'Dormant', 'Closed']],
      ['opened', 'Opened', 'date', null], ['closed', 'Closed', 'date', null], ['capital', 'Capital allocated $', 'num', null],
      ['range_min', 'Range min', 'num', null], ['range_max', 'Range max', 'num', null], ['apr', 'APR (fraction)', 'num', null],
      ['current_value', 'Current value $ (blank = capital)', 'num', null], ['closing_value', 'Closing value $', 'num', null],
      ['fees_used_for_return', 'Fees used for return $', 'num', null], ['creation_url', 'Creation tx', 'url', null],
      ['category', 'Portfolio category', 'select', CATEGORIES], ['notes', 'Notes', 'textarea', null]] },
    lp_fees: { label: 'LP fee events', title: 'title', order: 'date desc', fields: [
      ['lp_ref', 'LP position', 'fk:lps', null], ['date', 'Date', 'date', null], ['gross', 'Fees collected $ (gross)', 'num', null],
      ['network_fee', 'Network fee $ (positive)', 'num', null], ['value_at_close', 'Position value at close $', 'num', null],
      ['role', 'Cash-flow role', 'select', ['BTC Accumulation Protocol', 'Other']], ['btc_pct', 'BTC allocation %', 'num', null],
      ['debt_pct', 'Debt allocation %', 'num', null], ['btc_snapshot_id', 'BTC Protocol snapshot', 'fk:btc_snapshots', null],
      ['title', 'Label', 'text', null], ['notes', 'Notes', 'textarea', null]] },
    btc_snapshots: { label: 'BTC Protocol snapshots', title: 'month', order: 'month desc', fields: [
      ['month', 'Month (YYYY-MM)', 'text', null], ['snapshot_date', 'Snapshot date', 'date', null],
      ['phase', 'Strategy phase', 'select', ['Accumulation', 'Deleveraging', 'Debt-Free']],
      ['btc_price', 'BTC price (at snapshot)', 'num', null], ['btc_collateral', 'BTC collateral', 'num', null],
      ['longterm_btc', 'Long-term BTC', 'num', null], ['initial_btc_base', 'Initial BTC base', 'num', null],
      ['btc_alloc_aave', 'BTC allocated to Aave', 'num', null], ['btc_alloc_longterm', 'BTC allocated to long-term', 'num', null],
      ['btc_bought_borrow', 'BTC purchased — borrowing', 'num', null], ['btc_bought_lpfees', 'BTC purchased — LP fees', 'num', null],
      ['debt', 'Current Aave debt', 'num', null], ['prev_debt', 'Previous Aave debt', 'num', null], ['new_borrowing', 'New borrowing', 'num', null],
      ['principal_repaid', 'Principal repaid', 'num', null], ['interest_accrued', 'Interest accrued', 'num', null], ['interest_paid', 'Interest paid', 'num', null],
      ['health_factor', 'Health factor', 'num', null], ['reserve_start', 'Reserve starting balance', 'num', null],
      ['reserve_used', 'Reserve used for debt', 'num', null], ['reserve_replenished', 'Reserve replenished', 'num', null],
      ['ext_contrib', 'External contributions', 'num', null], ['ext_withdraw', 'External withdrawals', 'num', null],
      ['gas', 'Gas costs', 'num', null], ['swap_fees', 'Swap fees', 'num', null], ['other_costs', 'Other costs', 'num', null],
      ['net_lp_fees', 'Net LP fees', 'num', null], ['lp_to_btc', 'LP fees to BTC', 'num', null], ['lp_to_debt', 'LP fees to debt', 'num', null],
      ['linked_lp_value', 'Linked LP value', 'num', null], ['lp_il', 'LP impermanent loss', 'num', null],
      ['prev_nsv', 'Previous net strategy value', 'num', null], ['notes', 'Notes', 'textarea', null]] }
  };
  const TABLES = Object.keys(E).concat(['prices', 'attachments', 'reports', 'snapshots', 'snapshot_lines', 'import_notes', 'settings']);
  const BACK = {
    trades: '#/trades/{id}', bots: '#/bots/{id}', lps: '#/lps/{id}',
    holdings: '#/portfolio', assets: '#/assets', dca: '#/dca', btc_snapshots: '#/btc', accounts: '#/e/accounts'
  };
  g.PTModel = {
    SIGNAL_SOURCES: SIGNAL_SOURCES, TRANCHE_SIDES: TRANCHE_SIDES, TRANCHE_STATUS: TRANCHE_STATUS,
    TRADE_STATUS: TRADE_STATUS, SL_MODES: SL_MODES, ASSET_CLASSES: ASSET_CLASSES, PRICE_SOURCES: PRICE_SOURCES,
    CATEGORIES: CATEGORIES, E: E, TABLES: TABLES, BACK: BACK
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
