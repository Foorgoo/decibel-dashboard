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
import { normalizeTimestamp, pickFirst } from '../utils/dashboardData';

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

const formatDate = (ts: number, range: string) => {
  const date = new Date(ts);
  if (range === '24h') {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

const formatTooltipDate = (ts: number, range: string) => {
  const date = new Date(ts);
  if (range === '24h') {
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  return date.toLocaleDateString('zh-CN', {
    year: range === 'all' ? 'numeric' : undefined,
    month: '2-digit',
    day: '2-digit',
  });
};

const getLocalDayKey = (ts: number) => {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDailyTicks = (data: { timestamp: number }[], maxTicks: number) => {
  const ticks: number[] = [];
  const seenDays = new Set<string>();

  data.forEach((point) => {
    const dayKey = getLocalDayKey(point.timestamp);
    if (seenDays.has(dayKey)) return;
    seenDays.add(dayKey);
    ticks.push(point.timestamp);
  });

  if (ticks.length <= maxTicks) return ticks;

  const step = Math.ceil(ticks.length / maxTicks);
  return ticks.filter((_, index) => index % step === 0 || index === ticks.length - 1);
};

const getMonthTicks = (data: { timestamp: number }[], maxTicks: number) => {
  const ticks: number[] = [];
  const seenMonths = new Set<string>();

  data.forEach((point) => {
    const date = new Date(point.timestamp);
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    if (seenMonths.has(monthKey)) return;
    seenMonths.add(monthKey);
    ticks.push(point.timestamp);
  });

  if (ticks.length <= maxTicks) return ticks;

  const step = Math.ceil(ticks.length / maxTicks);
  return ticks.filter((_, index) => index % step === 0 || index === ticks.length - 1);
};

const getXAxisTicks = (data: { timestamp: number }[], range: string) => {
  if (range === '24h') return undefined;
  if (range === '7d') return getDailyTicks(data, 8);
  if (range === '30d') return getDailyTicks(data, 7);
  if (range === '90d') return getDailyTicks(data, 7);
  return getMonthTicks(data, 8);
};

function CustomTooltip({
  active,
  payload,
  label,
  range,
  color,
  chartType,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: number | string;
  range: string;
  color: string;
  chartType: 'pnl' | 'account_value';
}) {
  if (!active || !payload?.length) return null;
  const timestamp = Number(label);
  const valueLabel = chartType === 'account_value' ? '账户价值' : '累计已实现盈亏';

  return (
    <div style={{
      background: '#12121a',
      border: '1px solid #1e1e2e',
      borderRadius: '8px',
      padding: '10px 14px',
      fontSize: '13px',
    }}>
      <div className="text-secondary" style={{ marginBottom: '4px' }}>
        {Number.isFinite(timestamp) ? formatTooltipDate(timestamp, range) : label}
      </div>
      <div className="mono" style={{ color }}>
        <span className="text-secondary" style={{ marginRight: 6 }}>{valueLabel}</span>
        {CURRENCY.format(payload[0].value)}
      </div>
    </div>
  );
}

interface PnLChartProps {
  chartType: 'pnl' | 'account_value';
  onChartTypeChange?: (type: 'pnl' | 'account_value') => void;
  onRangeChange?: (range: string) => void;
}

export function PnLChart({ chartType, onChartTypeChange, onRangeChange }: PnLChartProps) {
  const { portfolioData } = useDashboardStore();
  const [selectedRange, setSelectedRange] = useState<string>('24h');
  const chartTitle = chartType === 'account_value' ? '账户价值曲线' : '盈亏图表';
  const lineColor = chartType === 'account_value' ? '#38bdf8' : '#00d4aa';

  const handleClick = (value: string) => {
    setSelectedRange(value);
    onRangeChange?.(value);
  };

  const data = (Array.isArray(portfolioData) ? portfolioData : [])
    .map((d: any) => {
      const timestamp = normalizeTimestamp(pickFirst(d, ['timestamp', 'time', 'created_at', 'date']));
      const value = Number(pickFirst(d, ['data_points', 'value', 'account_value', 'pnl']) ?? 0);
      return { timestamp, value };
    })
    .filter((d) => d.timestamp > 0 && Number.isFinite(d.value))
    .sort((a, b) => a.timestamp - b.timestamp);
  const xAxisTicks = getXAxisTicks(data, selectedRange);

  return (
    <div className="chart-section pnl-chart-section">
      <div className="section-header">
        <h2 className="section-title">{chartTitle}</h2>
        <div className="chart-controls">
          <div className="time-range-btns chart-type-btns">
            <button
              className={`time-range-btn ${chartType === 'pnl' ? 'active' : ''}`}
              onClick={() => onChartTypeChange?.('pnl')}
            >
              盈亏
            </button>
            <button
              className={`time-range-btn ${chartType === 'account_value' ? 'active' : ''}`}
              onClick={() => onChartTypeChange?.('account_value')}
            >
              价值
            </button>
          </div>
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
      </div>

      {data.length === 0 ? (
        <div className="empty-state">
          <p>暂无数据</p>
        </div>
      ) : (
        <div className="pnl-chart-body">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                stroke="#55556a"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                ticks={xAxisTicks}
                tickFormatter={(v) => formatDate(Number(v), selectedRange)}
              />
              <YAxis
                stroke="#55556a"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatAxisCurrency(Number(v))}
                width={72}
              />
              <Tooltip content={<CustomTooltip range={selectedRange} color={lineColor} chartType={chartType} />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: lineColor }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
