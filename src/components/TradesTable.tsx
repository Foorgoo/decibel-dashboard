import { useState } from 'react';
import { useDashboardStore } from '../store';
import { MarketLabel } from './MarketLabel';

const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUMBER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const formatAddress = (address?: string) => {
  if (!address) return '-';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const getSubaccountLabel = (trade: any) => {
  const address = trade.subaccount || '';
  const addressLabel = formatAddress(address);
  return trade.subaccount_name ? `${trade.subaccount_name} (${addressLabel})` : addressLabel;
};

const getTradeTimestamp = (trade: any) => {
  return Number(trade.timestamp || 0);
};

const getTradeSide = (trade: any) => {
  return trade.side || '-';
};

const SOURCE_LABELS: Record<string, string> = {
  orderfill: '订单成交',
  liquidation: '强平',
  margincall: '追加保证金',
  autodeleverage: '自动减仓',
  adl: '自动减仓',
  funding: '资金费',
  settlement: '结算',
};

const SOURCE_SEVERITY: Record<string, 'warning' | 'danger'> = {
  margincall: 'warning',
  liquidation: 'danger',
  autodeleverage: 'danger',
  adl: 'danger',
};

const normalizeSource = (source: string) => source.trim().replace(/[\s_-]+/g, '').toLowerCase();

const getSourceLabel = (source?: string) => {
  if (!source) return '-';
  const normalizedSource = source.trim();
  const compactSource = normalizeSource(source);
  return SOURCE_LABELS[compactSource] || normalizedSource;
};

const getSourceClassName = (source?: string) => {
  if (!source) return 'order-type-badge';
  const severity = SOURCE_SEVERITY[normalizeSource(source)];
  return `order-type-badge${severity ? ` source-${severity}` : ''}`;
};

export function TradesTable() {
  const { trades } = useDashboardStore();
  const [visibleCount, setVisibleCount] = useState(10);

  const rows = (Array.isArray(trades) ? trades : [])
    .slice()
    .sort((a, b) => getTradeTimestamp(b) - getTradeTimestamp(a))
    .slice(0, 200);
  const visibleRows = rows.slice(0, visibleCount);
  const hasMore = visibleCount < rows.length;

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <p>暂无最近成交</p>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr className="table-header-row">
            <th>时间</th>
            <th>市场币种</th>
            <th>子账户</th>
            <th>方向</th>
            <th>来源</th>
            <th>数量</th>
            <th>价格</th>
            <th>价值</th>
            <th>手续费</th>
            <th>平仓盈亏</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((trade: any, idx) => {
            const timestamp = getTradeTimestamp(trade);
            const marketName = trade.market_name || trade.market?.slice(0, 10) || 'Unknown';
            const side = getTradeSide(trade);
            const source = String(trade.source || '');
            const value = Number(trade.value || 0);
            const realizedPnl = Number(trade.realized_pnl || 0);
            const fee = Number(trade.fee || 0);

            return (
              <tr key={trade.trade_id || trade.id || `${trade.market || 'trade'}-${timestamp}-${idx}`} className="table-row">
                <td className="mono">
                  {timestamp ? new Date(timestamp).toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  }) : '-'}
                </td>
                <td>
                  <MarketLabel marketName={marketName} />
                </td>
                <td className="mono subaccount-cell" title={trade.subaccount}>
                  {getSubaccountLabel(trade)}
                </td>
                <td>
                  <span className={`side-badge ${side === 'BUY' ? 'buy' : side === 'SELL' ? 'sell' : ''}`}>
                    {side}
                  </span>
                </td>
                <td>
                  <span className={getSourceClassName(source)}>{getSourceLabel(source)}</span>
                </td>
                <td className="mono">{NUMBER.format(Number(trade.size || 0))}</td>
                <td className="mono">{Number(trade.price || 0) > 0 ? CURRENCY.format(Number(trade.price)) : '-'}</td>
                <td className="mono">{value > 0 ? CURRENCY.format(value) : '-'}</td>
                <td className="mono">{fee ? CURRENCY.format(fee) : '-'}</td>
                <td className={`mono ${realizedPnl >= 0 ? 'positive' : 'negative'}`}>
                  {realizedPnl ? `${realizedPnl > 0 ? '+' : ''}${CURRENCY.format(realizedPnl)}` : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > 10 && (
        <div className="table-footer-actions">
          {hasMore ? (
            <button
              className="btn btn-secondary btn-small"
              onClick={() => setVisibleCount((current) => Math.min(current + 10, rows.length, 200))}
            >
              查看更多 ({Math.min(10, rows.length - visibleCount)})
            </button>
          ) : (
            <button className="btn btn-secondary btn-small" onClick={() => setVisibleCount(10)}>
              收起
            </button>
          )}
        </div>
      )}
    </div>
  );
}
