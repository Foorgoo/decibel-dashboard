export type BotStatus = 'RUNNING' | 'PAUSED' | 'STOPPED' | 'TRIPPED';
export type BotRunMode = 'monitor' | 'paper' | 'live';
export type BotHealthStatus = 'ok' | 'warning' | 'down' | 'unknown';

export interface BotConfig {
  botId: string;
  name: string;
  runMode: BotRunMode;
  ownerAddress: string;
  subaccount?: string;
  strategyId: string;
  strategyVersion: string;
  symbols: string[];
  maxNotional: number;
  maxPosition: number;
  maxDailyLoss: number;
  maxSlippageBps: number;
  orderRateLimitPerMin: number;
  quoteSpreadBps?: number;
  orderLevels?: number;
  levelSpacingBps?: number;
  refreshIntervalSec?: number;
  minOrderSize?: number;
  maxOrderSize?: number;
  inventorySkewBps?: number;
  targetInventoryPct?: number;
  cancelStaleAfterSec?: number;
  postOnly?: boolean;
  heartbeatTimeoutSec?: number;
  maxConsecutiveErrors?: number;
  maxLatencyMs?: number;
}

export interface BotStrategy {
  id: string;
  name: string;
  description: string;
  strategyId: string;
  strategyVersion: string;
  maxNotional: number;
  maxPosition: number;
  maxDailyLoss: number;
  maxSlippageBps: number;
  orderRateLimitPerMin: number;
  quoteSpreadBps: number;
  orderLevels: number;
  levelSpacingBps: number;
  refreshIntervalSec: number;
  minOrderSize: number;
  maxOrderSize: number;
  inventorySkewBps: number;
  targetInventoryPct: number;
  cancelStaleAfterSec: number;
  postOnly: boolean;
  heartbeatTimeoutSec: number;
  maxConsecutiveErrors: number;
  maxLatencyMs: number;
}

export interface BotRuntime {
  botId: string;
  status: BotStatus;
  activeRunMode?: BotRunMode;
  marketDataStatus?: BotHealthStatus;
  executionStatus?: BotHealthStatus;
  latencyMs?: number;
  pnlToday: number;
  drawdownToday: number;
  netExposure: number;
  lastHeartbeatAt: string;
  lastError?: string;
}

export interface BotAlert {
  id: string;
  botId: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
  createdAt: string;
  acked: boolean;
}

export interface BotEvent {
  id: string;
  botId: string;
  type: '启动' | '暂停' | '熔断' | '告警' | '系统';
  message: string;
  createdAt: string;
}

export interface BotRiskRule {
  id: string;
  scope: 'account' | 'market' | 'global';
  target: string;
  name: string;
  maxNotional: number;
  maxDailyLoss: number;
  maxRunningBots: number;
  enabled: boolean;
}
