import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useDashboardStore } from '../store';

const RANGES: { label: string; value: string }[] = [
  { label: '24小时', value: '24h' },
  { label: '7天', value: '7d' },
  { label: '30天', value: '30d' },
  { label: '90天', value: '90d' },
  { label: '全部', value: 'all' },
];

const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const formatAxisCurrency = (value: number) => {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1_000_000) {
    return `${sign}$${(absValue / 1_000_000).toFixed(absValue >= 10_000_000 ? 0 : 1)}m`;
  }
  if (absValue >= 10_000) {
    return `${sign}$${(absValue / 1_000).toFixed(0)}k`;
  }
  if (absValue >= 1_000) {
    return `${sign}$${(absValue / 1_000).toFixed(1)}k`;
  }
  if (absValue >= 100) {
    return `${sign}$${absValue.toFixed(0)}`;
  }
  if (absValue >= 1) {
    return `${sign}$${absValue.toFixed(1)}`;
  }
  return `${sign}$${absValue.toFixed(2)}`;
};

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  
  return (
    <div style={{
      background: '#12121a',
      border: '1px solid #1e1e2e',
      borderRadius: '8px',
      padding: '10px 14px',
      fontSize: '13px',
    }}>
      <div className="text-secondary" style={{ marginBottom: '4px' }}>
        {label}
      </div>
      <div className="mono" style={{ color: '#00d4aa' }}>
        {CURRENCY.format(payload[0].value)}
      </div>
    </div>
  );
}

interface PnLChartProps {
  onRangeChange?: (range: string) => void;
}

export function PnLChart({ onRangeChange }: PnLChartProps) {
  const { portfolioData } = useDashboardStore();
  const [selectedRange, setSelectedRange] = useState<string>('24h');

  const handleClick = (value: string) => {
    setSelectedRange(value);
    onRangeChange?.(value);
  };

  const formatDate = (ts: number, range: string) => {
    const date = new Date(ts);
    if (range === '24h') {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    if (range === '7d') {
      return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const data = (Array.isArray(portfolioData) ? portfolioData : []).map((d: any) => ({
    ...d,
    value: d.data_points !== undefined ? d.data_points : d.value,
    date: formatDate(d.timestamp, selectedRange),
  }));

  return (
    <div className="chart-section">
      <div className="section-header">
        <h2 className="section-title">盈亏图表</h2>
        <div className="time-range-btns">
          {RANGES.map((r) => (
            <button
              key={r.value}
              className={`time-range-btn ${selectedRange === r.value ? 'active' : ''}`}
              onClick={() => handleClick(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="empty-state">
          <p>暂无数据</p>
        </div>
      ) : (
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis
                dataKey="date"
                stroke="#55556a"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#55556a"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatAxisCurrency(Number(v))}
                width={72}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#00d4aa"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#00d4aa' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
