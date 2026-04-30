export interface Account {
  perp_equity_balance?: string | number;
  unrealized_pnl?: string | number;
  realized_pnl?: string | number;
  liquidation_fees_paid?: string | number | null;
  unrealized_funding_cost?: string | number;
  cross_margin_ratio?: string | number;
  maintenance_margin?: string | number;
  total_margin?: string | number;
  usdc_cross_withdrawable_balance?: string | number;
  margin_deficit?: string | number;
  volume?: string | number;
  [key: string]: any;
}

export interface Position {
  market?: string;
  market_name?: string;
  subaccount?: string;
  subaccount_name?: string;
  owner?: string;
  owner_name?: string;
  size?: string | number;
  entry_price?: string | number;
  mark_price?: string | number;
  mark_px?: string | number;
  value?: string | number;
  pnl?: string | number;
  unrealized_pnl?: string | number;
  unrealized_funding?: string | number;
  unrealized_funding_cost?: string | number;
  funding?: string | number;
  estimated_liquidation_price?: string | number;
  user_leverage?: string | number;
  leverage?: string | number;
  is_isolated?: boolean;
  [key: string]: any;
}

export interface Order {
  market?: string;
  market_name?: string;
  subaccount?: string;
  subaccount_name?: string;
  owner?: string;
  owner_name?: string;
  order_id?: string | number;
  order_type?: string;
  order_direction?: string;
  side?: string;
  direction?: string;
  is_buy?: boolean;
  remaining_size?: string | number;
  size?: string | number;
  price?: string | number;
  mark_price?: string | number;
  value?: string | number;
  status?: string;
  [key: string]: any;
}

export interface Trade {
  market?: string;
  market_name?: string;
  subaccount?: string;
  subaccount_name?: string;
  owner?: string;
  owner_name?: string;
  trade_id?: string | number;
  id?: string | number;
  timestamp?: string | number;
  transaction_unix_ms?: string | number;
  action?: string;
  source?: string;
  side?: string;
  size?: string | number;
  price?: string | number;
  value?: string | number;
  fee?: string | number;
  realized_pnl?: string | number;
  gross_realized_pnl?: string | number;
  [key: string]: any;
}

export interface PortfolioDataPoint {
  timestamp: number;
  value: number;
}

export interface Market {
  market_addr: string;
  market_name: string;
  sz_decimals: number;
  max_leverage: number;
  tick_size: number;
  min_size: number;
  lot_size: number;
  max_open_interest: number;
  px_decimals: number;
  mode: string;
  unrealized_pnl_haircut_bps: number;
}

export interface MarketPrice {
  market?: string;
  mark_px?: string | number;
  index_px?: string | number;
  oracle_px?: string | number;
  [key: string]: any;
}

export interface Candlestick {
  t: number;
  T: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  i: string;
}

export interface PointsLeaderboardEntry {
  rank: number;
  owner?: string;
  address?: string;
  account?: string;
  wallet_address?: string;
  owner_address?: string;
  total_amps?: number;
  amps?: number;
  points?: number;
  total_points?: number;
  realized_pnl: number;
  referral_amps: number;
  vault_amps: number;
}
