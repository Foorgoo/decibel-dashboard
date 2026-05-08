import { getMarketIcon, getMarketSymbol } from '../utils/marketIcons';

interface MarketLabelProps {
  marketName: string;
}

export function MarketLabel({ marketName }: MarketLabelProps) {
  const symbol = getMarketSymbol(marketName);
  const icon = getMarketIcon(marketName);
  const fallback = symbol.slice(0, 1).toUpperCase();

  return (
    <span className="market-label">
      {icon ? (
        <img className="market-icon" src={icon} alt="" aria-hidden="true" />
      ) : (
        <span className="market-icon-fallback">{fallback}</span>
      )}
      <span className="market-name">{marketName}</span>
    </span>
  );
}
