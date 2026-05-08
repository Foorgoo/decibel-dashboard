export type AppMode = 'dashboard' | 'trading';

const rawMode = import.meta.env.VITE_APP_MODE;

export const APP_MODE: AppMode = rawMode === 'trading' ? 'trading' : 'dashboard';
export const IS_TRADING_MODE = APP_MODE === 'trading';

