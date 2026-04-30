export const normalizeAddress = (value: unknown) => String(value || '').toLowerCase();

export const pickFirst = (source: any, keys: string[]) => {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

export const getLeaderboardAddress = (entry: any) =>
  normalizeAddress(entry?.owner || entry?.owner_address || entry?.wallet_address || entry?.address || entry?.account);

export const getLeaderboardAmps = (entry: any) => {
  const value = entry?.total_amps ?? entry?.amps ?? entry?.total_points ?? entry?.points;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

export const getVolume30d = (entry: any) => {
  const value = pickFirst(entry, ['volume', 'volume_30d', 'thirty_day_volume', 'volume30d']);
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
};

const getLocalDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getMsUntilNextLocalMidnight = () => {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 5, 0);
  return Math.max(nextMidnight.getTime() - now.getTime(), 1000);
};

export const getAmpDailyDelta = (accountKey: string, currentAmps: number) => {
  if (typeof window === 'undefined') return null;

  const storageKey = `decibel_amp_baseline_${getLocalDateKey()}_${accountKey.toLowerCase()}`;
  const storedBaseline = Number(localStorage.getItem(storageKey));

  if (!Number.isFinite(storedBaseline)) {
    localStorage.setItem(storageKey, String(currentAmps));
    return 0;
  }

  return currentAmps - storedBaseline;
};

export const sumAccountFields = (accounts: any[]) => {
  const numericFields = [
    'perp_equity_balance',
    'realized_pnl',
    'unrealized_pnl',
    'usdc_cross_withdrawable_balance',
    'total_margin',
    'liquidation_fees_paid',
    'unrealized_funding_cost',
    'margin_deficit',
    'maintenance_margin',
  ];
  const aggregate: Record<string, any> = { ...(accounts[0] || {}) };

  numericFields.forEach((field) => {
    const total = accounts.reduce((sum, account) => sum + Number(account?.[field] || 0), 0);
    aggregate[field] = String(total);
  });

  const marginRatios = accounts
    .map((account) => Number(account?.cross_margin_ratio || 0))
    .filter((value) => Number.isFinite(value));
  aggregate.cross_margin_ratio = String(marginRatios.length > 0 ? Math.max(...marginRatios) : 0);

  return aggregate;
};

export const aggregatePortfolioData = (seriesList: any[][]) => {
  const points = new Map<number, number>();

  seriesList.flat().forEach((point: any) => {
    const timestamp = Number(point.timestamp);
    if (!Number.isFinite(timestamp)) return;

    const value = Number(point.data_points ?? point.value ?? 0);
    points.set(timestamp, (points.get(timestamp) || 0) + value);
  });

  return Array.from(points.entries())
    .sort(([a], [b]) => a - b)
    .map(([timestamp, value]) => ({ timestamp, value }));
};

export const normalizeTimestamp = (value: unknown) => {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue < 10_000_000_000 ? numericValue * 1000 : numericValue;
  }

  const parsedValue = Date.parse(String(value || ''));
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

export const normalizeTradeSide = (trade: any) => {
  const sideValue = pickFirst(trade, [
    'side',
    'order_direction',
    'direction',
    'taker_side',
    'liquidity_side',
    'trade_side',
    'fill_side',
    'action',
  ]);
  const normalizedSide = String(sideValue || '').toLowerCase();

  if (normalizedSide === 'openlong' || normalizedSide === 'closeshort') {
    return 'BUY';
  }
  if (normalizedSide === 'closelong' || normalizedSide === 'openshort') {
    return 'SELL';
  }

  if (trade.is_buy === true || trade.is_bid === true || normalizedSide.includes('buy') || normalizedSide.includes('long') || normalizedSide === 'b') {
    return 'BUY';
  }
  if (trade.is_buy === false || trade.is_bid === false || normalizedSide.includes('sell') || normalizedSide.includes('short') || normalizedSide === 's') {
    return 'SELL';
  }

  return sideValue || '-';
};

export const getSelectedOwners = (currentAccount: string | null, accounts: { address: string }[]) => {
  if (currentAccount === 'all') return accounts.map((account) => account.address);
  return currentAccount ? [currentAccount] : [];
};
