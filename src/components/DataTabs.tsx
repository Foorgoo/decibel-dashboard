import { useEffect, useState } from 'react';
import { PositionsTable } from './PositionsTable';
import { OrdersTable } from './OrdersTable';
import { TradesTable } from './TradesTable';
import { useDashboardStore } from '../store';

type TabKey = 'positions' | 'orders' | 'trades';

interface DataTabsProps {
  showTrades: boolean;
  tradesLoading?: boolean;
  onActiveTabChange?: (tab: TabKey) => void;
}

export function DataTabs({ showTrades, tradesLoading = false, onActiveTabChange }: DataTabsProps) {
  const { currentAccount, positions, openOrders, trades } = useDashboardStore();
  const [activeTab, setActiveTab] = useState<TabKey>('positions');
  const maxTradeCount = currentAccount === 'all' ? 500 : 200;

  useEffect(() => {
    if (!showTrades && activeTab === 'trades') {
      setActiveTab('positions');
    }
  }, [activeTab, showTrades]);

  useEffect(() => {
    setActiveTab('positions');
  }, [currentAccount]);

  useEffect(() => {
    onActiveTabChange?.(activeTab);
  }, [activeTab, onActiveTabChange]);

  return (
    <div className="chart-section">
      <div className="tabs-header">
        <button
          className={`tab-btn ${activeTab === 'positions' ? 'active' : ''}`}
          onClick={() => setActiveTab('positions')}
        >
          持仓 <span>{positions.length}</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          订单 <span>{openOrders.length}</span>
        </button>
        {showTrades && (
          <button
            className={`tab-btn ${activeTab === 'trades' ? 'active' : ''}`}
            onClick={() => setActiveTab('trades')}
          >
            最近成交 <span>{tradesLoading ? '...' : Math.min(trades.length, maxTradeCount)}</span>
          </button>
        )}
      </div>

      {activeTab === 'positions' && <PositionsTable embedded />}
      {activeTab === 'orders' && <OrdersTable embedded />}
      {activeTab === 'trades' && showTrades && <TradesTable />}
    </div>
  );
}
