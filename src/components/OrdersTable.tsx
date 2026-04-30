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

const getSubaccountLabel = (order: any) => {
  const address = order.subaccount || '';
  const addressLabel = formatAddress(address);
  return order.subaccount_name ? `${order.subaccount_name} (${addressLabel})` : addressLabel;
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

type SortKey = 'market' | 'subaccount' | 'orderId' | 'type' | 'side' | 'size' | 'value' | 'price' | 'status';
type SortDirection = 'asc' | 'desc';

interface OrdersTableProps {
  embedded?: boolean;
}

export function OrdersTable({ embedded = false }: OrdersTableProps) {
  const { openOrders } = useDashboardStore();
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => current === 'desc' ? 'asc' : 'desc');
      return;
    }
    setSortKey(key);
    setSortDirection(['market', 'subaccount', 'orderId', 'type', 'side', 'status'].includes(key) ? 'asc' : 'desc');
  };

  const getSortValue = (order: any, key: SortKey) => {
    const side = getOrderSide(order);

    switch (key) {
      case 'market':
        return order.market_name || order.market || '';
      case 'subaccount':
        return getSubaccountLabel(order);
      case 'orderId':
        return String(order.order_id || '');
      case 'type':
        return order.order_type || '';
      case 'side':
        return side.label;
      case 'size':
        return Number(order.remaining_size || order.size || 0);
      case 'value':
        return Number(order.value || 0);
      case 'price':
        return Number(order.price || 0);
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
        <table className="data-table">
          <thead>
            <tr className="table-header-row">
              <th>{renderSortHeader('market', '市场币种')}</th>
              <th>{renderSortHeader('subaccount', '子账户')}</th>
              <th>{renderSortHeader('orderId', '订单ID')}</th>
              <th>{renderSortHeader('type', '类型')}</th>
              <th>{renderSortHeader('side', '方向')}</th>
              <th>{renderSortHeader('size', '数量')}</th>
              <th>{renderSortHeader('value', '价值')}</th>
              <th>{renderSortHeader('price', '价格')}</th>
              <th>{renderSortHeader('status', '状态')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, idx) => {
              const orderSide = getOrderSide(order);
              const status = (order.status || 'open').toLowerCase();
              const marketName = order.market_name || order.market?.slice(0, 10) || 'Unknown';
              const orderId = String(order.order_id || '');
              const value = Number(order.value || 0);
              return (
                <tr key={orderId || `${order.market || 'order'}-${idx}`} className="table-row">
                  <td>
                    <MarketLabel marketName={marketName} />
                  </td>
                  <td className="mono subaccount-cell" title={order.subaccount}>
                    {getSubaccountLabel(order)}
                  </td>
                  <td className="mono order-id-cell">
                    {orderId ? `${orderId.slice(0, 10)}...` : '-'}
                  </td>
                  <td>
                    <span className="order-type-badge">{order.order_type || '-'}</span>
                  </td>
                  <td>
                    <span className={`side-badge ${orderSide.side}`}>
                      {orderSide.label}
                    </span>
                  </td>
                  <td className="mono">{NUMBER.format(Number(order.remaining_size || order.size || 0))}</td>
                  <td className="mono">{value > 0 ? CURRENCY.format(value) : '-'}</td>
                  <td className="mono">
                    {Number(order.price || 0) > 0 ? CURRENCY.format(Number(order.price || 0)) : 'Market'}
                  </td>
                  <td>
                    <span className={`status-badge ${status}`}>
                      {order.status || 'open'}
                    </span>
                  </td>
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
