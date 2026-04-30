import { useDashboardStore } from '../store';
import { MarketLabel } from './MarketLabel';

const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatTime = (timestamp: number | null) => {
  if (!timestamp) return '未刷新';
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const getBaseSymbol = (marketName: string) => marketName.split(/[/-]/)[0] || marketName;

interface RiskSummaryProps {
  lastUpdatedAt: number | null;
}

export function RiskSummary({ lastUpdatedAt }: RiskSummaryProps) {
  const { account, positions, openOrders, subaccounts } = useDashboardStore();

  const positionValue = positions.reduce((total, position: any) => total + Number(position.value || 0), 0);
  const orderValue = openOrders.reduce((total, order: any) => total + Number(order.value || 0), 0);

  const marketExposure = positions.reduce<Map<string, number>>((map, position: any) => {
    const marketName = position.market_name || position.market?.slice(0, 10) || 'Unknown';
    map.set(marketName, (map.get(marketName) || 0) + Number(position.value || 0));
    return map;
  }, new Map<string, number>());

  const largestExposure = Array.from(marketExposure.entries())
    .sort(([, a], [, b]) => b - a)[0];
  const liquidationFeesPaid = Number(account?.liquidation_fees_paid || 0);
  const marginDeficit = Number(account?.margin_deficit || 0);

  return (
    <div className="summary-strip">
      <div className="summary-item">
        <span className="summary-label">持仓价值</span>
        <span className="summary-value mono">{CURRENCY.format(positionValue)}</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">挂单价值</span>
        <span className="summary-value mono">{CURRENCY.format(orderValue)}</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">最大市场暴露</span>
        {largestExposure ? (
          <span className="summary-market">
            <MarketLabel marketName={getBaseSymbol(largestExposure[0])} />
            <span className="summary-value mono">{CURRENCY.format(largestExposure[1])}</span>
          </span>
        ) : (
          <span className="summary-value mono">-</span>
        )}
      </div>
      <div className="summary-item">
        <span className="summary-label">清算费用</span>
        <span className="summary-value mono">{CURRENCY.format(liquidationFeesPaid)}</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">保证金缺口</span>
        <span className={`summary-value mono ${marginDeficit > 0 ? 'negative' : ''}`}>
          {CURRENCY.format(marginDeficit)}
        </span>
      </div>
      <div className="summary-item">
        <span className="summary-label">子账户</span>
        <span className="summary-value mono">{subaccounts.length}</span>
      </div>
      <div className="summary-item">
        <span className="summary-label">最后刷新</span>
        <span className="summary-value mono">{formatTime(lastUpdatedAt)}</span>
      </div>
    </div>
  );
}
