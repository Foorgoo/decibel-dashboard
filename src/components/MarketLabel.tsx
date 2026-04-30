const MARKET_ICONS: Record<string, string> = {
  aave: '/market-icons/aave.svg',
  ada: '/market-icons/ada.svg',
  apt: '/market-icons/apt.svg',
  bnb: '/market-icons/bnb.svg',
  btc: '/market-icons/btc.svg',
  doge: '/market-icons/doge.svg',
  eth: '/market-icons/eth.svg',
  fartcoin: '/market-icons/fartcoin.svg',
  gold: '/market-icons/gold.svg',
  hype: '/market-icons/hype.svg',
  link: '/market-icons/link.svg',
  near: '/market-icons/near.svg',
  oil: '/market-icons/oil.svg',
  pepe: '/market-icons/pepe.svg',
  silver: '/market-icons/silver.svg',
  sol: '/market-icons/sol.svg',
  sui: '/market-icons/sui.svg',
  tao: '/market-icons/tao.svg',
  trump: '/market-icons/trump.svg',
  wlfi: '/market-icons/wlfi.svg',
  xpl: '/market-icons/xpl.svg',
  xrp: '/market-icons/xrp.svg',
  zec: '/market-icons/zec.svg',
  zro: '/market-icons/zro.svg',
};

const SYMBOL_ALIASES: Record<string, string> = {
  kpepe: 'pepe',
  wtioil: 'oil',
};

const getMarketSymbol = (marketName: string) => {
  const [base] = marketName.split(/[/-]/);
  const normalized = base.trim().toLowerCase();
  return SYMBOL_ALIASES[normalized] || normalized;
};

interface MarketLabelProps {
  marketName: string;
}

export function MarketLabel({ marketName }: MarketLabelProps) {
  const symbol = getMarketSymbol(marketName);
  const icon = MARKET_ICONS[symbol];
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
