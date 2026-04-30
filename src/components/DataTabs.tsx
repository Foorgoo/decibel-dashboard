import { useEffect, useState } from 'react';
import { PositionsTable } from './PositionsTable';
import { OrdersTable } from './OrdersTable';
import { TradesTable } from './TradesTable';
import { useDashboardStore } from '../store';

type TabKey = 'positions' | 'orders' | 'trades';

interface DataTabsProps {
  showTrades: boolean;
}

export function DataTabs({ showTrades }: DataTabsProps) {
  const { positions, openOrders, trades } = useDashboardStore();
  const [activeTab, setActiveTab] = useState<TabKey>('positions');

  useEffect(() => {
    if (!showTrades && activeTab === 'trades') {
      setActiveTab('positions');
    }
  }, [activeTab, showTrades]);

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
            最近成交 <span>{Math.min(trades.length, 200)}</span>
          </button>
        )}
      </div>

      {activeTab === 'positions' && <PositionsTable embedded />}
      {activeTab === 'orders' && <OrdersTable embedded />}
      {activeTab === 'trades' && showTrades && <TradesTable />}
    </div>
  );
}
