export type CloseOrderMode = 'limit' | 'market';

export interface ClosePositionDraft {
  mode: CloseOrderMode;
  market: string;
  marketName: string;
  subaccount: string;
  size: number;
  side: 'long' | 'short';
  closeSide: 'BUY' | 'SELL';
  markPrice: number;
  limitPrice: number;
  slippagePercent: number;
  postOnly: boolean;
}

