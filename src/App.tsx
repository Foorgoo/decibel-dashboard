import { lazy, Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { useDashboardStore } from './store';
import { createDecibelClient } from './api/client';
import { AccountStats } from './components/AccountStats';
import { RiskSummary } from './components/RiskSummary';
import { PositionAllocationChart } from './components/PositionAllocationChart';
import { EquityBreakdownChart } from './components/EquityBreakdownChart';
import { DataTabs } from './components/DataTabs';
import { ConfigModal } from './components/ConfigModal';
import decibelMark from './assets/decibel-mark.svg';
import { APP_MODE, IS_TRADING_MODE } from './config/appMode';
import { TradingAuthorizationPanel } from './features/trading/TradingAuthorizationPanel';
import {
  aggregatePortfolioData,
  getAmpDailyDelta,
  getLeaderboardAddress,
  getLeaderboardAmps,
  getSelectedOwners,
  getVolume30d,
  normalizeAddress,
  normalizeTimestamp,
  normalizeTradeSide,
  pickFirst,
  sumAccountFields,
} from './utils/dashboardData';
import {
  TRADING_AUTH_EVENT,
  TRADING_CONFIG_EVENT,
  TRADING_REFRESH_EVENT,
  TRADING_TOAST_EVENT,
  type TradingToastDetail,
} from './features/trading/events';

const PnLChart = lazy(() => import('./components/PnLChart').then((module) => ({ default: module.PnLChart })));
const TradingWalletStatus = lazy(() => import('./features/trading/TradingWalletStatus').then((module) => ({
  default: module.TradingWalletStatus,
})));
const APP_VERSION = '0.2.1';
const CURRENT_YEAR = new Date().getFullYear();
type TradingToast = TradingToastDetail & { id: number };
type CachedSubaccount = { account: string; name?: string; isPrimary?: boolean };
type SubaccountCache = Record<string, CachedSubaccount[]>;
const SUBACCOUNT_CACHE_KEY = 'decibel_subaccounts_cache_mainnet';

const readSubaccountCache = (): SubaccountCache => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(SUBACCOUNT_CACHE_KEY) || '{}');
    if (!raw || typeof raw !== 'object') return {};
    return Object.entries(raw).reduce<SubaccountCache>((cache, [owner, value]) => {
      if (!Array.isArray(value)) return cache;
      const items = value
        .map((item: any) => ({
          account: String(item?.account || item?.address || ''),
          name: typeof item?.name === 'string' ? item.name : undefined,
          isPrimary: item?.isPrimary === true,
        }))
        .filter((item) => item.account);
      if (items.length > 0) cache[normalizeAddress(owner)] = items;
      return cache;
    }, {});
  } catch {
    return {};
  }
};

const writeSubaccountCache = (owner: string, subaccounts: CachedSubaccount[]) => {
  if (typeof window === 'undefined' || subaccounts.length === 0) return;
  const cache = readSubaccountCache();
  cache[normalizeAddress(owner)] = subaccounts;
  localStorage.setItem(SUBACCOUNT_CACHE_KEY, JSON.stringify(cache));
};

function App() {
  const {
    apiKey,
    setGasStationApiKey,
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
  const [showTradingAuth, setShowTradingAuth] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [chartRange, setChartRange] = useState('24h');
  const [portfolioChartType, setPortfolioChartType] = useState<'pnl' | 'account_value'>('pnl');
  const [activeDataTab, setActiveDataTab] = useState<'positions' | 'orders' | 'trades'>('positions');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradingToasts, setTradingToasts] = useState<TradingToast[]>([]);
  const lastFetchRef = useRef(0);
  const activeRequestIdRef = useRef(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const tradesRequestIdRef = useRef(0);
  const portfolioRequestIdRef = useRef(0);
  const portfolioChartTypeRef = useRef(portfolioChartType);
  const canFetch = () => Date.now() - lastFetchRef.current > 5000;
  const markFetchStarted = () => {
    lastFetchRef.current = Date.now();
  };
  const hasActiveFetch = () => Boolean(activeAbortRef.current && !activeAbortRef.current.signal.aborted);

  const effectiveAccount = currentAccount;
  const selectedOwners = getSelectedOwners(effectiveAccount, accounts);

  const getApiKeyForNetwork = (): string | null => {
    if (typeof window === 'undefined') return apiKey;
    const key = localStorage.getItem('decibel_api_key_mainnet');
    return key || apiKey || null;
  };

  useEffect(() => {
    portfolioChartTypeRef.current = portfolioChartType;
  }, [portfolioChartType]);

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
    const retryRequest = async <T,>(request: () => Promise<T>, attempts = 2): Promise<T> => {
      let lastError: unknown;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          return await request();
        } catch (error) {
          lastError = error;
          if (abortController.signal.aborted || attempt === attempts - 1) break;
          await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
        }
      }
      throw lastError;
    };

    try {
      const ownersForSubaccounts = Array.from(new Set([
        ...accounts.map((item) => item.address),
        ...ownersToFetch,
      ].map((owner) => normalizeAddress(owner)))).map((owner) => (
        accounts.find((account) => normalizeAddress(account.address) === owner)?.address || owner
      ));

      const ownerSubaccountResults = await Promise.allSettled(ownersForSubaccounts.map(async (owner) => {
        const ownerConfig = accounts.find((account) => normalizeAddress(account.address) === normalizeAddress(owner));
        const storeSubaccounts = useDashboardStore.getState().subaccounts.filter((item) => (
          item.owner && normalizeAddress(item.owner) === normalizeAddress(owner)
        )).map((item) => ({
          account: item.address,
          name: item.alias,
          isPrimary: false,
        }));
        const cachedSubaccounts = readSubaccountCache()[normalizeAddress(owner)] || [];
        const knownSubaccounts = Array.from(new Map(
          [...storeSubaccounts, ...cachedSubaccounts].map((item) => [normalizeAddress(item.account), item])
        ).values());
        let subaccounts: Awaited<ReturnType<typeof client.getSubaccounts>> = [];
        try {
          subaccounts = await retryRequest(() => client.getSubaccounts(owner), 3);
          if (subaccounts.length > 0) {
            writeSubaccountCache(owner, subaccounts);
          }
        } catch (error: any) {
          if (knownSubaccounts.length > 0) {
            subaccounts = knownSubaccounts;
          }
          if (import.meta.env.DEV) {
            console.warn('[subaccounts] Failed, fallback to known subaccounts:', {
              owner,
              message: error?.message,
              knownSubaccounts: knownSubaccounts.length,
            });
          }
        }
        if (subaccounts.length === 0 && knownSubaccounts.length > 0) {
          subaccounts = knownSubaccounts;
        }

        const tradingAccounts = subaccounts.map((subaccount) => ({
          address: subaccount.account,
          name: subaccountAliases[subaccount.account.toLowerCase()] || subaccount.name,
          apiName: subaccount.name,
          isPrimary: subaccount.isPrimary,
          owner,
          ownerName: ownerConfig?.name,
        }));

        return tradingAccounts;
      }));
      if (!isLatestRequest()) return;

      const tradingAccounts = ownerSubaccountResults
        .filter((result): result is PromiseFulfilledResult<any[]> => result.status === 'fulfilled')
        .flatMap((result) => result.value);
      const selectedOwnerKeys = new Set(ownersToFetch.map((owner) => normalizeAddress(owner)));
      const selectedTradingAccounts = tradingAccounts.filter((tradingAccount) => (
        selectedOwnerKeys.has(normalizeAddress(tradingAccount.owner))
      ));

      if (selectedTradingAccounts.length === 0) {
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

      const previousState = useDashboardStore.getState();
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

      const marketMap = markets.length > 0 ? new Map<string, string>() : previousState.marketMap;
      if (markets.length > 0) {
        markets.forEach((m: any) => marketMap.set(m.market_addr, m.market_name));
        setMarkets(markets);
        setMarketMap(marketMap);
      }

      const getPreviousPositions = (subaccount: string) => previousState.positions.filter((position: any) => (
        normalizeAddress(position.subaccount || '') === normalizeAddress(subaccount)
      ));
      const getPreviousOrders = (subaccount: string) => previousState.openOrders.filter((order: any) => (
        normalizeAddress(order.subaccount || '') === normalizeAddress(subaccount)
      ));
      const getPreviousPosition = (position: any) => previousState.positions.find((previousPosition: any) => (
        normalizeAddress(previousPosition.subaccount || '') === normalizeAddress(position.subaccount || '')
          && normalizeAddress(previousPosition.market || '') === normalizeAddress(position.market || '')
      ));
      const getPreviousOrder = (order: any) => previousState.openOrders.find((previousOrder: any) => (
        normalizeAddress(previousOrder.subaccount || '') === normalizeAddress(order.subaccount || '')
          && String(previousOrder.order_id || previousOrder.id || '') === String(order.order_id || order.id || '')
      ));
      const accountResults = await Promise.allSettled(selectedTradingAccounts.map(async (tradingAccount) => {
        const [accountDataResult, positionsResult, ordersResult, portfolioResult] = await Promise.allSettled([
          retryRequest(() => client.getAccount(tradingAccount.address), 3),
          retryRequest(() => client.getPositions(tradingAccount.address), 2),
          retryRequest(() => client.getOpenOrders(tradingAccount.address), 2),
          retryRequest(() => client.getPortfolioChartData(tradingAccount.address, range as any, portfolioChartTypeRef.current), 2),
        ]);

        if (accountDataResult.status !== 'fulfilled') {
          throw accountDataResult.reason;
        }

        return {
          tradingAccount,
          accountData: accountDataResult.value,
          positions: positionsResult.status === 'fulfilled' ? positionsResult.value : getPreviousPositions(tradingAccount.address),
          orders: ordersResult.status === 'fulfilled' ? ordersResult.value : getPreviousOrders(tradingAccount.address),
          portfolio: portfolioResult.status === 'fulfilled' ? portfolioResult.value : null,
          positionsFallback: positionsResult.status !== 'fulfilled',
          ordersFallback: ordersResult.status !== 'fulfilled',
          portfolioFallback: portfolioResult.status !== 'fulfilled',
        };
      }));
      if (!isLatestRequest()) return;

      const successfulAccounts = accountResults
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map((result) => result.value);

      if (successfulAccounts.length === 0) {
        throw new Error('未读取到该主钱包下的子账户数据');
      }
      const refreshWarning = successfulAccounts.length < selectedTradingAccounts.length
        ? `部分账户暂未刷新：${successfulAccounts.length}/${selectedTradingAccounts.length}`
        : successfulAccounts.some((result) => result.positionsFallback || result.ordersFallback)
          ? '部分持仓或订单暂未刷新，已保留上次成功数据'
        : successfulAccounts.some((result) => result.portfolioFallback)
          ? '部分图表数据暂未刷新，已保留上次成功数据'
        : null;
      if (import.meta.env.DEV && successfulAccounts.length < selectedTradingAccounts.length) {
        console.warn('[fetchData] Partial account refresh:', {
          successful: successfulAccounts.length,
          total: selectedTradingAccounts.length,
        });
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

      const accountVolume30d = successfulAccounts.reduce((total, result) => {
        const volume = getVolume30d(result.accountData);
        return volume !== null ? total + volume : total;
      }, 0);

      if (accountVolume30d > 0) {
        setVolume30d(accountVolume30d);
      } else {
        const leaderboardResults = await Promise.allSettled(selectedTradingAccounts.map(async (tradingAccount) => {
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
        if (leaderboardVolume30d > 0) {
          setVolume30d(leaderboardVolume30d);
        }
      }

      const enrichedPositions = positions.map((pos: any) => {
        const previousPosition = getPreviousPosition(pos);
        const markPrice = Number(
          priceMap.get(pos.market)?.mark_px
            || pos.mark_price
            || pos.mark_px
            || previousPosition?.mark_price
            || previousPosition?.mark_px
            || 0
        );
        const size = Number(pos.size || 0);
        const entryPrice = Number(pos.entry_price || 0);
        const apiPnl = Number(pos.unrealized_pnl);
        const previousPnl = Number(previousPosition?.pnl ?? previousPosition?.unrealized_pnl);
        const value = markPrice > 0
          ? Math.abs(size) * markPrice
          : Number(previousPosition?.value || 0);
        const estimatedPnl = markPrice > 0 && entryPrice > 0
          ? (markPrice - entryPrice) * Math.abs(size) * (size > 0 ? 1 : -1)
          : Number.isFinite(previousPnl)
            ? previousPnl
            : Number(pos.unrealized_funding || 0);

        return {
          ...pos,
          mark_price: markPrice,
          value,
          pnl: Number.isFinite(apiPnl) ? apiPnl : estimatedPnl,
          market_name: marketMap.get(pos.market) || previousPosition?.market_name || pos.market?.slice(0, 10) || 'Unknown',
        };
      });

      setPositions(enrichedPositions);
      setOpenOrders(orders.map((order: any) => ({
          ...order,
          mark_price: Number(priceMap.get(order.market)?.mark_px || getPreviousOrder(order)?.mark_price || 0),
          market_name: marketMap.get(order.market) || getPreviousOrder(order)?.market_name || order.market?.slice(0, 10) || 'Unknown',
        }))
        .map((order: any) => {
          const previousOrder = getPreviousOrder(order);
          const size = Number(order.remaining_size || order.size || 0);
          const price = Number(order.price || 0);
          const valuePrice = price > 0 ? price : order.mark_price;

          return {
            ...order,
            value: Number(valuePrice || 0) > 0 ? Math.abs(size) * Number(valuePrice || 0) : Number(previousOrder?.value || 0),
          };
        })
      );
      const portfolioSeries = successfulAccounts
        .map((result) => result.portfolio)
        .filter((portfolio): portfolio is any[] => Array.isArray(portfolio));
      if (portfolioSeries.length > 0) {
        const aggregatedPortfolioData = aggregatePortfolioData(portfolioSeries);
        if (aggregatedPortfolioData.length > 0) {
          setPortfolioData(aggregatedPortfolioData);
        }
      }

      try {
        let totalAmps = 0;
        let bestRank: number | null = null;
        let foundAmps = false;
        const ownerAmpEntries: { owner: string; amps: number }[] = [];

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
            ownerAmpEntries.push({ owner, amps });

            const rank = Number(userEntry?.rank);
            if (Number.isFinite(rank)) {
              bestRank = bestRank === null ? rank : Math.min(bestRank, rank);
            }
          }
        }

        if (foundAmps) {
          const totalDailyDelta = ownerAmpEntries.reduce((sum, entry) => (
            sum + (getAmpDailyDelta(entry.owner, entry.amps) || 0)
          ), 0);
          if (!isLatestRequest()) return;
          setAmps(totalAmps, ownersToFetch.length === 1 ? bestRank : null, totalDailyDelta);
        } else {
          if (!isLatestRequest()) return;
        }
      } catch (e: any) {
        if (import.meta.env.DEV) {
          console.error('[AMP] Fetch failed:', e.message);
        }
        if (!isLatestRequest()) return;
      }
      if (!isLatestRequest()) return;
      setError(refreshWarning);
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

  const loadRecentTrades = useCallback(async () => {
    const keyToUse = getApiKeyForNetwork();
    const ownersToFetch = getSelectedOwners(effectiveAccount, accounts);
    if (!keyToUse || ownersToFetch.length === 0) {
      setTrades([]);
      return;
    }

    const requestId = tradesRequestIdRef.current + 1;
    tradesRequestIdRef.current = requestId;
    const isLatestTradesRequest = () => tradesRequestIdRef.current === requestId;
    const client = createDecibelClient(keyToUse);
    const selectedOwnerKeys = new Set(ownersToFetch.map((owner) => normalizeAddress(owner)));
    const knownSubaccounts = useDashboardStore.getState().subaccounts;
    const marketMap = useDashboardStore.getState().marketMap;
    const tradingAccounts = knownSubaccounts
      .filter((subaccount) => subaccount.owner && selectedOwnerKeys.has(normalizeAddress(subaccount.owner)))
      .map((subaccount) => ({
        address: subaccount.address,
        name: subaccount.alias || subaccountAliases[subaccount.address.toLowerCase()] || '',
        owner: subaccount.owner || '',
        ownerName: subaccount.ownerName,
      }));

    if (tradingAccounts.length === 0) {
      setTrades([]);
      return;
    }

    setTradesLoading(true);
    try {
      const tradeHistoryLimit = ownersToFetch.length > 1 ? '50' : '200';
      const maxTrades = ownersToFetch.length > 1 ? 500 : 200;
      const tradeResults = await Promise.allSettled(tradingAccounts.map(async (tradingAccount) => ({
        tradingAccount,
        trades: await client.getTrades(tradingAccount.address, tradeHistoryLimit),
      })));

      if (!isLatestTradesRequest()) return;

      const nextTrades = tradeResults
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .flatMap((result) => (
          (Array.isArray(result.value.trades) ? result.value.trades : []).map((trade: any) => {
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
            const netRealizedPnl = realizedPnl - Math.abs(fee);
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
              subaccount: result.value.tradingAccount.address,
              subaccount_name: result.value.tradingAccount.name,
              owner: result.value.tradingAccount.owner,
              owner_name: result.value.tradingAccount.ownerName,
              market_name: marketMap.get(trade.market) || trade.market_name || trade.market?.slice(0, 10) || 'Unknown',
            };
          })
        ))
        .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
        .slice(0, maxTrades);

      setTrades(nextTrades);
    } catch (error: any) {
      if (isLatestTradesRequest()) {
        setError(error?.message || '最近成交读取失败');
      }
    } finally {
      if (isLatestTradesRequest()) {
        setTradesLoading(false);
      }
    }
  }, [accounts, effectiveAccount, setError, setTrades, subaccountAliases]);

  const loadPortfolioChart = useCallback(async (
    range: string,
    chartType: 'pnl' | 'account_value',
  ) => {
    const keyToUse = getApiKeyForNetwork();
    const ownersToFetch = getSelectedOwners(effectiveAccount, accounts);
    if (!keyToUse || ownersToFetch.length === 0) return;

    const selectedOwnerKeys = new Set(ownersToFetch.map((owner) => normalizeAddress(owner)));
    const tradingAccounts = useDashboardStore.getState().subaccounts.filter((subaccount) => (
      subaccount.owner && selectedOwnerKeys.has(normalizeAddress(subaccount.owner))
    ));

    if (tradingAccounts.length === 0) {
      fetchData(range);
      return;
    }

    const requestId = portfolioRequestIdRef.current + 1;
    portfolioRequestIdRef.current = requestId;
    const isLatestPortfolioRequest = () => portfolioRequestIdRef.current === requestId;
    const client = createDecibelClient(keyToUse);

    try {
      const portfolioResults = await Promise.allSettled(
        tradingAccounts.map((tradingAccount) => (
          client.getPortfolioChartData(tradingAccount.address, range as any, chartType)
        ))
      );
      if (!isLatestPortfolioRequest()) return;

      const portfolioSeries = portfolioResults
        .filter((result): result is PromiseFulfilledResult<any[]> => result.status === 'fulfilled' && Array.isArray(result.value))
        .map((result) => result.value);

      if (portfolioSeries.length === 0) return;

      const aggregatedPortfolioData = aggregatePortfolioData(portfolioSeries);
      if (aggregatedPortfolioData.length > 0) {
        setPortfolioData(aggregatedPortfolioData);
      }
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.warn('[portfolio_chart] Failed:', error?.message || error);
      }
    }
  }, [accounts, effectiveAccount, fetchData, setPortfolioData]);

  const handleRangeChange = (range: any) => {
    setChartRange(range);
    loadPortfolioChart(range, portfolioChartType);
  };

  const handlePortfolioChartTypeChange = (type: 'pnl' | 'account_value') => {
    setPortfolioChartType(type);
    portfolioChartTypeRef.current = type;
    loadPortfolioChart(chartRange, type);
  };

  const handleRefresh = () => {
    if (!canFetch()) return;
    setRefreshing(true);
    markFetchStarted();
    fetchData(chartRange);
    if (activeDataTab === 'trades') {
      loadRecentTrades();
    }
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
    const handleTradingRefresh = () => {
      const keyToUse = getApiKeyForNetwork();
      if (!keyToUse || selectedOwners.length === 0) return;

      setRefreshing(true);
      markFetchStarted();
      fetchData(chartRange);

      window.setTimeout(() => {
        const nextKeyToUse = getApiKeyForNetwork();
        if (!nextKeyToUse || selectedOwners.length === 0) return;
        markFetchStarted();
        fetchData(chartRange);
      }, 2500);
    };

    window.addEventListener(TRADING_REFRESH_EVENT, handleTradingRefresh);
    return () => window.removeEventListener(TRADING_REFRESH_EVENT, handleTradingRefresh);
  }, [chartRange, fetchData, selectedOwners.length]);

  useEffect(() => {
    const handleTradingToast = (event: Event) => {
      const detail = (event as CustomEvent<TradingToastDetail>).detail;
      if (!detail) return;

      const id = Date.now() + Math.random();
      setTradingToasts((current) => [...current.slice(-2), { ...detail, id }]);
      window.setTimeout(() => {
        setTradingToasts((current) => current.filter((toast) => toast.id !== id));
      }, detail.type === 'warning' ? 2600 : 5200);
    };

    window.addEventListener(TRADING_TOAST_EVENT, handleTradingToast);
    return () => window.removeEventListener(TRADING_TOAST_EVENT, handleTradingToast);
  }, []);

  useEffect(() => {
    const handleTradingAuth = () => setShowTradingAuth(true);
    const handleTradingConfig = () => setShowConfig(true);

    window.addEventListener(TRADING_AUTH_EVENT, handleTradingAuth);
    window.addEventListener(TRADING_CONFIG_EVENT, handleTradingConfig);
    return () => {
      window.removeEventListener(TRADING_AUTH_EVENT, handleTradingAuth);
      window.removeEventListener(TRADING_CONFIG_EVENT, handleTradingConfig);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const keyToUse = getApiKeyForNetwork();
      if (canFetch() && !hasActiveFetch() && keyToUse && selectedOwners.length > 0) {
        markFetchStarted();
        fetchData(chartRange);
      }
    }, 10000);
    return () => clearInterval(interval);
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

  const handleSaveGasStationApiKey = (gasStationKey: string) => {
    setGasStationApiKey(gasStationKey);
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
            {IS_TRADING_MODE && <span className="network-status trade-mode-badge">交易版</span>}
          </div>
        </div>

        <div className="header-right">
          <button
            className="toolbar-control toolbar-btn toolbar-icon-btn"
            onClick={handleRefresh}
            disabled={refreshing || selectedOwners.length === 0}
            title={refreshing ? '刷新中' : '刷新'}
            aria-label={refreshing ? '刷新中' : '刷新'}
          >
            <svg
              className={refreshing ? 'refresh-icon spinning' : 'refresh-icon'}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M20 6v5h-5" />
              <path d="M4 18v-5h5" />
              <path d="M18.2 9A7 7 0 0 0 6.1 6.8L4 9" />
              <path d="M5.8 15A7 7 0 0 0 17.9 17.2L20 15" />
            </svg>
          </button>
          <button
            className="toolbar-control toolbar-btn toolbar-icon-btn"
            onClick={() => setShowConfig(true)}
            title="设置"
            aria-label="设置"
          >
            <svg className="toolbar-svg-icon settings-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.05.05a2 2 0 0 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 0 1-4 0v-.07A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.05.05a2 2 0 0 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 0 1 0-4h.07A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.05-.05a2 2 0 0 1 2.83-2.83l.05.05A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1-1.56V3a2 2 0 0 1 4 0v.07a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.05-.05a2 2 0 0 1 2.83 2.83l-.05.05A1.7 1.7 0 0 0 19.37 9c.22.6.82 1 1.56 1H21a2 2 0 0 1 0 4h-.07A1.7 1.7 0 0 0 19.4 15Z" />
            </svg>
          </button>
          {!IS_TRADING_MODE && accounts.length > 0 && (
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

          {IS_TRADING_MODE && (
            <Suspense fallback={<button className="toolbar-control toolbar-btn" disabled>钱包状态</button>}>
              <TradingWalletStatus />
            </Suspense>
          )}
        </div>
      </header>

      <main className="dashboard-content">
        {needsConfig ? (
          <div className="empty-state">
            <p>{IS_TRADING_MODE ? '请先配置 API Key，并连接钱包或在设置中添加多账户 Owner' : '请先配置 API Key 和添加主钱包来查看看板数据'}</p>
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
                {error.startsWith('部分账户暂未刷新') ? error : `刷新失败，当前显示上次成功数据：${error}`}
              </div>
            )}
            <AccountStats />
            <RiskSummary lastUpdatedAt={lastUpdatedAt} />
            <div className="analytics-grid">
              <Suspense fallback={<div className="chart-section chart-loading">图表加载中...</div>}>
                <PnLChart
                  chartType={portfolioChartType}
                  onChartTypeChange={handlePortfolioChartTypeChange}
                  onRangeChange={handleRangeChange}
                />
              </Suspense>
              <PositionAllocationChart />
              <EquityBreakdownChart />
            </div>
            <DataTabs
              showTrades
              tradesLoading={tradesLoading}
              onActiveTabChange={setActiveDataTab}
              onTradesTabOpen={loadRecentTrades}
            />
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span>© {CURRENT_YEAR} DECIBEL 做市看板</span>
        <span>v{APP_VERSION} · {APP_MODE === 'trading' ? 'Trading' : 'Dashboard'}</span>
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
          onSaveGasStationApiKey={handleSaveGasStationApiKey}
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
      {showTradingAuth && (
        <div className="modal-overlay" onClick={() => setShowTradingAuth(false)}>
          <div className="modal trading-auth-modal" onClick={(event) => event.stopPropagation()}>
            <TradingAuthorizationPanel onClose={() => setShowTradingAuth(false)} />
          </div>
        </div>
      )}
      {tradingToasts.length > 0 && (
        <div className="trading-toast-stack" role="status" aria-live="polite">
          {tradingToasts.map((toast) => (
            <div key={toast.id} className={`trading-toast ${toast.type}`}>
              <div className="trading-toast-title">{toast.title}</div>
              {toast.message && <div className="trading-toast-message">{toast.message}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
