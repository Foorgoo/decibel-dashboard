import type { Market } from '../api/types';

const DEFAULT_SIZE_DECIMALS = 5;
const DEFAULT_PRICE_DECIMALS = 2;
const MAX_SIZE_DECIMALS = 8;
const MAX_PRICE_DECIMALS = 10;
const SIZE_FORMATTER_CACHE = new Map<number, Intl.NumberFormat>();
const PRICE_FORMATTER_CACHE = new Map<number, Intl.NumberFormat>();

interface MarketRef {
  market?: string;
  market_name?: string;
}

const getIntegerString = (value: unknown) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return '';
  return numericValue.toFixed(0);
};

const countTrailingZeros = (value: string) => {
  const match = value.match(/0+$/);
  return match ? match[0].length : 0;
};

const isBtcMarket = (market: Market | undefined, ref: MarketRef) => {
  const marketLabel = String(market?.market_name || ref.market_name || ref.market || '').toUpperCase();
  return /(^|[^A-Z])BTC([^A-Z]|$)/.test(marketLabel);
};

export const findMarketConfig = (ref: MarketRef, markets: Market[]) => markets.find((market) => (
  market.market_addr === ref.market
    || market.market_name === ref.market_name
    || market.market_name === ref.market
));

export const getMarketSizeDecimals = (market: Market | undefined, ref: MarketRef = {}) => {
  const sizeDecimals = Number(market?.sz_decimals);
  if (!Number.isFinite(sizeDecimals) || sizeDecimals < 0) return null;

  if (isBtcMarket(market, ref)) {
    return sizeDecimals;
  }

  const lotSize = getIntegerString(market?.lot_size);
  if (!lotSize) return null;
  return Math.max(0, sizeDecimals - countTrailingZeros(lotSize));
};

export const getMarketPriceDecimals = (market: Market | undefined) => {
  const priceDecimals = Number(market?.px_decimals);
  const tickSize = getIntegerString(market?.tick_size);
  if (!Number.isFinite(priceDecimals) || priceDecimals < 0 || !tickSize) return null;
  return Math.max(DEFAULT_PRICE_DECIMALS, priceDecimals - countTrailingZeros(tickSize));
};

const getNumberFormatter = (
  cache: Map<number, Intl.NumberFormat>,
  maximumFractionDigits: number,
  maxDecimals: number,
  options: Intl.NumberFormatOptions = {},
) => {
  const decimals = Math.min(Math.max(Math.floor(maximumFractionDigits), 0), maxDecimals);
  const cachedFormatter = cache.get(decimals);
  if (cachedFormatter) return cachedFormatter;

  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Math.min(2, decimals),
    maximumFractionDigits: decimals,
    ...options,
  });
  cache.set(decimals, formatter);
  return formatter;
};

export const formatMarketSize = (
  value: unknown,
  ref: MarketRef,
  markets: Market[],
  options: { absolute?: boolean } = {},
) => {
  const numericValue = Number(value || 0);
  const displayValue = options.absolute ? Math.abs(numericValue) : numericValue;
  const market = findMarketConfig(ref, markets);
  const marketSizeDecimals = getMarketSizeDecimals(market, ref);
  return getNumberFormatter(SIZE_FORMATTER_CACHE, marketSizeDecimals ?? DEFAULT_SIZE_DECIMALS, MAX_SIZE_DECIMALS).format(displayValue);
};

export const formatMarketPrice = (
  value: unknown,
  ref: MarketRef,
  markets: Market[],
) => {
  const numericValue = Number(value || 0);
  const market = findMarketConfig(ref, markets);
  const marketPriceDecimals = getMarketPriceDecimals(market);
  return getNumberFormatter(
    PRICE_FORMATTER_CACHE,
    marketPriceDecimals ?? DEFAULT_PRICE_DECIMALS,
    MAX_PRICE_DECIMALS,
    { style: 'currency', currency: 'USD' },
  ).format(numericValue);
};
