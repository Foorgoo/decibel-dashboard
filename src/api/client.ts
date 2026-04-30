import type { Account, Position, Order, Trade, PortfolioDataPoint, Market, MarketPrice, PointsLeaderboardEntry, Candlestick } from './types';

class DecibelClient {
  private apiKey: string;
  private signal?: AbortSignal;

  constructor(apiKey: string, signal?: AbortSignal) {
    this.apiKey = apiKey;
    this.signal = signal;
  }

  private get baseUrl() {
    return 'https://api.mainnet.aptoslabs.com/decibel/api/v1';
  }

  private async request<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: this.signal,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API Error ${response.status}: ${text || response.statusText}`);
    }

    return response.json();
  }

  async getAccount(account: string): Promise<Account> {
    return this.request<Account>('/account_overviews', {
      account,
      performance_lookback_days: '90',
      volume_window: '30d',
    });
  }

  async getPositions(account: string, market?: string): Promise<Position[]> {
    const params: Record<string, string> = { account };
    if (market) params.market = market;
    return this.request<Position[]>('/account_positions', params);
  }

  async getOpenOrders(account: string): Promise<Order[]> {
    try {
      const result = await this.request<{ items: Order[] }>('/open_orders', { account });
      return result.items || [];
    } catch (e) {
      return [];
    }
  }

  async getOrderHistory(account: string, limit = '50'): Promise<Order[]> {
    return this.request<Order[]>('/orders', { account, limit });
  }

  async getTrades(account: string, limit = '50'): Promise<Trade[]> {
    const result = await this.request<any>('/trade_history', { account, limit });
    const items = result?.items || result?.data?.items || result?.data || result?.trades || result;
    return Array.isArray(items) ? items : [];
  }

  async getPortfolioChartData(
    account: string,
    period: '24h' | '7d' | '30d' | '90d' | 'all' = '7d'
  ): Promise<PortfolioDataPoint[]> {
    return this.request<PortfolioDataPoint[]>('/portfolio_chart', { account, range: period, data_type: 'pnl' });
  }

  async getMarkets(): Promise<Market[]> {
    return this.request<Market[]>('/markets');
  }

  async getMarketPrices(market?: string): Promise<MarketPrice[]> {
    const params: Record<string, string> = {};
    if (market) params.market = market;
    return this.request<MarketPrice[]>('/prices', params);
  }

  async getCandlesticks(
    market: string,
    interval: string,
    startTime: number,
    endTime: number,
  ): Promise<Candlestick[]> {
    return this.request<Candlestick[]>('/candlesticks', {
      market,
      interval,
      startTime: String(startTime),
      endTime: String(endTime),
    });
  }

  async getSubaccounts(owner: string): Promise<{ account: string; name?: string; isPrimary?: boolean }[]> {
    const result = await this.request<any>('/subaccounts', { owner });
    const items = Array.isArray(result) ? result : result?.items || result?.data || [];

    return (Array.isArray(items) ? items : []).map((item: any) => {
      const name = item.custom_label
        || item.label
        || item.name
        || item.display_name
        || item.subaccount_name
        || item.account_label
        || undefined;

      return {
        account: item.subaccount_address || item.account || item.address,
        name,
        isPrimary: item.is_primary,
      };
    }).filter((item: { account?: string }) => Boolean(item.account));
  }

  async getPrices(): Promise<any[]> {
    try {
      const url = new URL(`${this.baseUrl}/prices`);
      const response = await fetch(url.toString(), {
        signal: this.signal,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) return [];
      return response.json();
    } catch (e) {
      return [];
    }
  }

  async getLeaderboard(searchTerm?: string): Promise<any[]> {
    const normalizeItems = (result: any): any[] => {
      const items = result?.items || result?.data?.items || result?.data || result?.leaderboard || result;
      return Array.isArray(items) ? items : [];
    };

    const baseParamVariants: Record<string, string>[] = [
      {
        pagination: JSON.stringify({ limit: 100, offset: 0 }),
        sorting: JSON.stringify({ sort_key: 'volume', sort_dir: 'DESC' }),
      },
      {
        limit: '100',
        offset: '0',
        sort_key: 'volume',
        sort_dir: 'DESC',
      },
      {},
    ];
    const paramVariants = baseParamVariants.map((params) => searchTerm ? { ...params, search_term: searchTerm } : params);

    for (const params of paramVariants) {
      try {
        const result = await this.request<any>('/leaderboard', params);
        const items = normalizeItems(result);
        if (items.length > 0) return items;
      } catch (e: any) {
        if (import.meta.env.DEV) {
          console.warn('[Leaderboard API] Variant failed:', { params, message: e.message });
        }
      }
    }

    return [];
  }

  async getPointsLeaderboard(searchTerm?: string): Promise<PointsLeaderboardEntry[]> {
    const normalizeItems = (result: any): PointsLeaderboardEntry[] => {
      const items = result?.items || result?.data?.items || result?.data || result?.leaderboard || result;
      return Array.isArray(items) ? items : [];
    };

    const baseParamVariants: Record<string, string>[] = [
      {
        pagination: JSON.stringify({ limit: 100, offset: 0 }),
        sorting: JSON.stringify({ sort_key: 'total_amps', sort_dir: 'DESC' }),
      },
      {
        limit: '100',
        offset: '0',
        sort_key: 'total_amps',
        sort_dir: 'DESC',
      },
      {},
    ];
    const paramVariants = baseParamVariants.map((params) => searchTerm ? { ...params, search_term: searchTerm } : params);

    try {
      for (const params of paramVariants) {
        try {
          const result = await this.request<any>('/points_leaderboard', params);
          const items = normalizeItems(result);
          if (import.meta.env.DEV) {
            console.log('[AMP API] Raw response:', { params, result, itemsCount: items.length });
          }
          if (items.length > 0) return items;
        } catch (e: any) {
          if (import.meta.env.DEV) {
            console.warn('[AMP API] Variant failed:', { params, message: e.message });
          }
        }
      }

      return [];
    } catch (e: any) {
      if (import.meta.env.DEV) {
        console.error('[AMP API] Failed:', e.message);
      }
      return [];
    }
  }
}

export const createDecibelClient = (
  apiKey: string,
  signal?: AbortSignal,
) => new DecibelClient(apiKey, signal);
