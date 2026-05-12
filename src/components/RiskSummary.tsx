import { useDashboardStore } from '../store';
import { MarketLabel } from './MarketLabel';
import { formatDisplayCompactMoney, formatDisplayMoney } from '../utils/displayFormat';

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
  const { positions, openOrders, subaccounts, currentAccount } = useDashboardStore();

  const positionValue = positions.reduce((total, position: any) => total + Number(position.value || 0), 0);
  const orderValue = openOrders.reduce((total, order: any) => total + Number(order.value || 0), 0);
  const positionCount = positions.length;
  const orderCount = openOrders.length;
  const longValue = positions.reduce((total, position: any) => (
    Number(position.size || 0) > 0 ? total + Number(position.value || 0) : total
  ), 0);
  const shortValue = positions.reduce((total, position: any) => (
    Number(position.size || 0) < 0 ? total + Number(position.value || 0) : total
  ), 0);
  const netExposure = longValue - shortValue;
  const netExposureSide = netExposure > 0 ? '多' : netExposure < 0 ? '空' : '平';

  const marketExposure = positions.reduce<Map<string, number>>((map, position: any) => {
    const marketName = position.market_name || position.market?.slice(0, 10) || 'Unknown';
    map.set(marketName, (map.get(marketName) || 0) + Number(position.value || 0));
    return map;
  }, new Map<string, number>());

  const largestExposure = Array.from(marketExposure.entries())
    .sort(([, a], [, b]) => b - a)[0];
  const selectedSubaccountCount = currentAccount === 'all'
    ? subaccounts.length
    : currentAccount
      ? subaccounts.filter((subaccount) => subaccount.owner?.toLowerCase() === currentAccount.toLowerCase()).length
      : 0;
  const fallbackPositionSubaccountCount = new Set(
    positions.map((position: any) => String(position.subaccount || '')).filter(Boolean),
  ).size;
  const visibleSubaccountCount = currentAccount ? selectedSubaccountCount || fallbackPositionSubaccountCount : 0;

  return (
    <div className="summary-strip">
      <div className="summary-primary">
        <div className="summary-item">
          <span className="summary-label">持仓价值</span>
          <span className="summary-value mono">{formatDisplayMoney(positionValue)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">挂单价值</span>
          <span className="summary-value mono">{formatDisplayMoney(orderValue)}</span>
        </div>
        <div className="summary-item summary-exposure-item">
          <span className="summary-label">最大市场暴露</span>
          {largestExposure ? (
            <span className="summary-market">
              <MarketLabel marketName={getBaseSymbol(largestExposure[0])} />
              <span className="summary-value mono">{formatDisplayMoney(largestExposure[1])}</span>
            </span>
          ) : (
            <span className="summary-value mono">-</span>
          )}
        </div>
      </div>
      <div className="summary-compact-group">
        <div className="summary-compact-item summary-exposure-compact">
          <span className="summary-label">多头</span>
          <span className="summary-value mono positive">{formatDisplayCompactMoney(longValue)}</span>
        </div>
        <div className="summary-compact-item summary-exposure-compact">
          <span className="summary-label">空头</span>
          <span className="summary-value mono negative">{formatDisplayCompactMoney(shortValue)}</span>
        </div>
        <div className="summary-compact-item summary-net-item">
          <span className="summary-label">净敞口</span>
          <span className={`summary-value mono ${netExposure > 0 ? 'positive' : netExposure < 0 ? 'negative' : ''}`}>
            {netExposureSide} {formatDisplayCompactMoney(Math.abs(netExposure))}
          </span>
        </div>
        <div className="summary-compact-item">
          <span className="summary-label">持仓</span>
          <span className="summary-value mono">{positionCount}</span>
        </div>
        <div className="summary-compact-item">
          <span className="summary-label">挂单</span>
          <span className="summary-value mono">{orderCount}</span>
        </div>
        <div className="summary-compact-item">
          <span className="summary-label">子账户</span>
          <span className="summary-value mono">{visibleSubaccountCount}</span>
        </div>
        <div className="summary-compact-item summary-refresh-item">
          <span className="summary-label">上次刷新</span>
          <span className="summary-value mono">{formatTime(lastUpdatedAt)}</span>
        </div>
      </div>
    </div>
  );
}
