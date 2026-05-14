import type { BotAlert, BotConfig, BotEvent, BotRiskRule, BotRuntime, BotStrategy } from '../features/bots/types';

export type BotErrorCode =
  | 'BOT_NOT_FOUND'
  | 'BOT_INVALID_STATUS'
  | 'BOT_RISK_BLOCKED'
  | 'BOT_IDEMPOTENCY_CONFLICT'
  | 'BOT_UNAUTHORIZED'
  | 'BOT_BAD_REQUEST'
  | 'BOT_PAYLOAD_TOO_LARGE'
  | 'ALERT_NOT_FOUND'
  | 'RISK_KILL_SWITCH_LOCKED'
  | 'INTERNAL_ERROR';

export interface BotApiError {
  code: BotErrorCode;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

export interface BotSnapshot {
  bots: BotConfig[];
  runtimes: Record<string, BotRuntime>;
  alerts: BotAlert[];
  events?: BotEvent[];
  strategies?: BotStrategy[];
  riskRules?: BotRiskRule[];
}

export interface BotApiEnvelope<T> {
  data: T;
  error?: BotApiError | null;
  requestId?: string;
  serverTime?: string;
}

export type BotAction = 'start' | 'pause' | 'trip' | 'stop';

export interface BotActionRequest {
  idempotencyKey: string;
  action: BotAction;
  bot: BotConfig;
  runMode: BotConfig['runMode'];
  reason?: string;
}

export interface AckAlertRequest {
  idempotencyKey: string;
}

export interface GlobalKillSwitchRequest {
  idempotencyKey: string;
  reason?: string;
}

export interface BotRunnerStatus {
  enabled: boolean;
  intervalMs: number;
  source: 'mock' | 'readonly' | 'live';
  lastTickAt: string | null;
  lastError: string | null;
  tickCount: number;
  runningCount: number;
  botCount: number;
}

export interface BotBackupExport {
  exportedAt: string;
  snapshot: BotSnapshot;
}

export interface BotBackupListing {
  backupDir: string;
  backups: Array<{
    name: string;
    size: number;
    createdAt: string;
  }>;
}
