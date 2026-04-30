import { useEffect, useMemo, useState } from 'react';
import { MarketLabel } from './MarketLabel';
import { createDecibelClient } from '../api/client';
import { useDashboardStore } from '../store';

const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INTERVALS = [
  { label: '15m', value: '15m', limit: 96, stepMs: 15 * 60 * 1000 },
  { label: '1h', value: '1h', limit: 120, stepMs: 60 * 60 * 1000 },
  { label: '4h', value: '4h', limit: 120, stepMs: 4 * 60 * 60 * 1000 },
  { label: '1d', value: '1d', limit: 90, stepMs: 24 * 60 * 60 * 1000 },
] as const;

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const MAX_CANDLES = 1000;

type IntervalValue = typeof INTERVALS[number]['value'];

interface PricePoint {
  time: number;
  close: number;
}

interface PositionPricePanelProps {
  position: any;
  onClose: () => void;
}

const getDomain = (points: PricePoint[], levels: number[]) => {
  const values = [
    ...points.map((point) => point.close),
    ...levels.filter((level) => Number.isFinite(level) && level > 0),
  ];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min || Math.max(max, 1) * 0.01) * 0.08;
  return {
    min: min - padding,
    max: max + padding,
  };
};

const buildPath = (points: PricePoint[], width: number, height: number, min: number, max: number) => {
  if (points.length < 2) return '';
  const range = max - min || 1;

  return points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((point.close - min) / range) * height;
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
};

const getLevelY = (level: number, min: number, max: number, height: number) => {
  const range = max - min || 1;
  return height - ((level - min) / range) * height;
};

const formatAxisPrice = (value: number) => {
  if (Math.abs(value) >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return value.toLocaleString('en-US', { maximumFractionDigits: 5 });
};

const formatAxisTime = (timestamp: number, interval: IntervalValue) => {
  const date = new Date(timestamp);
  if (interval === '1d') {
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const applyWheelZoom = (
  deltaY: number,
  setter: React.Dispatch<React.SetStateAction<number>>,
) => {
  const direction = deltaY < 0 ? 1 : -1;
  const step = Math.min(0.2, Math.max(0.08, Math.abs(deltaY) / 800));
  setter((current) => {
    const nextZoom = direction > 0 ? current * (1 + step) : current / (1 + step);
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2))));
  });
};

export function PositionPricePanel({ position, onClose }: PositionPricePanelProps) {
  const { apiKey } = useDashboardStore();
  const [interval, setIntervalValue] = useState<IntervalValue>('15m');
  const [priceZoom, setPriceZoom] = useState(1);
  const [timeZoom, setTimeZoom] = useState(1);
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  const marketName = position.market_name || position.market?.slice(0, 10) || 'Unknown';
  const marketAddress = String(position.market || '');
  const size = Number(position.size || 0);
  const entryPrice = Number(position.entry_price || 0);
  const markPrice = Number(position.mark_price || position.mark_px || 0);
  const liqPrice = Number(position.estimated_liquidation_price || 0);
  const leverage = Number(position.user_leverage || position.leverage || 0);
  const pnl = Number(position.pnl || position.unrealized_pnl || 0);
  const side = size >= 0 ? 'LONG' : 'SHORT';
  const activeInterval = INTERVALS.find((item) => item.value === interval) || INTERVALS[1];
  const keyToUse = typeof window !== 'undefined'
    ? localStorage.getItem('decibel_api_key_mainnet') || apiKey
    : apiKey;

  useEffect(() => {
    const abortController = new AbortController();
    const loadKlines = async () => {
      setStatus('loading');
      setError('');
      try {
        if (!keyToUse) {
          throw new Error('请先配置主网 API Key');
        }
        if (!marketAddress) {
          throw new Error('缺少市场地址，无法读取 K 线');
        }
        const endTime = Date.now();
        const historyLimit = Math.min(MAX_CANDLES, Math.ceil(activeInterval.limit / MIN_ZOOM));
        const startTime = endTime - activeInterval.stepMs * historyLimit;
        const client = createDecibelClient(keyToUse, abortController.signal);
        const result = await client.getCandlesticks(marketAddress, activeInterval.value, startTime, endTime);
        const nextPoints = result
          .map((item) => ({
              time: Number(item.t),
              close: Number(item.c),
            })).filter((point) => Number.isFinite(point.time) && Number.isFinite(point.close) && point.close > 0)
            .sort((a, b) => a.time - b.time);

        if (nextPoints.length < 2) {
          throw new Error('官方 K 线数据不足');
        }
        setPoints(nextPoints);
        setStatus('ready');
      } catch (err: any) {
        if (abortController.signal.aborted) return;
        setPoints([]);
        setStatus('error');
        setError(err?.message || '行情读取失败');
      }
    };

    loadKlines();
    return () => abortController.abort();
  }, [activeInterval.limit, activeInterval.stepMs, activeInterval.value, keyToUse, marketAddress]);

  const chart = useMemo(() => {
    const width = 640;
    const height = 320;
    const visibleCount = Math.min(points.length, Math.max(12, Math.floor(activeInterval.limit / timeZoom)));
    const visiblePoints = points.slice(-visibleCount);
    const levels = [
      { label: '开仓', value: entryPrice, className: 'entry' },
      { label: '现价', value: markPrice, className: 'mark' },
      { label: '清算', value: liqPrice, className: 'liq' },
    ].filter((level) => level.value > 0);
    const domain = getDomain(visiblePoints, levels.map((level) => level.value));
    const center = (domain.min + domain.max) / 2;
    const halfRange = ((domain.max - domain.min) / 2) / priceZoom;
    const zoomedDomain = {
      min: center - halfRange,
      max: center + halfRange,
    };
    const path = buildPath(visiblePoints, width, height, zoomedDomain.min, zoomedDomain.max);
    const priceTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const value = zoomedDomain.max - (zoomedDomain.max - zoomedDomain.min) * ratio;
      return {
        y: height * ratio,
        value,
      };
    });
    const timeTicks = visiblePoints.length > 0
      ? [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const index = Math.min(visiblePoints.length - 1, Math.round((visiblePoints.length - 1) * ratio));
          return {
            x: width * ratio,
            value: visiblePoints[index]?.time || 0,
          };
        })
      : [];

    return { width, height, path, levels, domain: zoomedDomain, priceTicks, timeTicks };
  }, [activeInterval.limit, entryPrice, liqPrice, markPrice, points, priceZoom, timeZoom]);

  return (
    <div className="price-panel-overlay" onClick={onClose}>
      <aside className="price-panel" onClick={(event) => event.stopPropagation()}>
        <div className="price-panel-header">
          <div>
            <div className="price-panel-market">
              <MarketLabel marketName={marketName} />
              <span className={`side-badge ${side === 'LONG' ? 'long' : 'short'}`}>{side}</span>
            </div>
            <div className="price-panel-subtitle">行情源: Decibel 官方 K 线 · {marketAddress ? `${marketAddress.slice(0, 8)}...${marketAddress.slice(-6)}` : '-'}</div>
          </div>
          <button className="panel-close-btn" onClick={onClose}>关闭</button>
        </div>

        <div className="price-panel-stats">
          <div>
            <span>开仓价</span>
            <strong className="mono">{entryPrice > 0 ? CURRENCY.format(entryPrice) : '-'}</strong>
          </div>
          <div>
            <span>现价</span>
            <strong className="mono">{markPrice > 0 ? CURRENCY.format(markPrice) : '-'}</strong>
          </div>
          <div>
            <span>清算价</span>
            <strong className="mono">{liqPrice > 0 ? CURRENCY.format(liqPrice) : '-'}</strong>
          </div>
          <div>
            <span>杠杆</span>
            <strong className="mono">{leverage > 0 ? `${leverage}x` : '-'}</strong>
          </div>
          <div>
            <span>未实现盈亏</span>
            <strong className={`mono ${pnl >= 0 ? 'positive' : 'negative'}`}>{pnl >= 0 ? '+' : ''}{CURRENCY.format(pnl)}</strong>
          </div>
        </div>

        <div className="price-panel-toolbar">
          <div className="price-panel-range-btns">
            {INTERVALS.map((item) => (
              <button
                key={item.value}
                className={`time-range-btn ${interval === item.value ? 'active' : ''}`}
                onClick={() => setIntervalValue(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="price-panel-zoom">
            <span>纵 {priceZoom.toFixed(2)}x</span>
            <span>横 {timeZoom.toFixed(2)}x</span>
            <button
              onClick={() => {
                setPriceZoom(1);
                setTimeZoom(1);
              }}
            >
              重置
            </button>
          </div>
        </div>

        <div
          className="price-chart-shell"
          onWheel={(event) => {
            event.preventDefault();
            applyWheelZoom(event.deltaY, setTimeZoom);
          }}
        >
          {status === 'loading' && <div className="price-chart-state">行情加载中...</div>}
          {status === 'error' && (
            <div className="price-chart-state">
              <span>{error}</span>
              <small>请确认 API Key 有效，并且该市场已有足够的官方 K 线数据。</small>
            </div>
          )}
          {status === 'ready' && (
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="price-chart" role="img" aria-label={`${marketName} price chart`}>
              {chart.priceTicks.map((tick) => (
                <line key={`grid-${tick.y}`} x1="0" x2={chart.width} y1={tick.y} y2={tick.y} className="price-grid-line" />
              ))}
              <path d={chart.path} className="price-chart-line" />
              {chart.levels.map((level) => {
                const y = getLevelY(level.value, chart.domain.min, chart.domain.max, chart.height);
                return (
                  <g key={level.label} className={`price-level price-level-${level.className}`}>
                    <line x1="0" x2={chart.width} y1={y} y2={y} />
                    <text x={chart.width - 4} y={Math.max(12, y - 5)}>{level.label} {CURRENCY.format(level.value)}</text>
                  </g>
                );
              })}
            </svg>
          )}
          {status === 'ready' && (
            <>
              <div
                className="price-axis"
                onWheel={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  applyWheelZoom(event.deltaY, setPriceZoom);
                }}
              >
                {chart.priceTicks.map((tick) => (
                  <span
                    key={`price-${tick.y}`}
                    style={{ top: `${(tick.y / chart.height) * 100}%` }}
                  >
                    {formatAxisPrice(tick.value)}
                  </span>
                ))}
              </div>
              <div className="time-axis">
                {chart.timeTicks.map((tick) => (
                  <span key={`time-${tick.x}`} style={{ left: `${(tick.x / chart.width) * 100}%` }}>
                    {formatAxisTime(tick.value, interval)}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
