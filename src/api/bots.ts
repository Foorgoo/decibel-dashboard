import type { BotConfig, BotEvent, BotStatus } from '../features/bots/types';
import { DEFAULT_BOT_STRATEGIES, getStrategyPatch } from '../features/bots/templates';
import type {
  AckAlertRequest,
  BotAction,
  BotActionRequest,
  BotApiEnvelope,
  BotApiError,
  BotBackupExport,
  BotBackupListing,
  BotRunnerStatus,
  BotSnapshot,
  GlobalKillSwitchRequest,
} from './botTypes';

const STORAGE_KEY = 'decibel_bot_snapshot_mainnet';
const BOT_API_TOKEN_KEY = 'decibel_bot_api_token';
const API_BASE = '/api';
type BotSyncSource = 'remote' | 'local';
let lastSyncSource: BotSyncSource = 'local';

const nowIso = () => new Date().toISOString();
const getStatusEventType = (status: BotStatus): BotEvent['type'] => {
  if (status === 'RUNNING') return '启动';
  if (status === 'PAUSED') return '暂停';
  if (status === 'TRIPPED') return '熔断';
  return '系统';
};

const getStatusEventMessage = (status: BotStatus, reason?: string) => {
  const action = status === 'RUNNING'
    ? '启动'
    : status === 'PAUSED'
      ? '暂停'
      : status === 'TRIPPED'
        ? '熔断'
        : '停止';
  return reason === 'batch-control' ? `批量${action}：从面板批量操作触发` : `${action}：从面板手动操作触发`;
};

const prependEvent = (snapshot: BotSnapshot, event: Omit<BotEvent, 'id' | 'createdAt'>) => {
  snapshot.events = [
    {
      ...event,
      id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: nowIso(),
    },
    ...(snapshot.events || []),
  ].slice(0, 120);
};

const createDefaultRuntime = (botId: string) => ({
  botId,
  status: 'STOPPED' as const,
  marketDataStatus: 'unknown' as const,
  executionStatus: 'unknown' as const,
  latencyMs: 0,
  pnlToday: 0,
  drawdownToday: 0,
  netExposure: 0,
  lastHeartbeatAt: nowIso(),
});
class BotApiRequestError extends Error {
  code?: string;
  requestId?: string;

  constructor(message: string, code?: string, requestId?: string) {
    super(message);
    this.name = 'BotApiRequestError';
    this.code = code;
    this.requestId = requestId;
  }
}
const createIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const defaultSnapshot = (): BotSnapshot => {
  const now = nowIso();
  return {
    bots: [
      {
        ...getStrategyPatch(DEFAULT_BOT_STRATEGIES[1]),
        botId: 'bot-mm-001',
        name: 'BTC Maker A',
        runMode: 'paper',
        ownerAddress: '0x-owner-a',
        subaccount: '0x-sub-a1',
        symbols: ['BTC'],
      },
      {
        ...getStrategyPatch(DEFAULT_BOT_STRATEGIES[1]),
        botId: 'bot-mm-002',
        name: 'ETH Maker B',
        runMode: 'paper',
        ownerAddress: '0x-owner-b',
        subaccount: '0x-sub-b1',
        symbols: ['ETH'],
      },
    ],
    runtimes: {
      'bot-mm-001': {
        botId: 'bot-mm-001',
        status: 'PAUSED',
        marketDataStatus: 'ok',
        executionStatus: 'unknown',
        latencyMs: 42,
        pnlToday: 0,
        drawdownToday: 0,
        netExposure: 0,
        lastHeartbeatAt: now,
      },
      'bot-mm-002': {
        botId: 'bot-mm-002',
        status: 'STOPPED',
        marketDataStatus: 'unknown',
        executionStatus: 'unknown',
        latencyMs: 0,
        pnlToday: 0,
        drawdownToday: 0,
        netExposure: 0,
        lastHeartbeatAt: now,
      },
    },
    alerts: [
      {
        id: 'alert-1',
        botId: 'bot-mm-001',
        level: 'warning',
        message: '滑点接近阈值，请检查盘口深度',
        createdAt: now,
        acked: false,
      },
    ],
    events: [
      {
        id: 'event-1',
        botId: 'bot-mm-001',
        type: '系统',
        message: 'Bot 数据已初始化',
        createdAt: now,
      },
    ],
    strategies: DEFAULT_BOT_STRATEGIES,
    riskRules: [
      {
        id: 'global-default',
        scope: 'global',
        target: 'GLOBAL',
        name: '全局默认限制',
        maxNotional: 150000,
        maxDailyLoss: 3000,
        maxRunningBots: 20,
        enabled: true,
      },
    ],
  };
};

const readLocalSnapshot = (): BotSnapshot => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSnapshot();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultSnapshot();
    return {
      bots: Array.isArray(parsed.bots) ? parsed.bots : [],
      runtimes: parsed.runtimes && typeof parsed.runtimes === 'object' ? parsed.runtimes : {},
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      strategies: Array.isArray(parsed.strategies) ? parsed.strategies : DEFAULT_BOT_STRATEGIES,
      riskRules: Array.isArray(parsed.riskRules) ? parsed.riskRules : defaultSnapshot().riskRules,
    };
  } catch {
    return defaultSnapshot();
  }
};

const writeLocalSnapshot = (snapshot: BotSnapshot) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
};

const maybeJson = async <T,>(res: Response): Promise<T> => {
  if (!res.ok) {
    let serverError: BotApiError | null = null;
    try {
      const payload = await res.json();
      serverError = payload?.error || null;
    } catch {
      // ignore parse failure
    }
    if (serverError?.message) {
      throw new BotApiRequestError(serverError.message, serverError.code, serverError.requestId);
    }
    throw new BotApiRequestError(`HTTP ${res.status}`);
  }
  return res.json();
};

const unwrapEnvelope = <T,>(payload: unknown): T => {
  const maybeEnvelope = payload as BotApiEnvelope<T>;
  if (maybeEnvelope && typeof maybeEnvelope === 'object' && 'data' in maybeEnvelope) {
    if (maybeEnvelope.error?.message) {
      throw new BotApiRequestError(
        maybeEnvelope.error.message,
        maybeEnvelope.error.code,
        maybeEnvelope.requestId || maybeEnvelope.error.requestId,
      );
    }
    return maybeEnvelope.data;
  }
  return payload as T;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const botApiToken = localStorage.getItem(BOT_API_TOKEN_KEY) || '';
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(botApiToken ? { 'X-Bot-Api-Token': botApiToken } : {}),
      ...(init?.headers || {}),
    },
  });
  const payload = await maybeJson<unknown>(res);
  return unwrapEnvelope<T>(payload);
}

async function postWithIdempotency<T, TBody extends { idempotencyKey: string }>(
  path: string,
  body: TBody,
): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: {
      'X-Idempotency-Key': body.idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

const localApi = {
  async getSnapshot(): Promise<BotSnapshot> {
    const snapshot = readLocalSnapshot();
    writeLocalSnapshot(snapshot);
    return snapshot;
  },
  async setStatus(botId: string, status: BotStatus, reason?: string): Promise<BotSnapshot> {
    const snapshot = readLocalSnapshot();
    snapshot.runtimes[botId] = {
      ...(snapshot.runtimes[botId] || {
        botId,
        pnlToday: 0,
        drawdownToday: 0,
        netExposure: 0,
      }),
      status,
      marketDataStatus: status === 'RUNNING' ? 'ok' : 'unknown',
      executionStatus: status === 'RUNNING'
        ? snapshot.bots.find((bot) => bot.botId === botId)?.runMode === 'monitor' ? 'unknown' : 'ok'
        : 'unknown',
      latencyMs: status === 'RUNNING' ? 35 : 0,
      activeRunMode: status === 'RUNNING'
        ? snapshot.bots.find((bot) => bot.botId === botId)?.runMode
        : undefined,
      lastHeartbeatAt: nowIso(),
    };
    if (status === 'TRIPPED') {
      snapshot.alerts.unshift({
        id: `alert-${Date.now()}`,
        botId,
        level: 'critical',
        message: 'Bot 已被手动熔断',
        createdAt: nowIso(),
        acked: false,
      });
    }
    prependEvent(snapshot, {
      botId,
      type: getStatusEventType(status),
      message: getStatusEventMessage(status, reason),
    });
    writeLocalSnapshot(snapshot);
    return snapshot;
  },
  async ackAlert(alertId: string): Promise<BotSnapshot> {
    const snapshot = readLocalSnapshot();
    snapshot.alerts = snapshot.alerts.map((item) => (item.id === alertId ? { ...item, acked: true } : item));
    const alert = snapshot.alerts.find((item) => item.id === alertId);
    prependEvent(snapshot, {
      botId: alert?.botId || 'GLOBAL',
      type: '告警' as const,
      message: '告警已确认',
    });
    writeLocalSnapshot(snapshot);
    return snapshot;
  },
  async globalKillSwitch(): Promise<BotSnapshot> {
    const snapshot = readLocalSnapshot();
    snapshot.bots.forEach((bot) => {
      snapshot.runtimes[bot.botId] = {
        ...(snapshot.runtimes[bot.botId] || {
          botId: bot.botId,
          pnlToday: 0,
          drawdownToday: 0,
          netExposure: 0,
        }),
        status: 'TRIPPED',
        marketDataStatus: 'down',
        executionStatus: 'down',
        latencyMs: 0,
        activeRunMode: undefined,
        lastHeartbeatAt: nowIso(),
      };
    });
    snapshot.alerts.unshift({
      id: `alert-${Date.now()}`,
      botId: 'GLOBAL',
      level: 'critical',
      message: '全局 Kill Switch 已触发',
      createdAt: nowIso(),
      acked: false,
    });
    prependEvent(snapshot, {
      botId: 'GLOBAL',
      type: '熔断' as const,
      message: '全部 bot 已紧急停止',
    });
    writeLocalSnapshot(snapshot);
    return snapshot;
  },
  async upsertBot(bot: BotSnapshot['bots'][number]): Promise<BotSnapshot> {
    const snapshot = readLocalSnapshot();
    const existingIndex = snapshot.bots.findIndex((item) => item.botId === bot.botId);
    if (existingIndex >= 0) {
      snapshot.bots[existingIndex] = bot;
    } else {
      snapshot.bots.unshift(bot);
      snapshot.runtimes[bot.botId] = createDefaultRuntime(bot.botId);
    }
    prependEvent(snapshot, {
      botId: bot.botId,
      type: '系统' as const,
      message: existingIndex >= 0 ? 'Bot 配置已更新' : 'Bot 已创建',
    });
    writeLocalSnapshot(snapshot);
    return snapshot;
  },
  async deleteBot(botId: string): Promise<BotSnapshot> {
    const snapshot = readLocalSnapshot();
    const bot = snapshot.bots.find((item) => item.botId === botId);
    snapshot.bots = snapshot.bots.filter((item) => item.botId !== botId);
    delete snapshot.runtimes[botId];
    snapshot.alerts = snapshot.alerts.filter((alert) => alert.botId !== botId);
    snapshot.events = (snapshot.events || []).filter((event) => event.botId !== botId);
    prependEvent(snapshot, {
      botId: 'GLOBAL',
      type: '系统' as const,
      message: `${bot?.name || botId} 已删除`,
    });
    writeLocalSnapshot(snapshot);
    return snapshot;
  },
  async upsertStrategy(strategy: NonNullable<BotSnapshot['strategies']>[number]): Promise<BotSnapshot> {
    const snapshot = readLocalSnapshot();
    const strategies = snapshot.strategies || DEFAULT_BOT_STRATEGIES;
    const existingIndex = strategies.findIndex((item) => item.id === strategy.id);
    if (existingIndex >= 0) {
      strategies[existingIndex] = strategy;
    } else {
      strategies.unshift(strategy);
    }
    snapshot.strategies = strategies;
    prependEvent(snapshot, {
      botId: 'GLOBAL',
      type: '系统' as const,
      message: existingIndex >= 0 ? `策略已更新：${strategy.name}` : `策略已创建：${strategy.name}`,
    });
    writeLocalSnapshot(snapshot);
    return snapshot;
  },
  async deleteStrategy(strategyId: string): Promise<BotSnapshot> {
    const snapshot = readLocalSnapshot();
    const strategy = (snapshot.strategies || DEFAULT_BOT_STRATEGIES).find((item) => item.id === strategyId);
    snapshot.strategies = (snapshot.strategies || DEFAULT_BOT_STRATEGIES).filter((item) => item.id !== strategyId);
    prependEvent(snapshot, {
      botId: 'GLOBAL',
      type: '系统' as const,
      message: `策略已删除：${strategy?.name || strategyId}`,
    });
    writeLocalSnapshot(snapshot);
    return snapshot;
  },
  async upsertRiskRule(rule: NonNullable<BotSnapshot['riskRules']>[number]): Promise<BotSnapshot> {
    const snapshot = readLocalSnapshot();
    const rules = snapshot.riskRules || [];
    const existingIndex = rules.findIndex((item) => item.id === rule.id);
    if (existingIndex >= 0) {
      rules[existingIndex] = rule;
    } else {
      rules.unshift(rule);
    }
    snapshot.riskRules = rules;
    prependEvent(snapshot, {
      botId: 'GLOBAL',
      type: '系统' as const,
      message: existingIndex >= 0 ? `风控规则已更新：${rule.name}` : `风控规则已创建：${rule.name}`,
    });
    writeLocalSnapshot(snapshot);
    return snapshot;
  },
  async deleteRiskRule(ruleId: string): Promise<BotSnapshot> {
    const snapshot = readLocalSnapshot();
    const rule = (snapshot.riskRules || []).find((item) => item.id === ruleId);
    snapshot.riskRules = (snapshot.riskRules || []).filter((item) => item.id !== ruleId);
    prependEvent(snapshot, {
      botId: 'GLOBAL',
      type: '系统' as const,
      message: `风控规则已删除：${rule?.name || ruleId}`,
    });
    writeLocalSnapshot(snapshot);
    return snapshot;
  },
};

const shouldUseLocalFallback = (error: unknown) => !(error instanceof BotApiRequestError && error.code);

export const botApi = {
  async getSnapshot(): Promise<BotSnapshot> {
    try {
      const data = await request<BotSnapshot>('/bots');
      lastSyncSource = 'remote';
      return data;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      lastSyncSource = 'local';
      return localApi.getSnapshot();
    }
  },
  async setStatus(botId: string, status: BotStatus, reason = 'dashboard-control', botConfig?: BotConfig): Promise<BotSnapshot> {
    try {
      const actionPath: BotAction = status === 'RUNNING'
        ? 'start'
        : status === 'PAUSED'
          ? 'pause'
          : status === 'TRIPPED'
            ? 'trip'
            : 'stop';
      const bot = botConfig || readLocalSnapshot().bots.find((item) => item.botId === botId);
      if (!bot) {
        throw new BotApiRequestError('Bot 不存在', 'BOT_NOT_FOUND');
      }
      const body: BotActionRequest = {
        idempotencyKey: createIdempotencyKey(),
        action: actionPath,
        bot,
        runMode: bot.runMode,
        reason,
      };
      const data = await postWithIdempotency<BotSnapshot, BotActionRequest>(`/bots/${botId}/${actionPath}`, body);
      lastSyncSource = 'remote';
      return data;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      lastSyncSource = 'local';
      return localApi.setStatus(botId, status, reason);
    }
  },
  async ackAlert(alertId: string): Promise<BotSnapshot> {
    try {
      const body: AckAlertRequest = {
        idempotencyKey: createIdempotencyKey(),
      };
      const data = await postWithIdempotency<BotSnapshot, AckAlertRequest>(`/alerts/${alertId}/ack`, body);
      lastSyncSource = 'remote';
      return data;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      lastSyncSource = 'local';
      return localApi.ackAlert(alertId);
    }
  },
  async globalKillSwitch(): Promise<BotSnapshot> {
    try {
      const body: GlobalKillSwitchRequest = {
        idempotencyKey: createIdempotencyKey(),
        reason: 'dashboard-kill-switch',
      };
      const data = await postWithIdempotency<BotSnapshot, GlobalKillSwitchRequest>('/risk/global-kill-switch', body);
      lastSyncSource = 'remote';
      return data;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      lastSyncSource = 'local';
      return localApi.globalKillSwitch();
    }
  },
  async upsertBot(bot: BotSnapshot['bots'][number]): Promise<BotSnapshot> {
    try {
      const data = await request<BotSnapshot>(`/bots/${bot.botId}`, {
        method: 'PUT',
        body: JSON.stringify(bot),
      });
      lastSyncSource = 'remote';
      return data;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      lastSyncSource = 'local';
      return localApi.upsertBot(bot);
    }
  },
  async deleteBot(botId: string): Promise<BotSnapshot> {
    try {
      const data = await request<BotSnapshot>(`/bots/${botId}`, { method: 'DELETE' });
      lastSyncSource = 'remote';
      return data;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      lastSyncSource = 'local';
      return localApi.deleteBot(botId);
    }
  },
  async upsertStrategy(strategy: NonNullable<BotSnapshot['strategies']>[number]): Promise<BotSnapshot> {
    try {
      const data = await request<BotSnapshot>(`/bot-strategies/${strategy.id}`, {
        method: 'PUT',
        body: JSON.stringify(strategy),
      });
      lastSyncSource = 'remote';
      return data;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      lastSyncSource = 'local';
      return localApi.upsertStrategy(strategy);
    }
  },
  async deleteStrategy(strategyId: string): Promise<BotSnapshot> {
    try {
      const data = await request<BotSnapshot>(`/bot-strategies/${strategyId}`, { method: 'DELETE' });
      lastSyncSource = 'remote';
      return data;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      lastSyncSource = 'local';
      return localApi.deleteStrategy(strategyId);
    }
  },
  async upsertRiskRule(rule: NonNullable<BotSnapshot['riskRules']>[number]): Promise<BotSnapshot> {
    try {
      const data = await request<BotSnapshot>(`/bot-risk-rules/${rule.id}`, {
        method: 'PUT',
        body: JSON.stringify(rule),
      });
      lastSyncSource = 'remote';
      return data;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      lastSyncSource = 'local';
      return localApi.upsertRiskRule(rule);
    }
  },
  async deleteRiskRule(ruleId: string): Promise<BotSnapshot> {
    try {
      const data = await request<BotSnapshot>(`/bot-risk-rules/${ruleId}`, { method: 'DELETE' });
      lastSyncSource = 'remote';
      return data;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) throw error;
      lastSyncSource = 'local';
      return localApi.deleteRiskRule(ruleId);
    }
  },
};

export { BotApiRequestError };
export const getBotLastSyncSource = (): BotSyncSource => lastSyncSource;
export const getBotApiToken = () => localStorage.getItem(BOT_API_TOKEN_KEY) || '';
export const setBotApiToken = (token: string) => {
  const nextToken = token.trim();
  if (nextToken) {
    localStorage.setItem(BOT_API_TOKEN_KEY, nextToken);
  } else {
    localStorage.removeItem(BOT_API_TOKEN_KEY);
  }
};

export const botAdminApi = {
  getRunnerStatus: () => request<BotRunnerStatus>('/runner/status'),
  exportBackup: () => request<BotBackupExport>('/admin/backup'),
  listBackups: () => request<BotBackupListing>('/admin/backups'),
  restoreBackup: (snapshot: BotSnapshot) => request<BotSnapshot>('/admin/restore', {
    method: 'POST',
    body: JSON.stringify({ snapshot }),
  }),
};
