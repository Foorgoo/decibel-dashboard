import { useState } from 'react';
import { useDashboardStore } from '../store';
import { MarketLabel } from './MarketLabel';
import { PositionPricePanel } from './PositionPricePanel';

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

const getSubaccountLabel = (pos: any) => {
  const address = pos.subaccount || '';
  const addressLabel = formatAddress(address);
  return pos.subaccount_name ? `${pos.subaccount_name} (${addressLabel})` : addressLabel;
};

const getPositionLeverage = (pos: any) => {
  const leverage = Number(pos.user_leverage || pos.leverage || 0);
  return Number.isFinite(leverage) && leverage > 0 ? leverage : null;
};

const getPositionMargin = (pos: any) => {
  const size = Math.abs(Number(pos.size || 0));
  const markPrice = Number(pos.mark_price || pos.mark_px || 0);
  const leverage = getPositionLeverage(pos);

  if (!size || !markPrice || !leverage) return null;
  return (size * markPrice) / leverage;
};

const getMarginMode = (pos: any) => {
  if (pos.is_isolated === true) return '逐仓';
  if (pos.is_isolated === false) return '全仓';
  return '';
};

type SortKey = 'market' | 'subaccount' | 'side' | 'size' | 'value' | 'entry' | 'mark' | 'pnl' | 'liq' | 'margin' | 'funding';
type SortDirection = 'asc' | 'desc';

interface PositionsTableProps {
  embedded?: boolean;
}

export function PositionsTable({ embedded = false }: PositionsTableProps) {
  const { positions } = useDashboardStore();
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedPosition, setSelectedPosition] = useState<any | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => current === 'desc' ? 'asc' : 'desc');
      return;
    }
    setSortKey(key);
    setSortDirection(key === 'market' || key === 'subaccount' || key === 'side' ? 'asc' : 'desc');
  };

  const getSortValue = (pos: any, key: SortKey) => {
    const size = Number(pos.size || 0);
    const markPrice = Number(pos.mark_price || pos.mark_px || 0);
    const entryPrice = Number(pos.entry_price || 0);
    const pnl = Number.isFinite(Number(pos.pnl)) ? Number(pos.pnl) : markPrice > 0 && entryPrice > 0
      ? (markPrice - entryPrice) * Math.abs(size) * (size > 0 ? 1 : -1)
      : Number(pos.unrealized_funding || 0);

    switch (key) {
      case 'market':
        return pos.market_name || pos.market || '';
      case 'subaccount':
        return getSubaccountLabel(pos);
      case 'side':
        return size > 0 ? 'long' : 'short';
      case 'size':
        return Math.abs(size);
      case 'value':
        return Number(pos.value || Math.abs(size) * markPrice);
      case 'entry':
        return entryPrice;
      case 'mark':
        return markPrice;
      case 'pnl':
        return pnl;
      case 'liq':
        return Number(pos.estimated_liquidation_price || 0);
      case 'margin':
        return getPositionMargin(pos) || 0;
      case 'funding':
        return Number(pos.unrealized_funding || pos.unrealized_funding_cost || pos.funding || 0);
      default:
        return 0;
    }
  };

  const renderSortHeader = (key: SortKey, label: string) => (
    <button className="table-sort-btn" onClick={() => handleSort(key)}>
      {label}
      <span className="sort-indicator">{sortKey === key ? (sortDirection === 'desc' ? '↓' : '↑') : ''}</span>
    </button>
  );
  
  const posList = (Array.isArray(positions) ? positions : [])
    .slice()
    .sort((a, b) => {
      const aValue = getSortValue(a, sortKey);
      const bValue = getSortValue(b, sortKey);
      const direction = sortDirection === 'desc' ? -1 : 1;

      if (typeof aValue === 'string' || typeof bValue === 'string') {
        return String(aValue).localeCompare(String(bValue)) * direction;
      }

      return (Number(aValue) - Number(bValue)) * direction;
    });

  if (posList.length === 0) {
    const emptyContent = (
      <>
        {!embedded && (
          <div className="section-header">
            <h2 className="section-title">持仓</h2>
          </div>
        )}
        <div className="empty-state">
          <p>暂无持仓</p>
        </div>
      </>
    );

    return embedded ? emptyContent : (
      <div className="chart-section">
        {emptyContent}
      </div>
    );
  }

  const content = (
    <>
      {!embedded && (
        <div className="section-header">
          <h2 className="section-title">持仓</h2>
        </div>
      )}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr className="table-header-row">
              <th>{renderSortHeader('market', '市场币种')}</th>
              <th>{renderSortHeader('subaccount', '子账户')}</th>
              <th>{renderSortHeader('side', '方向')}</th>
              <th>{renderSortHeader('size', '数量')}</th>
              <th>{renderSortHeader('value', '价值')}</th>
              <th>{renderSortHeader('entry', '开仓价')}</th>
              <th>{renderSortHeader('mark', '现价')}</th>
              <th>{renderSortHeader('pnl', '盈亏')}</th>
              <th>{renderSortHeader('liq', '清算价')}</th>
              <th>{renderSortHeader('margin', '保证金')}</th>
              <th>{renderSortHeader('funding', '资金费')}</th>
            </tr>
          </thead>
          <tbody>
            {posList.map((pos, idx) => {
              const size = Number(pos.size || 0);
              const entryPrice = Number(pos.entry_price || 0);
              const markPrice = Number(pos.mark_price || pos.mark_px || 0);
              const liqPrice = Number(pos.estimated_liquidation_price || 0);
              const value = Number(pos.value || Math.abs(size) * markPrice);
              const leverage = getPositionLeverage(pos);
              const margin = getPositionMargin(pos);
              const marginMode = getMarginMode(pos);
              const funding = Number(pos.unrealized_funding || pos.unrealized_funding_cost || pos.funding || 0);
              const pnl = Number.isFinite(Number(pos.pnl))
                ? Number(pos.pnl)
                : (markPrice > 0 && entryPrice > 0)
                  ? (markPrice - entryPrice) * Math.abs(size) * (size > 0 ? 1 : -1)
                  : Number(pos.unrealized_funding || 0);
              
              const side = size > 0 ? 'long' : 'short';
              const marketName = pos.market_name || pos.market?.slice(0, 10) || 'Unknown';
              
              return (
                <tr key={`${pos.market || 'position'}-${idx}`} className="table-row">
                  <td>
                    <button className="market-trigger" onClick={() => setSelectedPosition(pos)}>
                      <MarketLabel marketName={marketName} />
                    </button>
                  </td>
                  <td className="mono subaccount-cell" title={pos.subaccount}>
                    {getSubaccountLabel(pos)}
                  </td>
                  <td>
                    <span className={`side-badge ${side}`}>
                      {side.toUpperCase()}
                    </span>
                  </td>
                  <td className="mono">{NUMBER.format(Math.abs(size))}</td>
                  <td className="mono">{value > 0 ? CURRENCY.format(value) : '-'}</td>
                  <td className="mono">{CURRENCY.format(entryPrice)}</td>
                  <td className="mono">{markPrice > 0 ? CURRENCY.format(markPrice) : '-'}</td>
                  <td className={`mono ${pnl >= 0 ? 'positive' : 'negative'}`}>
                    {pnl >= 0 ? '+' : ''}{CURRENCY.format(pnl)}
                  </td>
                  <td className="mono">{liqPrice > 0 ? CURRENCY.format(liqPrice) : '-'}</td>
                  <td className="mono">
                    {margin ? (
                      <span>
                        {CURRENCY.format(margin)}
                        <span className="cell-subtext">{marginMode}{marginMode && leverage ? ' · ' : ''}{leverage ? `${leverage}x` : ''}</span>
                      </span>
                    ) : '-'}
                  </td>
                  <td className={`mono ${funding <= 0 ? 'positive' : 'negative'}`}>
                    {funding ? CURRENCY.format(funding) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selectedPosition && (
        <PositionPricePanel
          position={selectedPosition}
          onClose={() => setSelectedPosition(null)}
        />
      )}
    </>
  );

  return embedded ? content : (
    <div className="chart-section">
      {content}
    </div>
  );
}
