import { useState } from 'react';
import {
  Cell,
  Sector,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useDashboardStore } from '../store';
import { getMarketIcon, getMarketSymbol } from '../utils/marketIcons';
import { formatCurrency, formatSignedCurrency } from '../utils/numberFormat';

const PERCENT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const COLORS = ['#38bdf8', '#00d4aa', '#ffb800', '#a855f7', '#ff4757', '#7c8cff'];

const renderActiveShape = (props: any) => (
  <Sector
    {...props}
    outerRadius={Number(props.outerRadius || 0) + 5}
    style={{ filter: 'brightness(1.14) drop-shadow(0 6px 10px rgba(0, 0, 0, 0.32))' }}
  />
);

function AllocationTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;
  const icon = getMarketIcon(item.name);

  return (
    <div className="chart-tooltip">
      <div className="allocation-tooltip-title">
        {icon ? (
          <img className="allocation-market-icon" src={icon} alt="" aria-hidden="true" />
        ) : (
          <span className="allocation-market-fallback">{item.name.slice(0, 1)}</span>
        )}
        <span>{item.name}</span>
      </div>
      <div className="mono">{formatCurrency(item.value)} · {PERCENT.format(item.percent)}%</div>
      <div className={`mono ${item.pnl >= 0 ? 'positive' : 'negative'}`}>
        盈亏 {formatSignedCurrency(item.pnl)}
      </div>
      <div className="text-secondary">
        多 {formatCurrency(item.longValue)} · 空 {formatCurrency(item.shortValue)}
      </div>
    </div>
  );
}

export function PositionAllocationChart() {
  const { positions } = useDashboardStore();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const rows = Array.from(
    (Array.isArray(positions) ? positions : [])
      .reduce<Map<string, { value: number; pnl: number; longValue: number; shortValue: number }>>((map, position: any) => {
        const market = getMarketSymbol(position.market_name || position.market).toUpperCase();
        const value = Number(position.value || 0);
        const size = Number(position.size || 0);
        const pnl = Number(position.pnl || position.unrealized_pnl || 0);
        if (!Number.isFinite(value) || value <= 0) return map;
        const existing = map.get(market) || { value: 0, pnl: 0, longValue: 0, shortValue: 0 };
        existing.value += value;
        existing.pnl += Number.isFinite(pnl) ? pnl : 0;
        if (size >= 0) {
          existing.longValue += value;
        } else {
          existing.shortValue += value;
        }
        map.set(market, existing);
        return map;
      }, new Map())
      .entries(),
  )
    .map(([name, row]) => ({ name, ...row }))
    .sort((a, b) => b.value - a.value);

  const total = rows.reduce((sum, item) => sum + item.value, 0);
  const totalPnl = rows.reduce((sum, item) => sum + item.pnl, 0);
  const topRows = rows.slice(0, 5);
  const otherRow = rows.slice(5).reduce((sum, item) => ({
    name: '其他',
    value: sum.value + item.value,
    pnl: sum.pnl + item.pnl,
    longValue: sum.longValue + item.longValue,
    shortValue: sum.shortValue + item.shortValue,
  }), { name: '其他', value: 0, pnl: 0, longValue: 0, shortValue: 0 });
  const data = (otherRow.value > 0 ? [...topRows, otherRow] : topRows)
    .map((item) => ({
      ...item,
      percent: total > 0 ? (item.value / total) * 100 : 0,
    }));

  return (
    <div className="chart-section allocation-section">
      <div className="section-header compact">
        <h2 className="section-title">持仓占比</h2>
        <span className="section-meta">{data.length} 个市场</span>
      </div>

      {data.length === 0 ? (
        <div className="empty-state allocation-empty">
          <p>暂无持仓</p>
        </div>
      ) : (
        <div className="allocation-content">
          <div className="allocation-chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="58%"
                  outerRadius="82%"
                  paddingAngle={2}
                  stroke="rgba(18, 18, 26, 0.9)"
                  strokeWidth={2}
                  activeIndex={activeIndex ?? undefined}
                  activeShape={renderActiveShape}
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {data.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      className="allocation-slice"
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={<AllocationTooltip />}
                  offset={10}
                  wrapperStyle={{ pointerEvents: 'none', zIndex: 20 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="allocation-center">
              <span>总价值</span>
              <strong>{formatCurrency(total)}</strong>
              <span className={totalPnl >= 0 ? 'positive' : 'negative'}>
                {formatSignedCurrency(totalPnl)}
              </span>
            </div>
          </div>

          <div className="allocation-legend">
            {data.map((item, index) => (
              <div key={item.name} className="allocation-legend-row">
                <span className="allocation-dot" style={{ background: COLORS[index % COLORS.length] }} />
                <span className="allocation-market">
                  {getMarketIcon(item.name) ? (
                    <img className="allocation-market-icon" src={getMarketIcon(item.name) || ''} alt="" aria-hidden="true" />
                  ) : (
                    <span className="allocation-market-fallback">{item.name.slice(0, 1)}</span>
                  )}
                  <strong>{item.name}</strong>
                </span>
                <span>{PERCENT.format(item.percent)}%</span>
                <span>{formatCurrency(item.value)}</span>
                <span className={item.pnl >= 0 ? 'positive' : 'negative'}>
                  {formatSignedCurrency(item.pnl)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
