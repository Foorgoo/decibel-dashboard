import type { Market } from '../api/types';
import { formatMarketPrice, formatMarketSize, getMarketPriceDecimals, getMarketSizeDecimals } from './marketPrecision';
import { formatAmp, formatCompactCurrency, formatCurrency, formatNumberAmount, formatSignedCurrency } from './numberFormat';

interface MarketRef {
  market?: string;
  market_name?: string;
}

export const formatDisplayMarketPrice = (
  value: unknown,
  ref: MarketRef,
  markets: Market[],
) => formatMarketPrice(value, ref, markets);

export const formatDisplayMarketValue = (value: number) => formatNumberAmount(value);

export const formatDisplayMarketSize = (
  value: unknown,
  ref: MarketRef,
  markets: Market[],
  options: { absolute?: boolean } = {},
) => formatMarketSize(value, ref, markets, options);

export const formatDisplayMoney = (value: number) => formatCurrency(value);

export const formatDisplaySignedMoney = (value: number) => formatSignedCurrency(value);

export const formatDisplayCompactMoney = (value: number) => formatCompactCurrency(value);

export const formatDisplayAmp = (value: number) => formatAmp(value);

export { getMarketPriceDecimals, getMarketSizeDecimals };
