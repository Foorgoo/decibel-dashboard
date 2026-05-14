import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite';
import type { BotAction, BotActionRequest, BotApiEnvelope, BotApiError, BotSnapshot } from '../src/api/botTypes';
import { DEFAULT_BOT_STRATEGIES, getStrategyPatch } from '../src/features/bots/templates';
import type { BotConfig, BotEvent, BotRiskRule, BotRuntime, BotStatus } from '../src/features/bots/types';
import { validateBotConfig, validateRiskRulesForStart } from '../src/features/bots/validation';

const API_PREFIX = '/api';
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_BACKUPS = 20;

type BotBackendOptions = {
  storagePath?: string;
  apiToken?: string;
  runnerSource?: RunnerSourceMode;
};

type RunnerSourceMode = 'mock' | 'readonly' | 'live';

type RunnerStats = {
  enabled: boolean;
  intervalMs: number;
  source: RunnerSourceMode;
  lastTickAt: string | null;
  lastError: string | null;
  tickCount: number;
};

type CachedIdempotency = {
  bodyHash: string;
  createdAt: number;
  response: BotSnapshot;
};

const idempotencyCache = new Map<string, CachedIdempotency>();
const runnerStats: RunnerStats = {
  enabled: false,
  intervalMs: 0,
  source: 'mock',
  lastTickAt: null,
  lastError: null,
  tickCount: 0,
};

const nowIso = () => new Date().toISOString();
const requestId = () => `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const eventId = () => `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const alertId = () => `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const getStoragePath = (options?: BotBackendOptions) => (
  options?.storagePath || process.env.BOT_DATA_PATH || resolve(process.cwd(), '.bot-backend.local')
);
const getBackupDir = (storagePath: string) => process.env.BOT_BACKUP_DIR || resolve(dirname(storagePath), 'backups');
const getRunnerSource = (options?: BotBackendOptions): RunnerSourceMode => {
  const source = options?.runnerSource || process.env.BOT_RUNNER_SOURCE || 'mock';
  return source === 'readonly' || source === 'live' ? source : 'mock';
};

const createRuntime = (botId: string): BotRuntime => ({
  botId,
  status: 'STOPPED',
  marketDataStatus: 'unknown',
  executionStatus: 'unknown',
  latencyMs: 0,
  pnlToday: 0,
  drawdownToday: 0,
  netExposure: 0,
  lastHeartbeatAt: nowIso(),
});

const appendEvent = (snapshot: BotSnapshot, event: Omit<BotEvent, 'id' | 'createdAt'>) => {
  snapshot.events = [
    { ...event, id: eventId(), createdAt: nowIso() },
    ...(snapshot.events || []),
  ].slice(0, 200);
};

const defaultSnapshot = (): BotSnapshot => {
  const baseStrategy = DEFAULT_BOT_STRATEGIES[1];
  const now = nowIso();
  return {
    bots: [
      {
        ...getStrategyPatch(baseStrategy),
        botId: 'bot-mm-001',
        name: 'BTC Maker A',
        runMode: 'paper',
        ownerAddress: '0x-owner-a',
        subaccount: '0x-sub-a1',
        symbols: ['BTC'],
      },
      {
        ...getStrategyPatch(baseStrategy),
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
        ...createRuntime('bot-mm-001'),
        status: 'PAUSED',
        marketDataStatus: 'ok',
        latencyMs: 42,
        lastHeartbeatAt: now,
      },
      'bot-mm-002': createRuntime('bot-mm-002'),
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
        botId: 'GLOBAL',
        type: '系统',
        message: '本地 Bot 后端已初始化',
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

const normalizeSnapshot = (snapshot: BotSnapshot): BotSnapshot => {
  const runtimes = { ...(snapshot.runtimes || {}) };
  snapshot.bots.forEach((bot) => {
    runtimes[bot.botId] = {
      ...createRuntime(bot.botId),
      ...(runtimes[bot.botId] || {}),
      botId: bot.botId,
    };
  });
  return {
    bots: Array.isArray(snapshot.bots) ? snapshot.bots : [],
    runtimes,
    alerts: Array.isArray(snapshot.alerts) ? snapshot.alerts : [],
    events: Array.isArray(snapshot.events) ? snapshot.events : [],
    strategies: Array.isArray(snapshot.strategies) ? snapshot.strategies : DEFAULT_BOT_STRATEGIES,
    riskRules: Array.isArray(snapshot.riskRules) ? snapshot.riskRules : defaultSnapshot().riskRules,
  };
};

const readSnapshot = (storagePath: string): BotSnapshot => {
  if (!existsSync(storagePath)) return defaultSnapshot();
  try {
    const raw = readFileSync(storagePath, 'utf8');
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return defaultSnapshot();
  }
};

const writeSnapshot = (storagePath: string, snapshot: BotSnapshot) => {
  const tempPath = `${storagePath}.tmp`;
  mkdirSync(dirname(storagePath), { recursive: true });
  writeFileSync(tempPath, JSON.stringify(normalizeSnapshot(snapshot), null, 2));
  renameSync(tempPath, storagePath);
};

const backupSnapshot = (storagePath: string, reason: string) => {
  if (!existsSync(storagePath)) return null;
  const backupDir = getBackupDir(storagePath);
  mkdirSync(backupDir, { recursive: true });
  const safeReason = reason.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const backupPath = resolve(backupDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${safeReason}.json`);
  writeFileSync(backupPath, readFileSync(storagePath, 'utf8'));
  const backups = readdirSync(backupDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({ name, path: resolve(backupDir, name), mtimeMs: statSync(resolve(backupDir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  backups.slice(MAX_BACKUPS).forEach((backup) => unlinkSync(backup.path));
  return backupPath;
};

const listBackups = (storagePath: string) => {
  const backupDir = getBackupDir(storagePath);
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const path = resolve(backupDir, name);
      const stat = statSync(path);
      return {
        name,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

const persistSnapshot = (storagePath: string, snapshot: BotSnapshot, reason: string) => {
  backupSnapshot(storagePath, reason);
  writeSnapshot(storagePath, snapshot);
};

const makeError = (code: BotApiError['code'], message: string, details?: Record<string, unknown>): BotApiError => ({
  code,
  message,
  details,
});

const sendJson = <T,>(res: ServerResponse, statusCode: number, data: T, error: BotApiError | null = null) => {
  const payload: BotApiEnvelope<T> = {
    data,
    error,
    requestId: requestId(),
    serverTime: nowIso(),
  };
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json;charset=utf-8');
  res.end(JSON.stringify(payload));
};

const sendError = (res: ServerResponse, statusCode: number, error: BotApiError) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json;charset=utf-8');
  res.end(JSON.stringify({ error: { ...error, requestId: requestId() } }));
};

const readBody = async <T,>(req: IncomingMessage): Promise<T> => new Promise((resolveBody, reject) => {
  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += Buffer.byteLength(chunk);
    if (size > MAX_BODY_BYTES) {
      reject(makeError('BOT_PAYLOAD_TOO_LARGE', '请求内容太大'));
      req.destroy();
      return;
    }
    chunks.push(Buffer.from(chunk));
  });
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) {
      resolveBody({} as T);
      return;
    }
    try {
      resolveBody(JSON.parse(raw) as T);
    } catch (error) {
      reject(makeError('BOT_BAD_REQUEST', 'JSON 格式不正确'));
    }
  });
  req.on('error', reject);
});

const runningBotCountForRule = (snapshot: BotSnapshot, rule: BotRiskRule) => snapshot.bots.filter((bot) => {
  const runtime = snapshot.runtimes[bot.botId];
  if (runtime?.status !== 'RUNNING') return false;
  if (rule.scope === 'global') return true;
  if (rule.scope === 'account') return bot.ownerAddress.toLowerCase() === rule.target.toLowerCase();
  return bot.symbols.some((symbol) => symbol.toLowerCase() === rule.target.toLowerCase());
}).length;

const getMockRuntimePatch = (bot: BotConfig, runtime: BotRuntime, index: number): Partial<BotRuntime> => {
  const now = Date.now();
  const wave = Math.sin(now / 45_000 + index);
  const pnlStep = Number((wave * Math.max(bot.maxNotional, 1) * 0.00002).toFixed(2));
  const pnlToday = Number(((runtime.pnlToday || 0) + pnlStep).toFixed(2));
  const latencyMs = Math.max(18, Math.round(48 + Math.abs(wave) * 58 + index * 7));
  return {
    activeRunMode: bot.runMode,
    marketDataStatus: 'ok',
    executionStatus: bot.runMode === 'monitor' ? 'unknown' : 'ok',
    latencyMs,
    pnlToday,
    drawdownToday: Math.min(0, pnlToday),
    netExposure: Number((wave * Math.max(bot.maxPosition, 0) * 0.35).toFixed(4)),
    lastHeartbeatAt: nowIso(),
  };
};

const getReadonlyRuntimePatch = (bot: BotConfig, runtime: BotRuntime): Partial<BotRuntime> => ({
  activeRunMode: bot.runMode,
  marketDataStatus: 'unknown',
  executionStatus: bot.runMode === 'monitor' ? 'unknown' : 'warning',
  latencyMs: 0,
  pnlToday: runtime.pnlToday || 0,
  drawdownToday: runtime.drawdownToday || 0,
  netExposure: runtime.netExposure || 0,
  lastHeartbeatAt: nowIso(),
  lastError: '只读数据源尚未接入真实行情/账户',
});

const getLiveRuntimePatch = (bot: BotConfig, runtime: BotRuntime): Partial<BotRuntime> => ({
  ...getReadonlyRuntimePatch(bot, runtime),
  executionStatus: 'down',
  lastError: '实盘数据源尚未接入真实交易 Runner',
});

const getRuntimePatch = (source: RunnerSourceMode, bot: BotConfig, runtime: BotRuntime, index: number) => {
  if (source === 'readonly') return getReadonlyRuntimePatch(bot, runtime);
  if (source === 'live') return getLiveRuntimePatch(bot, runtime);
  return getMockRuntimePatch(bot, runtime, index);
};

const tickRunner = (snapshot: BotSnapshot, source: RunnerSourceMode) => {
  snapshot.bots.forEach((bot, index) => {
    const runtime = snapshot.runtimes[bot.botId] || createRuntime(bot.botId);
    if (runtime.status !== 'RUNNING') {
      snapshot.runtimes[bot.botId] = runtime;
      return;
    }
    const runtimePatch = getRuntimePatch(source, bot, runtime, index);
    const nextRuntime: BotRuntime = {
      ...runtime,
      status: 'RUNNING',
      ...runtimePatch,
    };
    const tripReason = Math.abs(nextRuntime.drawdownToday) >= bot.maxDailyLoss
      ? `日亏损达到上限：$${Math.abs(nextRuntime.drawdownToday).toLocaleString()}`
      : nextRuntime.latencyMs > (bot.maxLatencyMs || Number.POSITIVE_INFINITY)
        ? `延迟超过上限：${nextRuntime.latencyMs}ms`
        : null;
    if (tripReason) {
      snapshot.runtimes[bot.botId] = {
        ...nextRuntime,
        status: 'TRIPPED',
        activeRunMode: undefined,
        marketDataStatus: 'down',
        executionStatus: 'down',
        latencyMs: 0,
        lastError: tripReason,
      };
      snapshot.alerts.unshift({
        id: alertId(),
        botId: bot.botId,
        level: 'critical',
        message: `自动熔断：${tripReason}`,
        createdAt: nowIso(),
        acked: false,
      });
      appendEvent(snapshot, {
        botId: bot.botId,
        type: '熔断',
        message: `自动熔断：${tripReason}`,
      });
      return;
    }
    snapshot.runtimes[bot.botId] = nextRuntime;
  });
};

export const runBotRunnerTick = (options?: BotBackendOptions) => {
  const storagePath = getStoragePath(options);
  const runnerSource = getRunnerSource(options);
  const snapshot = readSnapshot(storagePath);
  tickRunner(snapshot, runnerSource);
  writeSnapshot(storagePath, snapshot);
  runnerStats.source = runnerSource;
  runnerStats.lastTickAt = nowIso();
  runnerStats.lastError = null;
  runnerStats.tickCount += 1;
  return snapshot;
};

export const getRunnerStats = () => ({ ...runnerStats });

export const setRunnerEnabled = (enabled: boolean, intervalMs = runnerStats.intervalMs, source: RunnerSourceMode = runnerStats.source) => {
  runnerStats.enabled = enabled;
  runnerStats.intervalMs = intervalMs;
  runnerStats.source = source;
};

export const setRunnerError = (error: unknown) => {
  runnerStats.lastError = error instanceof Error ? error.message : String(error);
};

const enforceRisk = (snapshot: BotSnapshot, bot: BotConfig): string[] => {
  const issues = validateBotConfig(bot);
  if (issues.length > 0) return issues;
  const ruleIssues = validateRiskRulesForStart(bot, snapshot.bots, snapshot.runtimes, snapshot.riskRules || []);
  const enabledRules = (snapshot.riskRules || []).filter((rule) => rule.enabled);
  enabledRules.forEach((rule) => {
    const matches = rule.scope === 'global'
      || (rule.scope === 'account' && rule.target.toLowerCase() === bot.ownerAddress.toLowerCase())
      || (rule.scope === 'market' && bot.symbols.some((symbol) => symbol.toLowerCase() === rule.target.toLowerCase()));
    if (!matches) return;
    if (runningBotCountForRule(snapshot, rule) >= rule.maxRunningBots && snapshot.runtimes[bot.botId]?.status !== 'RUNNING') {
      ruleIssues.push(`${rule.name} 已达到最多运行 Bot 数`);
    }
  });
  return Array.from(new Set(ruleIssues));
};

const upsertBotInSnapshot = (snapshot: BotSnapshot, bot: BotConfig) => {
  const index = snapshot.bots.findIndex((item) => item.botId === bot.botId);
  if (index >= 0) {
    snapshot.bots[index] = bot;
  } else {
    snapshot.bots.unshift(bot);
  }
  snapshot.runtimes[bot.botId] = snapshot.runtimes[bot.botId] || createRuntime(bot.botId);
  return index >= 0;
};

const handleBotAction = (snapshot: BotSnapshot, botId: string, action: BotAction, body: BotActionRequest): BotSnapshot => {
  const bot = body.bot || snapshot.bots.find((item) => item.botId === botId);
  if (!bot || bot.botId !== botId) {
    throw makeError('BOT_NOT_FOUND', 'Bot 不存在');
  }
  upsertBotInSnapshot(snapshot, bot);
  if (action === 'start') {
    const issues = enforceRisk(snapshot, bot);
    if (issues.length > 0) {
      throw makeError('BOT_RISK_BLOCKED', `启动被风控拦截：${issues.join('、')}`, { issues });
    }
  }
  const statusByAction: Record<BotAction, BotStatus> = {
    start: 'RUNNING',
    pause: 'PAUSED',
    trip: 'TRIPPED',
    stop: 'STOPPED',
  };
  const nextStatus = statusByAction[action];
  snapshot.runtimes[botId] = {
    ...(snapshot.runtimes[botId] || createRuntime(botId)),
    status: nextStatus,
    activeRunMode: nextStatus === 'RUNNING' ? body.runMode : undefined,
    marketDataStatus: nextStatus === 'RUNNING' ? 'ok' : nextStatus === 'TRIPPED' ? 'down' : 'unknown',
    executionStatus: nextStatus === 'RUNNING' && body.runMode !== 'monitor' ? 'ok' : nextStatus === 'TRIPPED' ? 'down' : 'unknown',
    latencyMs: nextStatus === 'RUNNING' ? 42 : 0,
    lastHeartbeatAt: nowIso(),
  };
  if (nextStatus === 'TRIPPED') {
    snapshot.alerts.unshift({
      id: alertId(),
      botId,
      level: 'critical',
      message: 'Bot 已被手动熔断',
      createdAt: nowIso(),
      acked: false,
    });
  }
  const label = action === 'start' ? '启动' : action === 'pause' ? '暂停' : action === 'trip' ? '熔断' : '停止';
  appendEvent(snapshot, {
    botId,
    type: action === 'start' ? '启动' : action === 'pause' ? '暂停' : action === 'trip' ? '熔断' : '系统',
    message: `${label}：本地后端已接收并执行`,
  });
  tickRunner(snapshot, getRunnerSource());
  return snapshot;
};

const checkIdempotency = (key: string, bodyHash: string): BotSnapshot | null => {
  const cached = idempotencyCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > IDEMPOTENCY_TTL_MS) {
    idempotencyCache.delete(key);
    return null;
  }
  if (cached.bodyHash !== bodyHash) {
    throw makeError('BOT_IDEMPOTENCY_CONFLICT', '重复请求编号对应的内容不一致');
  }
  return cached.response;
};

const cacheIdempotency = (key: string, bodyHash: string, response: BotSnapshot) => {
  idempotencyCache.set(key, { bodyHash, response, createdAt: Date.now() });
};

const isAuthorized = (req: IncomingMessage, options?: BotBackendOptions) => {
  const token = options?.apiToken || process.env.BOT_API_TOKEN || '';
  if (!token) return true;
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const headerToken = req.headers['x-bot-api-token']?.toString() || '';
  return bearerToken === token || headerToken === token;
};

export const handleBotApi = async (req: IncomingMessage, res: ServerResponse, options?: BotBackendOptions) => {
  if (!req.url?.startsWith(API_PREFIX)) return false;
  const url = new URL(req.url, 'http://localhost');
  const method = req.method || 'GET';
  const path = url.pathname;
  try {
    const storagePath = getStoragePath(options);
    const runnerSource = getRunnerSource(options);
    const snapshot = readSnapshot(storagePath);
    tickRunner(snapshot, runnerSource);
    runnerStats.source = runnerSource;

    if (method === 'GET' && path === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        storagePath,
        authEnabled: Boolean(options?.apiToken || process.env.BOT_API_TOKEN),
        runner: getRunnerStats(),
        serverTime: nowIso(),
      });
      return true;
    }

    if (method === 'GET' && path === '/api/runner/status') {
      const runningCount = snapshot.bots.filter((bot) => snapshot.runtimes[bot.botId]?.status === 'RUNNING').length;
      sendJson(res, 200, {
        ...getRunnerStats(),
        runningCount,
        botCount: snapshot.bots.length,
      });
      return true;
    }

    if ((method !== 'GET' || path.startsWith('/api/admin/')) && !isAuthorized(req, options)) {
      sendError(res, 401, makeError('BOT_UNAUTHORIZED', '缺少或错误的 Bot API Token'));
      return true;
    }

    if (method === 'GET' && path === '/api/admin/backup') {
      sendJson(res, 200, {
        exportedAt: nowIso(),
        snapshot,
      });
      return true;
    }

    if (method === 'GET' && path === '/api/admin/backups') {
      sendJson(res, 200, {
        backupDir: getBackupDir(storagePath),
        backups: listBackups(storagePath),
      });
      return true;
    }

    if (method === 'POST' && path === '/api/admin/restore') {
      const body = await readBody<{ snapshot?: BotSnapshot } | BotSnapshot>(req);
      const restorePayload = body && typeof body === 'object' && 'snapshot' in body && body.snapshot ? body.snapshot : body as BotSnapshot;
      const nextSnapshot = normalizeSnapshot(restorePayload);
      persistSnapshot(storagePath, nextSnapshot, 'manual-restore');
      appendEvent(nextSnapshot, {
        botId: 'GLOBAL',
        type: '系统',
        message: '已从备份恢复 Bot 数据',
      });
      writeSnapshot(storagePath, nextSnapshot);
      sendJson(res, 200, nextSnapshot);
      return true;
    }

    if (method === 'GET' && path === '/api/bots') {
      writeSnapshot(storagePath, snapshot);
      sendJson(res, 200, snapshot);
      return true;
    }

    const actionMatch = path.match(/^\/api\/bots\/([^/]+)\/(start|pause|trip|stop)$/);
    if (method === 'POST' && actionMatch) {
      const body = await readBody<BotActionRequest>(req);
      const idempotencyKey = req.headers['x-idempotency-key']?.toString() || body.idempotencyKey;
      if (!idempotencyKey) {
        sendError(res, 400, makeError('BOT_IDEMPOTENCY_CONFLICT', '缺少重复请求编号'));
        return true;
      }
      const bodyHash = JSON.stringify(body);
      const cached = checkIdempotency(idempotencyKey, bodyHash);
      if (cached) {
        sendJson(res, 200, cached);
        return true;
      }
      const nextSnapshot = handleBotAction(snapshot, actionMatch[1], actionMatch[2] as BotAction, body);
      persistSnapshot(storagePath, nextSnapshot, "bot-action");
      cacheIdempotency(idempotencyKey, bodyHash, nextSnapshot);
      sendJson(res, 200, nextSnapshot);
      return true;
    }

    const botMatch = path.match(/^\/api\/bots\/([^/]+)$/);
    if (botMatch && method === 'PUT') {
      const bot = await readBody<BotConfig>(req);
      if (!bot?.botId || bot.botId !== botMatch[1]) {
        sendError(res, 400, makeError('BOT_INVALID_STATUS', 'Bot 编号不匹配'));
        return true;
      }
      const existed = upsertBotInSnapshot(snapshot, bot);
      appendEvent(snapshot, {
        botId: bot.botId,
        type: '系统',
        message: existed ? 'Bot 配置已更新' : 'Bot 已创建',
      });
      persistSnapshot(storagePath, snapshot, "api-write");
      sendJson(res, 200, snapshot);
      return true;
    }
    if (botMatch && method === 'DELETE') {
      const botId = botMatch[1];
      const bot = snapshot.bots.find((item) => item.botId === botId);
      snapshot.bots = snapshot.bots.filter((item) => item.botId !== botId);
      delete snapshot.runtimes[botId];
      snapshot.alerts = snapshot.alerts.filter((alert) => alert.botId !== botId);
      snapshot.events = (snapshot.events || []).filter((event) => event.botId !== botId);
      appendEvent(snapshot, { botId: 'GLOBAL', type: '系统', message: `${bot?.name || botId} 已删除` });
      persistSnapshot(storagePath, snapshot, "api-write");
      sendJson(res, 200, snapshot);
      return true;
    }

    const strategyMatch = path.match(/^\/api\/bot-strategies\/([^/]+)$/);
    if (strategyMatch && method === 'PUT') {
      const strategy = await readBody<NonNullable<BotSnapshot['strategies']>[number]>(req);
      const strategies = snapshot.strategies || [];
      const index = strategies.findIndex((item) => item.id === strategyMatch[1]);
      if (index >= 0) strategies[index] = strategy;
      else strategies.unshift(strategy);
      snapshot.strategies = strategies;
      appendEvent(snapshot, { botId: 'GLOBAL', type: '系统', message: index >= 0 ? `策略已更新：${strategy.name}` : `策略已创建：${strategy.name}` });
      persistSnapshot(storagePath, snapshot, "api-write");
      sendJson(res, 200, snapshot);
      return true;
    }
    if (strategyMatch && method === 'DELETE') {
      const strategy = (snapshot.strategies || []).find((item) => item.id === strategyMatch[1]);
      snapshot.strategies = (snapshot.strategies || []).filter((item) => item.id !== strategyMatch[1]);
      appendEvent(snapshot, { botId: 'GLOBAL', type: '系统', message: `策略已删除：${strategy?.name || strategyMatch[1]}` });
      persistSnapshot(storagePath, snapshot, "api-write");
      sendJson(res, 200, snapshot);
      return true;
    }

    const riskMatch = path.match(/^\/api\/bot-risk-rules\/([^/]+)$/);
    if (riskMatch && method === 'PUT') {
      const rule = await readBody<BotRiskRule>(req);
      const riskRules = snapshot.riskRules || [];
      const index = riskRules.findIndex((item) => item.id === riskMatch[1]);
      if (index >= 0) riskRules[index] = rule;
      else riskRules.unshift(rule);
      snapshot.riskRules = riskRules;
      appendEvent(snapshot, { botId: 'GLOBAL', type: '系统', message: index >= 0 ? `风控规则已更新：${rule.name}` : `风控规则已创建：${rule.name}` });
      persistSnapshot(storagePath, snapshot, "api-write");
      sendJson(res, 200, snapshot);
      return true;
    }
    if (riskMatch && method === 'DELETE') {
      const rule = (snapshot.riskRules || []).find((item) => item.id === riskMatch[1]);
      snapshot.riskRules = (snapshot.riskRules || []).filter((item) => item.id !== riskMatch[1]);
      appendEvent(snapshot, { botId: 'GLOBAL', type: '系统', message: `风控规则已删除：${rule?.name || riskMatch[1]}` });
      persistSnapshot(storagePath, snapshot, "api-write");
      sendJson(res, 200, snapshot);
      return true;
    }

    const alertMatch = path.match(/^\/api\/alerts\/([^/]+)\/ack$/);
    if (alertMatch && method === 'POST') {
      const alert = snapshot.alerts.find((item) => item.id === alertMatch[1]);
      if (!alert) {
        sendError(res, 404, makeError('ALERT_NOT_FOUND', '告警不存在'));
        return true;
      }
      snapshot.alerts = snapshot.alerts.map((item) => item.id === alertMatch[1] ? { ...item, acked: true } : item);
      appendEvent(snapshot, { botId: alert.botId, type: '告警', message: '告警已确认' });
      persistSnapshot(storagePath, snapshot, "api-write");
      sendJson(res, 200, snapshot);
      return true;
    }

    if (path === '/api/risk/global-kill-switch' && method === 'POST') {
      snapshot.bots.forEach((bot) => {
        snapshot.runtimes[bot.botId] = {
          ...(snapshot.runtimes[bot.botId] || createRuntime(bot.botId)),
          status: 'TRIPPED',
          activeRunMode: undefined,
          marketDataStatus: 'down',
          executionStatus: 'down',
          latencyMs: 0,
          lastHeartbeatAt: nowIso(),
        };
      });
      snapshot.alerts.unshift({
        id: alertId(),
        botId: 'GLOBAL',
        level: 'critical',
        message: '全部 Bot 已紧急停止',
        createdAt: nowIso(),
        acked: false,
      });
      appendEvent(snapshot, { botId: 'GLOBAL', type: '熔断', message: '全部 Bot 已紧急停止' });
      persistSnapshot(storagePath, snapshot, "api-write");
      sendJson(res, 200, snapshot);
      return true;
    }

    sendError(res, 404, makeError('INTERNAL_ERROR', '接口不存在'));
    return true;
  } catch (error) {
    const apiError = error as BotApiError;
    const statusCode = apiError.code === 'BOT_NOT_FOUND' || apiError.code === 'ALERT_NOT_FOUND'
      ? 404
      : apiError.code === 'BOT_RISK_BLOCKED' || apiError.code === 'BOT_IDEMPOTENCY_CONFLICT'
        ? 409
        : 500;
    sendError(res, statusCode, apiError.code ? apiError : makeError('INTERNAL_ERROR', 'Bot 后端处理失败'));
    return true;
  }
};

const installMiddleware = (middlewares: Connect.Server) => {
  middlewares.use(async (req, res, next) => {
    const handled = await handleBotApi(req, res);
    if (!handled) next();
  });
};

export function botBackendPlugin(): Plugin {
  return {
    name: 'decibel-bot-backend',
    configureServer(server: ViteDevServer) {
      installMiddleware(server.middlewares);
    },
    configurePreviewServer(server: PreviewServer) {
      installMiddleware(server.middlewares);
    },
  };
}
