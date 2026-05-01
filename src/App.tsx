import { lazy, Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { useDashboardStore } from './store';
import { createDecibelClient } from './api/client';
import { AccountStats } from './components/AccountStats';
import { RiskSummary } from './components/RiskSummary';
import { MarketExposure } from './components/MarketExposure';
import { DataTabs } from './components/DataTabs';
import { ConfigModal } from './components/ConfigModal';
import decibelMark from './assets/decibel-mark.svg';
import {
  aggregatePortfolioData,
  getAmpDailyDelta,
  getLeaderboardAddress,
  getLeaderboardAmps,
  getMsUntilNextLocalMidnight,
  getSelectedOwners,
  getVolume30d,
  normalizeAddress,
  normalizeTimestamp,
  normalizeTradeSide,
  pickFirst,
  sumAccountFields,
} from './utils/dashboardData';

const PnLChart = lazy(() => import('./components/PnLChart').then((module) => ({ default: module.PnLChart })));
const APP_VERSION = '0.1.2';
const CURRENT_YEAR = new Date().getFullYear();

function App() {
  const {
    apiKey,
    accounts,
    currentAccount,
    isLoading,
    account,
    positions,
    openOrders,
    trades,
    error,
    removeAccount,
    setCurrentAccount,
    updateAccountName,
    setAccount,
    setPositions,
    setOpenOrders,
    setTrades,
    setPortfolioData,
    setMarkets,
    setMarketMap,
    setSubaccounts,
    subaccountAliases,
    subaccounts,
    updateSubaccountAlias,
    setVolume30d,
    setLoading,
    setError,
    setAmps,
  } = useDashboardStore();

  const [showConfig, setShowConfig] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [chartRange, setChartRange] = useState('24h');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const lastFetchRef = useRef(0);
  const activeRequestIdRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const canFetch = () => Date.now() - lastFetchRef.current > 5000;
  const markFetchStarted = () => {
    lastFetchRef.current = Date.now();
  };

  const effectiveAccount = currentAccount;
  const selectedOwners = getSelectedOwners(effectiveAccount, accounts);

  const getApiKeyForNetwork = (): string | null => {
    if (typeof window === 'undefined') return apiKey;
    const key = localStorage.getItem('decibel_api_key_mainnet');
    return key || apiKey || null;
  };

  const fetchData = useCallback(async (range = '24h') => {
    const keyToUse = getApiKeyForNetwork();
    const ownersToFetch = getSelectedOwners(effectiveAccount, accounts);
    if (!keyToUse || ownersToFetch.length === 0) {
      setLoading(false);
      return;
    }

    activeAbortRef.current?.abort();
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    const abortController = new AbortController();
    activeAbortRef.current = abortController;
    const isLatestRequest = () => activeRequestIdRef.current === requestId && !abortController.signal.aborted;

    if (import.meta.env.DEV) {
      console.log('[fetchData] Start:', { owners: ownersToFetch.length, range });
    }
    setLoading(true);
    setError(null);

    const client = createDecibelClient(keyToUse, abortController.signal);

    try {
      const ownerSubaccountResults = await Promise.allSettled(ownersToFetch.map(async (owner) => {
        const ownerConfig = accounts.find((account) => normalizeAddress(account.address) === normalizeAddress(owner));
        let subaccounts: Awaited<ReturnType<typeof client.getSubaccounts>> = [];
        try {
          subaccounts = await client.getSubaccounts(owner);
        } catch (error: any) {
          if (import.meta.env.DEV) {
            console.warn('[subaccounts] Failed, fallback to owner wallet:', {
              owner,
              message: error?.message,
            });
          }
        }

        const tradingAccounts = subaccounts.length > 0
          ? subaccounts.map((subaccount) => ({
              address: subaccount.account,
              name: subaccountAliases[subaccount.account.toLowerCase()] || subaccount.name,
              apiName: subaccount.name,
              isPrimary: subaccount.isPrimary,
              owner,
              ownerName: ownerConfig?.name,
            }))
          : [{
              address: owner,
              name: subaccountAliases[owner.toLowerCase()],
              apiName: undefined,
              isPrimary: true,
              owner,
              ownerName: ownerConfig?.name,
            }];

        return tradingAccounts;
      }));
      if (!isLatestRequest()) return;

      const tradingAccounts = ownerSubaccountResults
        .filter((result): result is PromiseFulfilledResult<any[]> => result.status === 'fulfilled')
        .flatMap((result) => result.value);

      if (tradingAccounts.length === 0) {
        throw new Error('未读取到主钱包或子账户');
      }

      const uniqueSubaccounts = Array.from(
        new Map(
          tradingAccounts.map((tradingAccount) => [
            tradingAccount.address.toLowerCase(),
            {
              address: tradingAccount.address,
              alias: subaccountAliases[tradingAccount.address.toLowerCase()] || tradingAccount.apiName || '',
              owner: tradingAccount.owner,
              ownerName: tradingAccount.ownerName,
            },
          ])
        ).values()
      );
      if (!isLatestRequest()) return;
      setSubaccounts(uniqueSubaccounts);

      let prices: any[] = [];
      let markets: any[] = [];
      try {
        prices = await client.getPrices();
        markets = await client.getMarkets();
      } catch {
        if (import.meta.env.DEV) {
          console.warn('[fetchData] Failed to fetch markets or prices');
        }
      }
      if (!isLatestRequest()) return;

      const priceMap = new Map();
      (prices || []).forEach((p: any) => priceMap.set(p.market, p));

      const marketMap = new Map<string, string>();
      (markets || []).forEach((m: any) => marketMap.set(m.market_addr, m.market_name));
      setMarkets(markets);
      setMarketMap(marketMap);

      const accountResults = await Promise.allSettled(tradingAccounts.map(async (tradingAccount) => {
        const [accountData, positions, orders, portfolio, trades] = await Promise.all([
          client.getAccount(tradingAccount.address),
          client.getPositions(tradingAccount.address),
          client.getOpenOrders(tradingAccount.address),
          client.getPortfolioChartData(tradingAccount.address, range as any),
          ownersToFetch.length === 1 ? client.getTrades(tradingAccount.address, '200').catch(() => []) : Promise.resolve([]),
        ]);

        return {
          tradingAccount,
          accountData,
          positions,
          orders,
          portfolio,
          trades,
        };
      }));
      if (!isLatestRequest()) return;

      const successfulAccounts = accountResults
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map((result) => result.value);

      if (successfulAccounts.length === 0) {
        throw new Error('未读取到该主钱包下的子账户数据');
      }

      setAccount(sumAccountFields(successfulAccounts.map((result) => result.accountData)));

      const positions = successfulAccounts.flatMap((result) =>
        result.positions.map((position: any) => ({
          ...position,
          subaccount: result.tradingAccount.address,
          subaccount_name: result.tradingAccount.name,
          owner: result.tradingAccount.owner,
          owner_name: result.tradingAccount.ownerName,
        }))
      );

      const orders = successfulAccounts.flatMap((result) =>
        result.orders.map((order: any) => ({
          ...order,
          subaccount: result.tradingAccount.address,
          subaccount_name: result.tradingAccount.name,
          owner: result.tradingAccount.owner,
          owner_name: result.tradingAccount.ownerName,
        }))
      );

      const trades = successfulAccounts.flatMap((result) =>
        (Array.isArray(result.trades) ? result.trades : []).map((trade: any) => {
          const price = Number(pickFirst(trade, ['price', 'px', 'fill_price', 'avg_price', 'trade_price', 'execution_price']) || 0);
          const size = Number(pickFirst(trade, ['size', 'sz', 'fill_size', 'qty', 'quantity', 'trade_size', 'base_amount']) || 0);
          const fee = Number(pickFirst(trade, ['fee', 'fees', 'commission', 'fee_amount', 'total_fee', 'maker_fee', 'taker_fee']) || 0);
          const realizedPnl = Number(pickFirst(trade, [
            'realized_pnl_amount',
            'realized_pnl',
            'pnl',
            'closed_pnl',
            'close_pnl',
          ]) || 0);
          const netRealizedPnl = realizedPnl === 0 ? 0 : realizedPnl - Math.abs(fee);
          const timestamp = normalizeTimestamp(pickFirst(trade, [
            'timestamp',
            'created_at',
            'createdAt',
            'time',
            'executed_at',
            'executedAt',
    'fill_time',
    'fillTime',
    'transaction_unix_ms',
    'transactionUnixMs',
    'block_timestamp',
    'blockTimestamp',
          ]));
          const side = normalizeTradeSide(trade);
          const source = pickFirst(trade, ['source', 'trade_source', 'event_source', 'reason']) || '';

          if (import.meta.env.DEV && !timestamp) {
            console.debug('[trade_history] Missing timestamp field:', trade);
          }

          return {
            ...trade,
            price,
            size,
            fee,
            realized_pnl: netRealizedPnl,
            gross_realized_pnl: realizedPnl,
            timestamp,
            side,
            source,
            value: Math.abs(size) * price,
            subaccount: result.tradingAccount.address,
            subaccount_name: result.tradingAccount.name,
            owner: result.tradingAccount.owner,
            owner_name: result.tradingAccount.ownerName,
            market_name: marketMap.get(trade.market) || trade.market_name || trade.market?.slice(0, 10) || 'Unknown',
          };
        })
      );

      const accountVolume30d = successfulAccounts.reduce((total, result) => {
        const volume = getVolume30d(result.accountData);
        return volume !== null ? total + volume : total;
      }, 0);

      if (accountVolume30d > 0) {
        setVolume30d(accountVolume30d);
      } else {
        const leaderboardResults = await Promise.allSettled(tradingAccounts.map(async (tradingAccount) => {
          const entries = await client.getLeaderboard(tradingAccount.address);
          const normalizedAddress = normalizeAddress(tradingAccount.address);
          return entries.find((entry: any) =>
            normalizeAddress(entry.account || entry.address || entry.subaccount || entry.subaccount_address) === normalizedAddress
          ) || null;
        }));

        const leaderboardVolume30d = leaderboardResults.reduce((total, result) => {
          if (result.status !== 'fulfilled' || !result.value) return total;
          const volume = getVolume30d(result.value);
          return volume !== null ? total + volume : total;
        }, 0);
        if (!isLatestRequest()) return;
        setVolume30d(leaderboardVolume30d || null);
      }

      const enrichedPositions = positions.map((pos: any) => {
        const markPrice = Number(priceMap.get(pos.market)?.mark_px || pos.mark_price || pos.mark_px || 0);
        const size = Number(pos.size || 0);
        const entryPrice = Number(pos.entry_price || 0);
        const apiPnl = Number(pos.unrealized_pnl);
        const estimatedPnl = markPrice > 0 && entryPrice > 0
          ? (markPrice - entryPrice) * Math.abs(size) * (size > 0 ? 1 : -1)
          : Number(pos.unrealized_funding || 0);

        return {
          ...pos,
          mark_price: markPrice,
          value: Math.abs(size) * markPrice,
          pnl: Number.isFinite(apiPnl) ? apiPnl : estimatedPnl,
          market_name: marketMap.get(pos.market) || pos.market?.slice(0, 10) || 'Unknown',
        };
      });

      setPositions(enrichedPositions);
      setOpenOrders(orders.map((order: any) => ({
          ...order,
          mark_price: Number(priceMap.get(order.market)?.mark_px || 0),
          market_name: marketMap.get(order.market) || order.market?.slice(0, 10) || 'Unknown',
        }))
        .map((order: any) => {
          const size = Number(order.remaining_size || order.size || 0);
          const price = Number(order.price || 0);
          const valuePrice = price > 0 ? price : order.mark_price;

          return {
            ...order,
            value: Math.abs(size) * Number(valuePrice || 0),
          };
        })
      );
      setTrades(ownersToFetch.length === 1 ? trades : []);

      setPortfolioData(aggregatePortfolioData(successfulAccounts.map((result) => result.portfolio)));

      try {
        let totalAmps = 0;
        let bestRank: number | null = null;
        let foundAmps = false;

        for (const owner of ownersToFetch) {
          const pointsData = await client.getPointsLeaderboard(owner);
          const normalizedOwner = normalizeAddress(owner);
          let userEntry = pointsData.find((entry: any) => getLeaderboardAddress(entry) === normalizedOwner);

          if (!userEntry && pointsData.length === 1 && getLeaderboardAmps(pointsData[0]) !== null) {
            userEntry = pointsData[0];
          }

          const amps = getLeaderboardAmps(userEntry);
          if (amps !== null) {
            foundAmps = true;
            totalAmps += amps;

            const rank = Number(userEntry?.rank);
            if (Number.isFinite(rank)) {
              bestRank = bestRank === null ? rank : Math.min(bestRank, rank);
            }
          }
        }

        if (foundAmps) {
          const ampDeltaKey = ownersToFetch.length === 1 ? ownersToFetch[0] : `all_${ownersToFetch.sort().join('_')}`;
          if (!isLatestRequest()) return;
          setAmps(totalAmps, ownersToFetch.length === 1 ? bestRank : null, getAmpDailyDelta(ampDeltaKey, totalAmps));
        } else {
          if (!isLatestRequest()) return;
          setAmps(null, null);
        }
      } catch (e: any) {
        if (import.meta.env.DEV) {
          console.error('[AMP] Fetch failed:', e.message);
        }
        if (!isLatestRequest()) return;
        setAmps(null, null);
      }
      setLastUpdatedAt(Date.now());
    } catch (err: any) {
      if (abortController.signal.aborted || !isLatestRequest()) return;
      if (import.meta.env.DEV) {
        console.error('[fetchData] Error:', err.message);
      }
      setError(err.message || 'Failed to fetch data');
    } finally {
      if (isLatestRequest()) {
        setLoading(false);
        setRefreshing(false);
        activeAbortRef.current = null;
      }
    }
  }, [accounts, effectiveAccount, setAccount, setPositions, setOpenOrders, setTrades, setVolume30d, setPortfolioData, setMarkets, setMarketMap, setSubaccounts, subaccountAliases, setAmps, setLoading, setError]);

  const handleRangeChange = (range: any) => {
    setChartRange(range);
    const keyToUse = getApiKeyForNetwork();
    if (keyToUse && selectedOwners.length > 0) {
      fetchData(range);
    }
  };

  const handleRefresh = () => {
    if (!canFetch()) return;
    setRefreshing(true);
    markFetchStarted();
    fetchData(chartRange);
  };

  // Trigger data fetch when account changes
  useEffect(() => {
    const keyToUse = getApiKeyForNetwork();
    if (keyToUse && selectedOwners.length > 0) {
      markFetchStarted();
      fetchData(chartRange);
    }
  }, [effectiveAccount, fetchData]);

  useEffect(() => {
    return () => {
      activeAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const keyToUse = getApiKeyForNetwork();
      if (canFetch() && keyToUse && selectedOwners.length > 0) {
        markFetchStarted();
        fetchData(chartRange);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [effectiveAccount, chartRange, fetchData]);

  useEffect(() => {
    let timeoutId: number | undefined;

    const scheduleMidnightRefresh = () => {
      timeoutId = window.setTimeout(() => {
        const keyToUse = getApiKeyForNetwork();
        if (keyToUse && selectedOwners.length > 0) {
          markFetchStarted();
          fetchData(chartRange);
        }
        scheduleMidnightRefresh();
      }, getMsUntilNextLocalMidnight());
    };

    scheduleMidnightRefresh();
    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [effectiveAccount, chartRange, fetchData]);

  const handleSaveApiKey = (mainnetKey: string) => {
    if (typeof window !== 'undefined') {
      if (mainnetKey) {
        localStorage.setItem('decibel_api_key_mainnet', mainnetKey);
      } else {
        localStorage.removeItem('decibel_api_key_mainnet');
      }
    }
    if (mainnetKey && selectedOwners.length > 0) {
      setTimeout(() => fetchData(chartRange), 0);
    }
  };

  const handleSwitchAccount = (address: string | null) => {
    setCurrentAccount(address);
    setAccount(null);
    setPositions([]);
    setOpenOrders([]);
    setTrades([]);
    setVolume30d(null);
    setPortfolioData([]);
    setAmps(null, null);
  };

  const handleRemoveAccount = (address: string) => {
    removeAccount(address);
    if (currentAccount === address) {
      const remaining = accounts.filter(a => a.address !== address);
      if (remaining.length > 0) {
        handleSwitchAccount(remaining[0].address);
      } else {
        handleSwitchAccount(null);
      }
    }
  };

  const formatAddress = (addr: string) => {
    if (!addr) return '未配置';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const visibleAccounts = accounts.slice(0, 10);
  const currentAccountHidden = currentAccount && currentAccount !== 'all' && !visibleAccounts.some((acc) => acc.address === currentAccount);

  const needsConfig = !getApiKeyForNetwork() || accounts.length === 0;
  const hasDashboardData = !!account || positions.length > 0 || openOrders.length > 0;

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="brand-lockup">
            <h1 className="logo">
              <img className="logo-mark" src={decibelMark} alt="" aria-hidden="true" />
              <span className="logo-text">
                <span className="logo-word">DECIBEL</span>
                <span className="logo-subtitle">做市看板</span>
              </span>
            </h1>
            <span className="network-status">主网</span>
          </div>
        </div>

        <div className="header-right">
          {accounts.length > 0 && (
            <select
              className="toolbar-control toolbar-select account-switcher"
              value={currentAccount || ''}
              onChange={(e) => {
                if (e.target.value === '__more__') {
                  setShowConfig(true);
                  return;
                }
                handleSwitchAccount(e.target.value || null);
              }}
            >
              <option value="all">所有主钱包</option>
              {currentAccountHidden && (
                <option value={currentAccount}>
                  {accounts.find((acc) => acc.address === currentAccount)?.name || formatAddress(currentAccount)}
                </option>
              )}
              {visibleAccounts.map((acc) => (
                <option key={acc.address} value={acc.address}>
                  {acc.name || formatAddress(acc.address)}
                </option>
              ))}
              {accounts.length > 10 && (
                <option value="__more__">更多账户请到设置管理...</option>
              )}
            </select>
          )}

          {!currentAccount && accounts.length === 0 && (
            <div className="account-badge">
              <span className="text-secondary">主钱包:</span>
              <span>{formatAddress(currentAccount || '')}</span>
            </div>
          )}

          <button
            className="toolbar-control toolbar-btn"
            onClick={handleRefresh}
            disabled={refreshing || selectedOwners.length === 0}
          >
            {refreshing ? '刷新中...' : '刷新'}
          </button>
          <button className="toolbar-control toolbar-btn" onClick={() => setShowConfig(true)}>
            设置
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        {needsConfig ? (
          <div className="empty-state">
            <p>请先配置 API Key 和添加主钱包来查看看板数据</p>
            <button className="btn btn-primary" onClick={() => setShowConfig(true)} style={{ marginTop: 16 }}>
              立即配置
            </button>
          </div>
        ) : isLoading && !account ? (
          <div className="loading-spinner">
            <div className="spinner"></div>
          </div>
        ) : error && !hasDashboardData ? (
          <div className="empty-state">
            <p style={{ color: 'var(--danger)' }}>错误: {error}</p>
          </div>
        ) : (
          <div className="dashboard-stack">
            {error && (
              <div className="inline-alert">
                刷新失败，当前显示上次成功数据：{error}
              </div>
            )}
            <AccountStats />
            <RiskSummary lastUpdatedAt={lastUpdatedAt} />
            <Suspense fallback={<div className="chart-section chart-loading">图表加载中...</div>}>
              <PnLChart onRangeChange={handleRangeChange} />
            </Suspense>
            {currentAccount === 'all' && <MarketExposure />}
            <DataTabs showTrades={currentAccount !== 'all'} />
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span>© {CURRENT_YEAR} DECIBEL 做市看板</span>
        <span>v{APP_VERSION}</span>
        <span>
          <a href="https://github.com/Foorgoo/decibel-dashboard" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </span>
        <span>
          <a href="https://x.com/FunsMove" target="_blank" rel="noreferrer">
            X
          </a>
        </span>
      </footer>

      {showConfig && (
        <ConfigModal
          onClose={() => setShowConfig(false)}
          onSaveApiKey={handleSaveApiKey}
          onRemoveAccount={handleRemoveAccount}
          onUpdateAccountName={updateAccountName}
          accounts={accounts}
          subaccounts={subaccounts}
          onUpdateSubaccountAlias={(address, alias) => {
            const owner = subaccounts.find((subaccount) => normalizeAddress(subaccount.address) === normalizeAddress(address))?.owner;
            updateSubaccountAlias(address, alias, owner);
            setPositions(positions.map((position: any) =>
              normalizeAddress(position.subaccount) === normalizeAddress(address)
                ? { ...position, subaccount_name: alias || undefined }
                : position
            ));
            setOpenOrders(openOrders.map((order: any) =>
              normalizeAddress(order.subaccount) === normalizeAddress(address)
                ? { ...order, subaccount_name: alias || undefined }
                : order
            ));
            setTrades(trades.map((trade: any) =>
              normalizeAddress(trade.subaccount) === normalizeAddress(address)
                ? { ...trade, subaccount_name: alias || undefined }
                : trade
            ));
            setSubaccounts(subaccounts.map((subaccount) =>
              normalizeAddress(subaccount.address) === normalizeAddress(address)
                ? { ...subaccount, alias }
                : subaccount
            ));
          }}
        />
      )}
    </div>
  );
}

export default App;
