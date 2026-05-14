import { create } from 'zustand';
import { BotApiRequestError, botApi, getBotLastSyncSource } from '../../api/bots';
import { DEFAULT_BOT_STRATEGIES } from './templates';
import type { BotAlert, BotConfig, BotEvent, BotRiskRule, BotRuntime, BotStatus, BotStrategy } from './types';
type BotSyncSource = 'remote' | 'local';

interface BotState {
  bots: BotConfig[];
  runtimes: Record<string, BotRuntime>;
  alerts: BotAlert[];
  events: BotEvent[];
  strategies: BotStrategy[];
  riskRules: BotRiskRule[];
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  syncSource: BotSyncSource;
  hydrate: () => Promise<void>;
  setStatus: (botId: string, status: BotStatus, reason?: string) => Promise<void>;
  upsertBot: (bot: BotConfig) => Promise<void>;
  deleteBot: (botId: string) => Promise<void>;
  upsertStrategy: (strategy: BotStrategy) => Promise<void>;
  deleteStrategy: (strategyId: string) => Promise<void>;
  upsertRiskRule: (rule: BotRiskRule) => Promise<void>;
  deleteRiskRule: (ruleId: string) => Promise<void>;
  importBots: (bots: BotConfig[]) => Promise<void>;
  importStrategies: (strategies: BotStrategy[]) => Promise<void>;
  importRiskRules: (rules: BotRiskRule[]) => Promise<void>;
  ackAlert: (id: string) => Promise<void>;
  ackAllAlerts: () => Promise<void>;
  globalKillSwitch: () => Promise<void>;
}

export const useBotStore = create<BotState>((set) => ({
  bots: [],
  runtimes: {},
  alerts: [],
  events: [],
  strategies: DEFAULT_BOT_STRATEGIES,
  riskRules: [],
  loading: false,
  error: null,
  errorCode: null,
  syncSource: 'local',
  hydrate: async () => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const snapshot = await botApi.getSnapshot();
      set({
        bots: snapshot.bots,
        runtimes: snapshot.runtimes,
        alerts: snapshot.alerts,
        events: snapshot.events || [],
        strategies: snapshot.strategies || DEFAULT_BOT_STRATEGIES,
        riskRules: snapshot.riskRules || [],
        syncSource: getBotLastSyncSource(),
        loading: false,
      });
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message || 'Bot 数据加载失败',
        errorCode: error instanceof BotApiRequestError ? (error.code || null) : null,
      });
    }
  },
  setStatus: async (botId, status, reason) => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const bot = useBotStore.getState().bots.find((item) => item.botId === botId);
      const snapshot = await botApi.setStatus(botId, status, reason, bot);
      set({
        bots: snapshot.bots,
        runtimes: snapshot.runtimes,
        alerts: snapshot.alerts,
        events: snapshot.events || [],
        strategies: snapshot.strategies || DEFAULT_BOT_STRATEGIES,
        riskRules: snapshot.riskRules || [],
        syncSource: getBotLastSyncSource(),
        loading: false,
      });
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message || 'Bot 状态更新失败',
        errorCode: error instanceof BotApiRequestError ? (error.code || null) : null,
      });
    }
  },
  upsertBot: async (bot) => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const snapshot = await botApi.upsertBot(bot);
      set({
        bots: snapshot.bots,
        runtimes: snapshot.runtimes,
        alerts: snapshot.alerts,
        events: snapshot.events || [],
        strategies: snapshot.strategies || DEFAULT_BOT_STRATEGIES,
        riskRules: snapshot.riskRules || [],
        syncSource: getBotLastSyncSource(),
        loading: false,
      });
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message || 'Bot 保存失败',
        errorCode: error instanceof BotApiRequestError ? (error.code || null) : null,
      });
    }
  },
  deleteBot: async (botId) => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const snapshot = await botApi.deleteBot(botId);
      set({
        bots: snapshot.bots,
        runtimes: snapshot.runtimes,
        alerts: snapshot.alerts,
        events: snapshot.events || [],
        strategies: snapshot.strategies || DEFAULT_BOT_STRATEGIES,
        riskRules: snapshot.riskRules || [],
        syncSource: getBotLastSyncSource(),
        loading: false,
      });
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message || 'Bot 删除失败',
        errorCode: error instanceof BotApiRequestError ? (error.code || null) : null,
      });
    }
  },
  importBots: async (bots) => {
    for (const bot of bots) {
      await useBotStore.getState().upsertBot(bot);
    }
  },
  importStrategies: async (strategies) => {
    for (const strategy of strategies) {
      await useBotStore.getState().upsertStrategy(strategy);
    }
  },
  importRiskRules: async (rules) => {
    for (const rule of rules) {
      await useBotStore.getState().upsertRiskRule(rule);
    }
  },
  upsertStrategy: async (strategy) => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const snapshot = await botApi.upsertStrategy(strategy);
      set({
        bots: snapshot.bots,
        runtimes: snapshot.runtimes,
        alerts: snapshot.alerts,
        events: snapshot.events || [],
        strategies: snapshot.strategies || DEFAULT_BOT_STRATEGIES,
        riskRules: snapshot.riskRules || [],
        syncSource: getBotLastSyncSource(),
        loading: false,
      });
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message || '策略保存失败',
        errorCode: error instanceof BotApiRequestError ? (error.code || null) : null,
      });
    }
  },
  deleteStrategy: async (strategyId) => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const snapshot = await botApi.deleteStrategy(strategyId);
      set({
        bots: snapshot.bots,
        runtimes: snapshot.runtimes,
        alerts: snapshot.alerts,
        events: snapshot.events || [],
        strategies: snapshot.strategies || DEFAULT_BOT_STRATEGIES,
        riskRules: snapshot.riskRules || [],
        syncSource: getBotLastSyncSource(),
        loading: false,
      });
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message || '策略删除失败',
        errorCode: error instanceof BotApiRequestError ? (error.code || null) : null,
      });
    }
  },
  upsertRiskRule: async (rule) => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const snapshot = await botApi.upsertRiskRule(rule);
      set({
        bots: snapshot.bots,
        runtimes: snapshot.runtimes,
        alerts: snapshot.alerts,
        events: snapshot.events || [],
        strategies: snapshot.strategies || DEFAULT_BOT_STRATEGIES,
        riskRules: snapshot.riskRules || [],
        syncSource: getBotLastSyncSource(),
        loading: false,
      });
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message || '风控规则保存失败',
        errorCode: error instanceof BotApiRequestError ? (error.code || null) : null,
      });
    }
  },
  deleteRiskRule: async (ruleId) => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const snapshot = await botApi.deleteRiskRule(ruleId);
      set({
        bots: snapshot.bots,
        runtimes: snapshot.runtimes,
        alerts: snapshot.alerts,
        events: snapshot.events || [],
        strategies: snapshot.strategies || DEFAULT_BOT_STRATEGIES,
        riskRules: snapshot.riskRules || [],
        syncSource: getBotLastSyncSource(),
        loading: false,
      });
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message || '风控规则删除失败',
        errorCode: error instanceof BotApiRequestError ? (error.code || null) : null,
      });
    }
  },
  ackAlert: async (id) => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const snapshot = await botApi.ackAlert(id);
      set({
        bots: snapshot.bots,
        runtimes: snapshot.runtimes,
        alerts: snapshot.alerts,
        events: snapshot.events || [],
        strategies: snapshot.strategies || DEFAULT_BOT_STRATEGIES,
        riskRules: snapshot.riskRules || [],
        syncSource: getBotLastSyncSource(),
        loading: false,
      });
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message || '告警确认失败',
        errorCode: error instanceof BotApiRequestError ? (error.code || null) : null,
      });
    }
  },
  ackAllAlerts: async () => {
    const openAlertIds = useBotStore.getState().alerts.filter((alert) => !alert.acked).map((alert) => alert.id);
    for (const id of openAlertIds) {
      await useBotStore.getState().ackAlert(id);
    }
  },
  globalKillSwitch: async () => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const snapshot = await botApi.globalKillSwitch();
      set({
        bots: snapshot.bots,
        runtimes: snapshot.runtimes,
        alerts: snapshot.alerts,
        events: snapshot.events || [],
        strategies: snapshot.strategies || DEFAULT_BOT_STRATEGIES,
        riskRules: snapshot.riskRules || [],
        syncSource: getBotLastSyncSource(),
        loading: false,
      });
    } catch (error: any) {
      set({
        loading: false,
        error: error?.message || '全局熔断失败',
        errorCode: error instanceof BotApiRequestError ? (error.code || null) : null,
      });
    }
  },
}));
