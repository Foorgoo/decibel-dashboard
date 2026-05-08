import { Ed25519Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';

const SESSION_STORAGE_KEY = 'decibel_trading_session_key_mainnet';
const DELEGATIONS_STORAGE_KEY = 'decibel_trading_delegations_mainnet';

export interface StoredTradingSession {
  address: string;
  privateKey: string;
  expiresAtSecs: number;
  createdAt: string;
}

export interface StoredDelegation {
  subaccount: string;
  sessionAddress: string;
  expiresAtSecs: number;
  txHash?: string;
  updatedAt: string;
}

export type DelegationStorage = Record<string, StoredDelegation>;

const normalizeAddress = (address: string) => address.toLowerCase();

const getOwnerScopedKey = (baseKey: string, owner?: string | null) => (
  owner ? `${baseKey}_${normalizeAddress(owner)}` : baseKey
);

export const getDefaultSessionExpirationSecs = () => Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

export const loadTradingSession = (owner?: string | null): StoredTradingSession | null => {
  try {
    const session = JSON.parse(localStorage.getItem(getOwnerScopedKey(SESSION_STORAGE_KEY, owner)) || 'null') as StoredTradingSession | null;
    if (!session?.address || !session.privateKey || !session.expiresAtSecs) return null;
    return session;
  } catch {
    return null;
  }
};

export const createTradingSession = (expiresAtSecs = getDefaultSessionExpirationSecs(), owner?: string | null) => {
  const account = Ed25519Account.generate();
  const session: StoredTradingSession = {
    address: account.accountAddress.toString(),
    privateKey: String(account.privateKey),
    expiresAtSecs,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(getOwnerScopedKey(SESSION_STORAGE_KEY, owner), JSON.stringify(session));
  return session;
};

export const getOrCreateTradingSession = (expiresAtSecs = getDefaultSessionExpirationSecs(), owner?: string | null) => {
  const existing = loadTradingSession(owner);
  if (existing && existing.expiresAtSecs > Math.floor(Date.now() / 1000) + 60) {
    const extendedSession = {
      ...existing,
      expiresAtSecs: Math.max(existing.expiresAtSecs, expiresAtSecs),
    };
    if (extendedSession.expiresAtSecs !== existing.expiresAtSecs) {
      localStorage.setItem(getOwnerScopedKey(SESSION_STORAGE_KEY, owner), JSON.stringify(extendedSession));
    }
    return extendedSession;
  }
  return createTradingSession(expiresAtSecs, owner);
};

export const clearTradingSession = (owner?: string | null) => {
  localStorage.removeItem(getOwnerScopedKey(SESSION_STORAGE_KEY, owner));
  localStorage.removeItem(getOwnerScopedKey(DELEGATIONS_STORAGE_KEY, owner));
};

export const sessionToAccount = (session: StoredTradingSession) => new Ed25519Account({
  privateKey: new Ed25519PrivateKey(session.privateKey),
});

export const loadDelegations = (owner?: string | null): DelegationStorage => {
  try {
    return JSON.parse(localStorage.getItem(getOwnerScopedKey(DELEGATIONS_STORAGE_KEY, owner)) || '{}') as DelegationStorage;
  } catch {
    return {};
  }
};

export const saveDelegation = (delegation: StoredDelegation, owner?: string | null) => {
  const storage = loadDelegations(owner);
  storage[normalizeAddress(delegation.subaccount)] = delegation;
  localStorage.setItem(getOwnerScopedKey(DELEGATIONS_STORAGE_KEY, owner), JSON.stringify(storage));
  return storage;
};

export const isSubaccountDelegated = (subaccount?: string, owner?: string | null) => {
  if (!subaccount) return false;
  const session = loadTradingSession(owner);
  if (!session) return false;

  const delegation = loadDelegations(owner)[normalizeAddress(subaccount)];
  const nowSecs = Math.floor(Date.now() / 1000);

  return Boolean(
    delegation
      && delegation.sessionAddress.toLowerCase() === session.address.toLowerCase()
      && delegation.expiresAtSecs > nowSecs
      && session.expiresAtSecs > nowSecs,
  );
};

export const formatExpiration = (expiresAtSecs?: number) => {
  if (!expiresAtSecs) return '-';
  return new Date(expiresAtSecs * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};
