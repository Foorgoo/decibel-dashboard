import { create } from 'zustand';
import type { Account, Position, Order, Trade, PortfolioDataPoint, Market } from '../api/types';

export interface ManagedAccount {
  address: string;
  name?: string;
  isDefault?: boolean;
}

export interface SubaccountAlias {
  address: string;
  alias: string;
  owner?: string;
  ownerName?: string;
}

type AliasStorage = Record<string, Record<string, string>>;

const ALIAS_STORAGE_KEY = 'decibel_subaccount_aliases_mainnet';

const normalizeAddress = (address: string) => address.toLowerCase();

const readAliasStorage = (): AliasStorage => {
  try {
    const raw = JSON.parse(localStorage.getItem(ALIAS_STORAGE_KEY) || '{}');
    const nextStorage: AliasStorage = {};

    Object.entries(raw || {}).forEach(([key, value]) => {
      if (typeof value === 'string') {
        nextStorage.legacy = {
          ...(nextStorage.legacy || {}),
          [normalizeAddress(key)]: value,
        };
        return;
      }

      if (value && typeof value === 'object') {
        const owner = normalizeAddress(key);
        nextStorage[owner] = Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((aliases, [address, alias]) => {
          if (typeof alias === 'string' && alias.trim()) {
            aliases[normalizeAddress(address)] = alias;
          }
          return aliases;
        }, {});
      }
    });

    return nextStorage;
  } catch {
    return {};
  }
};

if (typeof window !== 'undefined') {
  localStorage.removeItem('decibel_api_key_testnet');
  localStorage.removeItem('decibel_network');
  localStorage.removeItem('decibel_subaccount_aliases_testnet');
}

const flattenAliasStorage = (storage: AliasStorage) =>
  Object.values(storage).reduce<Record<string, string>>((aliases, ownerAliases) => ({
    ...aliases,
    ...ownerAliases,
  }), {});

interface DashboardState {
  apiKey: string;
  accounts: ManagedAccount[];
  currentAccount: string | 'all' | null;
  
  account: Account | null;
  positions: Position[];
  openOrders: Order[];
  trades: Trade[];
  portfolioData: PortfolioDataPoint[];
  markets: Market[];
  marketMap: Map<string, string>;
  subaccounts: SubaccountAlias[];
  subaccountAliases: Record<string, string>;
  volume30d: number | null;
  amps: number | null;
  ampsDailyDelta: number | null;
  ampsRank: number | null;  
  
  isLoading: boolean;
  error: string | null;
  
  setApiKey: (key: string) => void;
  setAccounts: (accounts: ManagedAccount[]) => void;
  addAccount: (account: ManagedAccount) => void;
  removeAccount: (address: string) => void;
  setCurrentAccount: (address: string | 'all' | null) => void;
  updateAccountName: (address: string, name: string) => void;
  setAccount: (account: Account | null) => void;
  setPositions: (positions: Position[]) => void;
  setOpenOrders: (openOrders: Order[]) => void;
  setTrades: (trades: Trade[]) => void;
  setPortfolioData: (data: PortfolioDataPoint[]) => void;
  setMarkets: (markets: Market[]) => void;
  setMarketMap: (map: Map<string, string>) => void;
  setSubaccounts: (subaccounts: SubaccountAlias[]) => void;
  updateSubaccountAlias: (address: string, alias: string, owner?: string) => void;
  setVolume30d: (volume: number | null) => void;
  setAmps: (amps: number | null, rank?: number | null, dailyDelta?: number | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  apiKey: localStorage.getItem('decibel_api_key') || '',
  accounts: (() => {
    try {
      return JSON.parse(localStorage.getItem('decibel_accounts') || '[]');
    } catch {
      return [];
    }
  })(),
  currentAccount: localStorage.getItem('decibel_current_account') || null,
  
  account: null,
  positions: [],
  openOrders: [],
  trades: [],
  portfolioData: [],
  markets: [],
  marketMap: new Map<string, string>(),
  subaccounts: [],
  subaccountAliases: flattenAliasStorage(readAliasStorage()),
  volume30d: null,
  amps: null,
  ampsDailyDelta: null,
  ampsRank: null,
  
  isLoading: false,
  error: null,
  
  setApiKey: (key) => {
    localStorage.setItem('decibel_api_key', key);
    set({ apiKey: key });
  },
  setAccounts: (accounts) => {
    localStorage.setItem('decibel_accounts', JSON.stringify(accounts));
    set({ accounts });
  },
  addAccount: (account) => {
    const existingAccounts = get().accounts;
    if (existingAccounts.some(a => a.address.toLowerCase() === account.address.toLowerCase())) {
      return;
    }

    const accounts = [...existingAccounts, account];
    const currentAccount = get().currentAccount || account.address;
    localStorage.setItem('decibel_accounts', JSON.stringify(accounts));
    localStorage.setItem('decibel_current_account', currentAccount);
    set({ accounts, currentAccount });
  },
  removeAccount: (address) => {
    const accounts = get().accounts.filter(a => a.address !== address);
    localStorage.setItem('decibel_accounts', JSON.stringify(accounts));
    if (get().currentAccount === address) {
      localStorage.removeItem('decibel_current_account');
      set({ currentAccount: null, account: null, positions: [], openOrders: [], trades: [], portfolioData: [], volume30d: null, amps: null, ampsDailyDelta: null, ampsRank: null });
    }
    set({ accounts });
  },
  setCurrentAccount: (address) => {
    localStorage.setItem('decibel_current_account', address || '');
    set({ currentAccount: address, account: null, positions: [], openOrders: [], trades: [], portfolioData: [], volume30d: null, amps: null, ampsDailyDelta: null, ampsRank: null });
  },
  updateAccountName: (address, name) => {
    const accounts = get().accounts.map(a => a.address === address ? { ...a, name } : a);
    localStorage.setItem('decibel_accounts', JSON.stringify(accounts));
    set({ accounts });
  },
  setAccount: (account) => set({ account }),
  setPositions: (positions) => set({ positions }),
  setOpenOrders: (openOrders) => set({ openOrders }),
  setTrades: (trades) => set({ trades }),
  setPortfolioData: (portfolioData) => set({ portfolioData }),
  setMarkets: (markets) => set({ markets }),
  setMarketMap: (map) => set({ marketMap: map }),
  setSubaccounts: (subaccounts) => set({ subaccounts }),
  updateSubaccountAlias: (address, alias, owner) => {
    const storage = readAliasStorage();
    const ownerKey = owner ? normalizeAddress(owner) : 'legacy';
    const normalizedAddress = address.toLowerCase();

    if (alias.trim()) {
      storage[ownerKey] = {
        ...(storage[ownerKey] || {}),
        [normalizedAddress]: alias.trim(),
      };
    } else {
      delete storage[ownerKey]?.[normalizedAddress];
      delete storage.legacy?.[normalizedAddress];
      if (storage[ownerKey] && Object.keys(storage[ownerKey]).length === 0) {
        delete storage[ownerKey];
      }
      if (storage.legacy && Object.keys(storage.legacy).length === 0) {
        delete storage.legacy;
      }
    }

    localStorage.setItem(ALIAS_STORAGE_KEY, JSON.stringify(storage));
    set({ subaccountAliases: flattenAliasStorage(storage) });
  },
  setVolume30d: (volume30d) => set({ volume30d }),
  setAmps: (amps, rank = null, ampsDailyDelta = null) => set({ amps, ampsRank: rank, ampsDailyDelta }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
