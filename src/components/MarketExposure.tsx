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

interface ExposureRow {
  marketName: string;
  longValue: number;
  shortValue: number;
  netSize: number;
  totalValue: number;
  pnl: number;
}

export function MarketExposure() {
  const { positions } = useDashboardStore();

  const rows = Array.from(
    positions.reduce<Map<string, ExposureRow>>((map, position: any) => {
      const marketName = position.market_name || position.market?.slice(0, 10) || 'Unknown';
      const size = Number(position.size || 0);
      const value = Number(position.value || 0);
      const pnl = Number(position.pnl || 0);
      const existing = map.get(marketName) || {
        marketName,
        longValue: 0,
        shortValue: 0,
        netSize: 0,
        totalValue: 0,
        pnl: 0,
      };

      if (size >= 0) {
        existing.longValue += value;
      } else {
        existing.shortValue += value;
      }

      existing.netSize += size;
      existing.totalValue += value;
      existing.pnl += pnl;
      map.set(marketName, existing);
      return map;
    }, new Map<string, any>()).values()
  ).sort((a, b) => b.totalValue - a.totalValue);

  if (rows.length === 0) return null;

  return (
    <div className="chart-section">
      <div className="section-header">
        <h2 className="section-title">市场暴露</h2>
      </div>
      <div className="table-scroll">
        <table className="data-table exposure-table">
          <thead>
            <tr className="table-header-row">
              <th>市场币种</th>
              <th>多头价值</th>
              <th>空头价值</th>
              <th>总价值</th>
              <th>净数量</th>
              <th>盈亏</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.marketName} className="table-row">
                <td>
                  <MarketLabel marketName={row.marketName} />
                </td>
                <td className="mono">{row.longValue > 0 ? CURRENCY.format(row.longValue) : '-'}</td>
                <td className="mono">{row.shortValue > 0 ? CURRENCY.format(row.shortValue) : '-'}</td>
                <td className="mono">{CURRENCY.format(row.totalValue)}</td>
                <td className="mono">{NUMBER.format(row.netSize)}</td>
                <td className={`mono ${row.pnl >= 0 ? 'positive' : 'negative'}`}>
                  {row.pnl >= 0 ? '+' : ''}{CURRENCY.format(row.pnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
