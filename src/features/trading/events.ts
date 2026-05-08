export const TRADING_REFRESH_EVENT = 'decibel:trading-refresh';
export const TRADING_TOAST_EVENT = 'decibel:trading-toast';
export const TRADING_AUTH_EVENT = 'decibel:trading-auth';
export const TRADING_CONFIG_EVENT = 'decibel:trading-config';
export const TRADING_AUTH_STATE_EVENT = 'decibel:trading-auth-state';

export type TradingToastType = 'success' | 'error' | 'warning';

export interface TradingToastDetail {
  type: TradingToastType;
  title: string;
  message?: string;
}

export const notifyTradingToast = (detail: TradingToastDetail) => {
  window.dispatchEvent(new CustomEvent<TradingToastDetail>(TRADING_TOAST_EVENT, { detail }));
};

export const openTradingAuthorization = () => {
  window.dispatchEvent(new Event(TRADING_AUTH_EVENT));
};

export const openTradingConfig = () => {
  window.dispatchEvent(new Event(TRADING_CONFIG_EVENT));
};

export const notifyTradingAuthStateChanged = () => {
  window.dispatchEvent(new Event(TRADING_AUTH_STATE_EVENT));
};
