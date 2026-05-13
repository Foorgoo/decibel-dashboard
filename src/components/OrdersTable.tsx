import { Suspense, lazy, useState } from 'react';
import { useDashboardStore } from '../store';
import { MarketLabel } from './MarketLabel';
import { IS_TRADING_MODE } from '../config/appMode';
import { formatDisplayMarketPrice, formatDisplayMarketSize, formatDisplayMarketValue, formatDisplaySignedMoney } from '../utils/displayFormat';

const CancelOrderAction = lazy(() => import('../features/trading/CancelOrderAction').then((module) => ({
  default: module.CancelOrderAction,
})));

const formatAddress = (address?: string) => {
  if (!address) return '-';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const formatAliasAddress = (address?: string) => {
  if (!address) return '-';
  return address.slice(0, 6);
};
const normalizeSubaccount = (value: unknown) => String(value || '').toLowerCase();

const getSubaccountLabel = (order: any) => {
  const address = order.subaccount || '';
  const addressLabel = order.subaccount_name ? formatAliasAddress(address) : formatAddress(address);
  return order.subaccount_name ? `${order.subaccount_name} (${addressLabel})` : addressLabel;
};

const pickFirst = (source: any, keys: string[]) => {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const normalizeTimestamp = (value: unknown) => {
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue > 10_000_000_000 ? numericValue : numericValue * 1000;
  }

  const parsedValue = Date.parse(String(value || ''));
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const getOrderTimestamp = (order: any) => normalizeTimestamp(pickFirst(order, [
  'unix_ms',
  'unixMs',
  'timestamp',
  'created_at',
  'createdAt',
  'order_time',
  'orderTime',
  'created_unix_ms',
  'createdUnixMs',
  'transaction_unix_ms',
  'transactionUnixMs',
  'block_timestamp',
  'blockTimestamp',
]));

const formatOrderTime = (timestamp: number) => (
  timestamp ? new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }) : '-'
);

const getReduceOnly = (order: any) => {
  const value = pickFirst(order, [
    'reduce_only',
    'reduceOnly',
    'is_reduce_only',
    'isReduceOnly',
    'reduce_only_order',
    'is_reduction',
  ]);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  if (typeof value === 'number') return value === 1;
  return null;
};

const getOrderSide = (order: any) => {
  const rawDirection = String(order.order_direction || order.side || order.direction || '').trim();
  const normalizedDirection = rawDirection.replace(/[\s_-]+/g, '').toLowerCase();

  if (normalizedDirection === 'openlong' || normalizedDirection === 'closeshort') {
    return { side: 'buy', label: rawDirection || 'BUY' };
  }
  if (normalizedDirection === 'closelong' || normalizedDirection === 'openshort') {
    return { side: 'sell', label: rawDirection || 'SELL' };
  }
  if (order.is_buy === true || normalizedDirection.includes('buy')) {
    return { side: 'buy', label: rawDirection || 'BUY' };
  }
  if (order.is_buy === false || normalizedDirection.includes('sell')) {
    return { side: 'sell', label: rawDirection || 'SELL' };
  }

  return { side: 'unknown', label: rawDirection || '-' };
};

const getOrderSize = (order: any) => Math.abs(Number(order.remaining_size || order.size || 0));

const formatOrderSize = (order: any, markets: any[]) => {
  const size = Number(order.remaining_size || order.size || 0);
  return formatDisplayMarketSize(size, order, markets);
};

const getOrderPnl = (order: any, positions: any[]) => {
  const orderPrice = Number(order.price || 0);
  const orderSize = getOrderSize(order);
  if (!Number.isFinite(orderPrice) || orderPrice <= 0 || orderSize <= 0) return null;

  const orderMarket = String(order.market || '').toLowerCase();
  const orderSubaccount = String(order.subaccount || '').toLowerCase();
  const position = positions.find((pos: any) => (
    String(pos.market || '').toLowerCase() === orderMarket
      && String(pos.subaccount || '').toLowerCase() === orderSubaccount
      && Number(pos.size || 0) !== 0
  ));
  if (!position) return null;

  const entryPrice = Number(position.entry_price || position.avg_entry_price || position.entry_px || 0);
  const positionSize = Number(position.size || 0);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(positionSize) || positionSize === 0) return null;

  const orderSide = getOrderSide(order).side;
  const isClosingLong = positionSize > 0 && orderSide === 'sell';
  const isClosingShort = positionSize < 0 && orderSide === 'buy';
  if (!isClosingLong && !isClosingShort) return null;

  const sideMultiplier = positionSize > 0 ? 1 : -1;
  return (orderPrice - entryPrice) * orderSize * sideMultiplier;
};

type SortKey = 'time' | 'market' | 'subaccount' | 'type' | 'side' | 'size' | 'value' | 'price' | 'pnl' | 'reduceOnly' | 'status';
type SortDirection = 'asc' | 'desc';

interface OrdersTableProps {
  embedded?: boolean;
}

export function OrdersTable({ embedded = false }: OrdersTableProps) {
  const { openOrders, positions, markets } = useDashboardStore();
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [hoveredSubaccount, setHoveredSubaccount] = useState('');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => current === 'desc' ? 'asc' : 'desc');
      return;
    }
    setSortKey(key);
    setSortDirection(['market', 'subaccount', 'type', 'side', 'status', 'reduceOnly'].includes(key) ? 'asc' : 'desc');
  };

  const getSortValue = (order: any, key: SortKey) => {
    const side = getOrderSide(order);

    switch (key) {
      case 'time':
        return getOrderTimestamp(order);
      case 'market':
        return order.market_name || order.market || '';
      case 'subaccount':
        return getSubaccountLabel(order);
      case 'type':
        return order.order_type || '';
      case 'side':
        return side.label;
      case 'size':
        return getOrderSize(order);
      case 'value':
        return Number(order.value || 0);
      case 'price':
        return Number(order.price || 0);
      case 'pnl':
        return getOrderPnl(order, positions) ?? Number.NEGATIVE_INFINITY;
      case 'reduceOnly':
        return getReduceOnly(order) === true ? 1 : getReduceOnly(order) === false ? 0 : -1;
      case 'status':
        return order.status || 'open';
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
  
  const orders = (Array.isArray(openOrders) ? openOrders : [])
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

  if (orders.length === 0) {
    const emptyContent = (
      <>
        {!embedded && (
          <div className="section-header">
            <h2 className="section-title">订单</h2>
          </div>
        )}
        <div className="empty-state">
          <p>暂无挂单</p>
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
          <h2 className="section-title">订单</h2>
        </div>
      )}
      <div className="table-scroll">
        <table className="data-table orders-table">
          <thead>
            <tr className="table-header-row">
              <th>{renderSortHeader('subaccount', '子账户')}</th>
              <th>{renderSortHeader('time', '订单时间')}</th>
              <th>{renderSortHeader('market', '市场币种')}</th>
              <th>{renderSortHeader('type', '类型')}</th>
              <th>{renderSortHeader('side', '方向')}</th>
              <th>{renderSortHeader('size', '数量')}</th>
              <th>{renderSortHeader('value', '价值')}</th>
              <th>{renderSortHeader('price', '价格')}</th>
              <th>{renderSortHeader('pnl', '盈亏')}</th>
              <th>{renderSortHeader('reduceOnly', '仅减仓')}</th>
              <th>{renderSortHeader('status', '状态')}</th>
              {IS_TRADING_MODE && <th>操作</th>}
            </tr>
          </thead>
          <tbody>
            {orders.map((order, idx) => {
              const orderSide = getOrderSide(order);
              const status = (order.status || 'open').toLowerCase();
              const marketName = order.market_name || order.market?.slice(0, 10) || 'Unknown';
              const orderId = String(order.order_id || '');
              const value = Number(order.value || 0);
              const pnl = getOrderPnl(order, positions);
              const timestamp = getOrderTimestamp(order);
              const reduceOnly = getReduceOnly(order);
              const normalizedSubaccount = normalizeSubaccount(order.subaccount);
              return (
                <tr
                  key={orderId || `${order.market || 'order'}-${idx}`}
                  className={`table-row${hoveredSubaccount && hoveredSubaccount === normalizedSubaccount ? ' table-row-linked' : ''}`}
                >
                  <td className="mono subaccount-cell" title={order.subaccount}>
                    <span
                      onMouseEnter={() => setHoveredSubaccount(normalizedSubaccount)}
                      onMouseLeave={() => setHoveredSubaccount('')}
                    >
                      {getSubaccountLabel(order)}
                    </span>
                  </td>
                  <td className="mono">{formatOrderTime(timestamp)}</td>
                  <td>
                    <MarketLabel marketName={marketName} />
                  </td>
                  <td>
                    <span className="order-type-badge">{order.order_type || '-'}</span>
                  </td>
                  <td>
                    <span className={`side-badge ${orderSide.side}`}>
                      {orderSide.label}
                    </span>
                  </td>
                  <td className="mono">{formatOrderSize(order, markets)}</td>
                  <td className="mono">{value > 0 ? formatDisplayMarketValue(value) : '-'}</td>
                  <td className="mono">
                    {Number(order.price || 0) > 0 ? formatDisplayMarketPrice(order.price, order, markets) : 'Market'}
                  </td>
                  <td className={`mono ${pnl === null ? 'text-muted' : pnl >= 0 ? 'positive' : 'negative'}`}>
                    {pnl === null ? '-' : formatDisplaySignedMoney(pnl)}
                  </td>
                  <td>
                    {reduceOnly === null ? '-' : (
                      <span className={`status-badge ${reduceOnly ? 'open' : 'unknown'}`}>
                        {reduceOnly ? '是' : '否'}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${status}`}>
                      {order.status || 'open'}
                    </span>
                  </td>
                  {IS_TRADING_MODE && (
                    <td>
                      <Suspense fallback={<span className="text-muted">-</span>}>
                        <CancelOrderAction order={order} />
                      </Suspense>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );

  return embedded ? content : (
    <div className="chart-section">
      {content}
    </div>
  );
}
