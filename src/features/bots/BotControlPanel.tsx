import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { useDashboardStore } from '../../store';
import { useBotStore } from './store';
import { formatBotErrorMessage } from './errorMessage';
import { getStrategyPatch } from './templates';
import { validateBotConfig, validateBotStrategy, validateRiskRule, validateRiskRulesForStart } from './validation';
import type { BotConfig, BotHealthStatus, BotRiskRule, BotRunMode, BotStatus, BotStrategy } from './types';

const statusLabel: Record<BotStatus, string> = {
  RUNNING: '运行中',
  PAUSED: '已暂停',
  STOPPED: '已停止',
  TRIPPED: '已熔断',
};

const runModeLabel: Record<BotRunMode, string> = {
  monitor: '仅监控',
  paper: '模拟',
  live: '实盘',
};

const healthLabel: Record<BotHealthStatus, string> = {
  ok: '正常',
  warning: '注意',
  down: '异常',
  unknown: '未知',
};

const getHealthClass = (status?: BotHealthStatus) => `health-${status || 'unknown'}`;

const formatAddress = (address: string) => {
  if (!address || !address.startsWith('0x')) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const formatUsd = (value: number) => {
  const sign = value > 0 ? '+' : '';
  return `${sign}$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const formatRuntimeTime = (value?: string) => {
  if (!value) return '-';
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return '-';
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return '刚刚';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}分钟前`;
  return new Date(value).toLocaleTimeString();
};

export function BotControlPanel() {
  const { bots, runtimes, events, upsertBot, deleteBot, importBots, importStrategies, importRiskRules, setStatus, loading, error, errorCode, syncSource } = useBotStore();
  const strategies = useBotStore((state) => state.strategies);
  const riskRules = useBotStore((state) => state.riskRules);
  const dashboardAccounts = useDashboardStore((state) => state.accounts);
  const dashboardSubaccounts = useDashboardStore((state) => state.subaccounts);
  const [statusFilter, setStatusFilter] = useState<'ALL' | BotStatus>('ALL');
  const [strategyFilter, setStrategyFilter] = useState<string>('ALL');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedBot, setSelectedBot] = useState<BotConfig | null>(null);
  const [editingBot, setEditingBot] = useState<BotConfig | null>(null);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [bulkTemplateId, setBulkTemplateId] = useState('');
  const [bulkSymbol, setBulkSymbol] = useState('BTC');
  const [bulkSubaccounts, setBulkSubaccounts] = useState<string[]>([]);
  const [editError, setEditError] = useState('');
  const [importError, setImportError] = useState('');
  const [validationMessage, setValidationMessage] = useState('');
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    title: string;
    subtitle: string;
    details?: string[];
    confirmLabel: string;
    danger?: boolean;
    requireConfirmText?: string;
    run: () => Promise<void>;
  } | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const errorMessage = formatBotErrorMessage(error, errorCode);

  const strategyOptions = useMemo(() => {
    const values = Array.from(new Set(bots.map((item) => item.strategyId)));
    return ['ALL', ...values];
  }, [bots]);

  const filteredBots = useMemo(() => (
    bots.filter((bot) => {
      const runtime = runtimes[bot.botId];
      const normalizedQuery = query.trim().toLowerCase();
      const statusOk = statusFilter === 'ALL' || runtime?.status === statusFilter;
      const strategyOk = strategyFilter === 'ALL' || bot.strategyId === strategyFilter;
      const queryOk = !normalizedQuery || [
        bot.name,
        bot.ownerAddress,
        bot.subaccount || '',
        bot.strategyId,
        ...bot.symbols,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
      return statusOk && strategyOk && queryOk;
    })
  ), [bots, query, runtimes, statusFilter, strategyFilter]);

  const visibleIds = filteredBots.map((item) => item.botId);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((current) => current.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...visibleIds])));
  };

  const toggleSelected = (botId: string) => {
    setSelectedIds((current) => (
      current.includes(botId) ? current.filter((id) => id !== botId) : [...current, botId]
    ));
  };

  const applyBatchStatus = async (status: BotStatus) => {
    if (status === 'RUNNING') {
      const invalidBots = selectedIds
        .map((id) => bots.find((bot) => bot.botId === id))
        .filter((bot): bot is BotConfig => Boolean(bot))
        .filter((bot) => validateBotConfig(bot).length > 0);
      if (invalidBots.length > 0) {
        setValidationMessage(`${invalidBots.length} 个 bot 配置不完整，请先检查后再启动。`);
        return;
      }
      const blockedBots = selectedIds
        .map((id) => bots.find((bot) => bot.botId === id))
        .filter((bot): bot is BotConfig => Boolean(bot))
        .filter((bot) => validateRiskRulesForStart(bot, bots, runtimes, riskRules).length > 0);
      if (blockedBots.length > 0) {
        setValidationMessage(`${blockedBots.length} 个 bot 触发账户/市场/全局风控限制。`);
        return;
      }
    }
    setValidationMessage('');
    for (const id of selectedIds) {
      await setStatus(id, status, 'batch-control');
    }
    setSelectedIds([]);
  };

  const confirmBatchStatus = (status: BotStatus) => {
    const actionText = status === 'RUNNING' ? '启动' : status === 'PAUSED' ? '暂停' : '操作';
    const selectedBots = selectedIds
      .map((id) => bots.find((bot) => bot.botId === id))
      .filter((bot): bot is BotConfig => Boolean(bot));
    if (status === 'RUNNING') {
      const invalidBots = selectedBots.filter((bot) => validateBotConfig(bot).length > 0);
      if (invalidBots.length > 0) {
        setValidationMessage(`${invalidBots.length} 个 bot 配置不完整，请先检查后再启动。`);
        return;
      }
    }
    setValidationMessage('');
    const liveCount = selectedBots.filter((bot) => bot.runMode === 'live').length;
    setPendingAction({
      title: `确认批量${actionText}？`,
      subtitle: `将影响已选中的 ${selectedIds.length} 个 bot`,
      details: status === 'RUNNING'
        ? [
          liveCount > 0 ? `包含实盘 bot：${liveCount} 个` : '不包含实盘 bot',
          `市场：${Array.from(new Set(selectedBots.flatMap((bot) => bot.symbols))).join(', ') || '-'}`,
          `最大单 bot 日亏损：$${Math.max(...selectedBots.map((bot) => bot.maxDailyLoss), 0).toLocaleString()}`,
        ]
        : undefined,
      confirmLabel: `确认${actionText}`,
      danger: status === 'RUNNING' && liveCount > 0,
      requireConfirmText: status === 'RUNNING' && liveCount > 0 ? '确认实盘' : undefined,
      run: () => applyBatchStatus(status),
    });
  };

  const confirmStartBot = (bot: BotConfig) => {
    const issues = validateBotConfig(bot);
    if (issues.length > 0) {
      setValidationMessage(`${bot.name} 无法启动：${issues.join('、')}`);
      return;
    }
    const riskIssues = validateRiskRulesForStart(bot, bots, runtimes, riskRules);
    if (riskIssues.length > 0) {
      setValidationMessage(`${bot.name} 无法启动：${riskIssues.join('、')}`);
      return;
    }
    setValidationMessage('');
    setPendingAction({
      title: bot.runMode === 'live' ? `确认实盘启动 ${bot.name}？` : `确认启动 ${bot.name}？`,
      subtitle: `${runModeLabel[bot.runMode || 'paper']} · ${bot.symbols.join(', ')} · ${formatAddress(bot.subaccount || '')}`,
      details: [
        bot.runMode === 'monitor' ? '仅监控模式：不会下单' : bot.runMode === 'paper' ? '模拟模式：不会真实下单' : '实盘模式：会真实下单',
        `最大下单价值：$${bot.maxNotional.toLocaleString()}`,
        `运行模式：${runModeLabel[bot.runMode || 'paper']}`,
        `日亏损上限：$${bot.maxDailyLoss.toLocaleString()}`,
        `最大滑点：${bot.maxSlippageBps} bps`,
        `报价价差：${bot.quoteSpreadBps} bps`,
        `挂单层数：${bot.orderLevels}`,
        `每分钟下单数：${bot.orderRateLimitPerMin}`,
      ],
      confirmLabel: '确认启动',
      danger: bot.runMode === 'live',
      requireConfirmText: bot.runMode === 'live' ? '确认实盘' : undefined,
      run: () => setStatus(bot.botId, 'RUNNING'),
    });
  };

  const confirmTripBot = (bot: BotConfig) => {
    setPendingAction({
      title: `确认熔断 ${bot.name}？`,
      subtitle: '熔断后该 bot 会停止交易，需要手动恢复。',
      confirmLabel: '确认熔断',
      danger: true,
      run: () => setStatus(bot.botId, 'TRIPPED'),
    });
  };

  const confirmDeleteBot = (bot: BotConfig) => {
    setPendingAction({
      title: `确认删除 ${bot.name}？`,
      subtitle: '删除后会移除这个 bot 的配置和本地告警。',
      confirmLabel: '确认删除',
      danger: true,
      run: async () => {
        await deleteBot(bot.botId);
        setSelectedBot(null);
      },
    });
  };

  const copyBot = (bot: BotConfig) => {
    setEditError('');
    setEditingBot({
      ...bot,
      botId: `bot-${Date.now()}`,
      name: `${bot.name} Copy`,
    });
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    if (pendingAction.requireConfirmText && confirmText.trim() !== pendingAction.requireConfirmText) return;
    await pendingAction.run();
    setPendingAction(null);
    setConfirmText('');
  };

  const createEmptyBot = (): BotConfig => ({
    botId: `bot-${Date.now()}`,
    name: '',
    runMode: 'paper',
    ownerAddress: '',
    subaccount: '',
    strategyId: 'mm-spread-v1',
    strategyVersion: '1.0.0',
    symbols: ['BTC'],
    maxNotional: 10000,
    maxPosition: 0,
    maxDailyLoss: 500,
    maxSlippageBps: 25,
    orderRateLimitPerMin: 30,
    quoteSpreadBps: 15,
    orderLevels: 3,
    levelSpacingBps: 10,
    refreshIntervalSec: 5,
    minOrderSize: 0.01,
    maxOrderSize: 0.1,
    inventorySkewBps: 10,
    targetInventoryPct: 50,
    cancelStaleAfterSec: 15,
    postOnly: true,
    heartbeatTimeoutSec: 25,
    maxConsecutiveErrors: 4,
    maxLatencyMs: 1500,
  });

  const saveEditingBot = async () => {
    if (!editingBot) return;
    const nextBot = {
      ...editingBot,
      name: editingBot.name.trim() || '未命名 Bot',
      ownerAddress: editingBot.ownerAddress.trim(),
      subaccount: editingBot.subaccount?.trim() || undefined,
      symbols: editingBot.symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
    };
    const issues = validateBotConfig(nextBot);
    if (issues.length > 0) {
      setEditError(issues.join('、'));
      return;
    }
    setEditError('');
    await upsertBot(nextBot);
    setEditingBot(null);
  };

  const toggleBulkSubaccount = (address: string) => {
    setBulkSubaccounts((current) => (
      current.includes(address) ? current.filter((item) => item !== address) : [...current, address]
    ));
  };

  const saveBulkBots = async () => {
    const template = strategies.find((item) => item.id === bulkTemplateId) || strategies[0];
    const symbol = bulkSymbol.trim().toUpperCase();
    if (!template || !symbol || bulkSubaccounts.length === 0) return;
    for (const subaccountAddress of bulkSubaccounts) {
      const subaccount = dashboardSubaccounts.find((item) => item.address === subaccountAddress);
      const index = bulkSubaccounts.indexOf(subaccountAddress) + 1;
      await upsertBot({
        botId: `bot-${Date.now()}-${index}`,
        name: `${template.name} ${symbol} ${index}`,
        runMode: 'paper',
        ownerAddress: subaccount?.owner || '',
        subaccount: subaccountAddress,
        symbols: [symbol],
        ...getStrategyPatch(template),
      });
    }
    setBulkSubaccounts([]);
    setBulkSymbol('BTC');
    setBulkCreateOpen(false);
  };

  const exportBots = () => {
    const content = JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), bots, strategies, riskRules }, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'decibel-bots-config.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBots = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      const importedBots = Array.isArray(parsed?.bots) ? parsed.bots : Array.isArray(parsed) ? parsed : [];
      const importedStrategies = Array.isArray(parsed?.strategies) ? parsed.strategies : [];
      const importedRiskRules = Array.isArray(parsed?.riskRules) ? parsed.riskRules : [];
      const validBots = importedBots.filter((bot: Partial<BotConfig>) => (
        bot
        && typeof bot.botId === 'string'
        && typeof bot.name === 'string'
        && typeof bot.ownerAddress === 'string'
        && Array.isArray(bot.symbols)
      )).map((bot: BotConfig) => ({
        ...bot,
        runMode: bot.runMode === 'monitor' || bot.runMode === 'paper' || bot.runMode === 'live' ? bot.runMode : 'paper',
      })).filter((bot: BotConfig) => validateBotConfig(bot).length === 0);
      const validStrategies = importedStrategies.filter((strategy: BotStrategy) => (
        strategy
        && typeof strategy.id === 'string'
        && typeof strategy.name === 'string'
        && validateBotStrategy(strategy).length === 0
      ));
      const validRiskRules = importedRiskRules.filter((rule: BotRiskRule) => (
        rule
        && typeof rule.id === 'string'
        && (rule.scope === 'account' || rule.scope === 'market' || rule.scope === 'global')
        && validateRiskRule(rule).length === 0
      ));
      if (validBots.length === 0 && validStrategies.length === 0 && validRiskRules.length === 0) {
        setImportError('没有找到可导入的 bot 模块配置');
        return;
      }
      setImportError('');
      setValidationMessage('');
      await importBots(validBots);
      await importStrategies(validStrategies);
      await importRiskRules(validRiskRules);
    } catch {
      setImportError('导入失败，请检查 JSON 文件');
    }
  };
  const runningCount = bots.filter((item) => runtimes[item.botId]?.status === 'RUNNING').length;
  const pausedCount = bots.filter((item) => runtimes[item.botId]?.status === 'PAUSED').length;
  const trippedCount = bots.filter((item) => runtimes[item.botId]?.status === 'TRIPPED').length;
  const selectedBotEvents = selectedBot
    ? events.filter((event) => event.botId === selectedBot.botId || event.botId === 'GLOBAL').slice(0, 8)
    : [];
  const subaccountsForEditingOwner = editingBot?.ownerAddress
    ? dashboardSubaccounts.filter((item) => item.owner?.toLowerCase() === editingBot.ownerAddress.toLowerCase())
    : dashboardSubaccounts;
  const selectedRuntime = selectedBot ? runtimes[selectedBot.botId] : null;

  return (
    <section className="chart-section bot-panel">
      <div className="bot-panel-head">
        <div>
          <h3>Bot 管理</h3>
          <span className="bot-panel-subtitle">多账号做市机器人</span>
        </div>
        <span className={`bot-sync-badge ${syncSource === 'remote' ? 'ok' : 'local'}`}>
          {syncSource === 'remote' ? '真实数据' : '本地模拟'}
        </span>
      </div>
      {errorMessage && <div className="inline-alert">{errorMessage}</div>}
      {importError && <div className="inline-alert">{importError}</div>}
      {validationMessage && <div className="inline-alert">{validationMessage}</div>}
      {loading && <p className="text-secondary">同步中...</p>}
      <div className="bot-kpi-row">
        <div className="bot-kpi-card">
          <span className="text-secondary">机器人总数</span>
          <strong>{bots.length}</strong>
        </div>
        <div className="bot-kpi-card">
          <span className="text-secondary">运行中</span>
          <strong>{runningCount}</strong>
        </div>
        <div className="bot-kpi-card">
          <span className="text-secondary">已暂停</span>
          <strong>{pausedCount}</strong>
        </div>
        <div className="bot-kpi-card">
          <span className="text-secondary">已熔断</span>
          <strong>{trippedCount}</strong>
        </div>
      </div>
      <div className="bot-toolbar">
        <button className="toolbar-btn" onClick={() => {
          setEditError('');
          setEditingBot(createEmptyBot());
        }}>新增 Bot</button>
        <button className="toolbar-btn" onClick={() => setBulkCreateOpen(true)}>批量创建</button>
        <button className="toolbar-btn" disabled={bots.length === 0} onClick={exportBots}>导出配置</button>
        <button className="toolbar-btn" onClick={() => importInputRef.current?.click()}>导入配置</button>
        <input ref={importInputRef} type="file" accept="application/json" hidden onChange={handleImportBots} />
        <input
          className="toolbar-control bot-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索 bot / 市场 / 账户"
        />
        <select className="toolbar-control toolbar-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | BotStatus)}>
          <option value="ALL">全部状态</option>
          <option value="RUNNING">运行中</option>
          <option value="PAUSED">已暂停</option>
          <option value="STOPPED">已停止</option>
          <option value="TRIPPED">已熔断</option>
        </select>
        <select className="toolbar-control toolbar-select" value={strategyFilter} onChange={(e) => setStrategyFilter(e.target.value)}>
          {strategyOptions.map((strategy) => (
            <option key={strategy} value={strategy}>{strategy === 'ALL' ? '全部策略' : strategy}</option>
          ))}
        </select>
        <button className="toolbar-btn" disabled={loading || visibleIds.length === 0} onClick={toggleSelectAllVisible}>
          {allVisibleSelected ? '取消全选' : '全选当前'}
        </button>
        <button className="toolbar-btn" disabled={loading || selectedIds.length === 0} onClick={() => confirmBatchStatus('RUNNING')}>批量启动</button>
        <button className="toolbar-btn" disabled={loading || selectedIds.length === 0} onClick={() => confirmBatchStatus('PAUSED')}>批量暂停</button>
        <span className="bot-toolbar-note text-secondary">已选中 {selectedIds.length} 个</span>
      </div>
      <div className="bot-grid">
        {filteredBots.length === 0 && (
          <div className="bot-empty-state">
            <strong>没有匹配的 bot</strong>
            <span className="text-secondary">换个关键词或清空筛选试试</span>
          </div>
        )}
        {filteredBots.map((bot) => {
          const runtime = runtimes[bot.botId];
          const pnlClass = (runtime?.pnlToday || 0) >= 0 ? 'positive' : 'negative';
          const configIssues = validateBotConfig(bot);
          return (
            <article key={bot.botId} className="bot-card">
              <div className="bot-card-head">
                <label className="bot-select-row">
                  <input type="checkbox" checked={selectedIds.includes(bot.botId)} onChange={() => toggleSelected(bot.botId)} />
                  <strong>{bot.name}</strong>
                </label>
                <span className={`bot-status-badge status-${(runtime?.status || 'STOPPED').toLowerCase()}`}>
                  {statusLabel[runtime?.status || 'STOPPED']}
                </span>
              </div>
              <div className="bot-runtime-strip">
                <div>
                  <span>今日盈亏</span>
                  <strong className={pnlClass}>{formatUsd(runtime?.pnlToday || 0)}</strong>
                </div>
                <div>
                  <span>净敞口</span>
                  <strong>{formatUsd(runtime?.netExposure || 0)}</strong>
                </div>
                <div>
                  <span>更新</span>
                  <strong>{formatRuntimeTime(runtime?.lastHeartbeatAt)}</strong>
                </div>
              </div>
              <div className="bot-health-row">
                <span className={getHealthClass(runtime?.marketDataStatus)}>行情 {healthLabel[runtime?.marketDataStatus || 'unknown']}</span>
                <span className={getHealthClass(runtime?.executionStatus)}>下单 {healthLabel[runtime?.executionStatus || 'unknown']}</span>
                <span>延迟 {runtime?.latencyMs ? `${runtime.latencyMs}ms` : '-'}</span>
              </div>
              {configIssues.length > 0 && <div className="bot-card-warning">配置待完善：{configIssues.join('、')}</div>}
              {runtime?.lastError && <div className="bot-card-error">{runtime.lastError}</div>}
              <div className="bot-meta-grid">
                <span>策略</span>
                <strong>{bot.strategyId}@{bot.strategyVersion}</strong>
                <span>模式</span>
                <strong>{runModeLabel[runtime?.activeRunMode || bot.runMode || 'paper']}</strong>
                <span>账户</span>
                <strong className="mono">{formatAddress(bot.ownerAddress)}</strong>
                <span>市场</span>
                <strong>{bot.symbols.join(', ')}</strong>
                <span>日亏损上限</span>
                <strong>${bot.maxDailyLoss.toLocaleString()}</strong>
              </div>
              <div className="bot-actions">
                <button className="toolbar-btn" disabled={loading} onClick={() => confirmStartBot(bot)}>启动</button>
                <button className="toolbar-btn" disabled={loading} onClick={() => setStatus(bot.botId, 'PAUSED')}>暂停</button>
                <button className="toolbar-btn" onClick={() => setSelectedBot(bot)}>详情</button>
                <button className="toolbar-btn" onClick={() => {
                  setEditError('');
                  setEditingBot(bot);
                }}>编辑</button>
                <button className="toolbar-btn" onClick={() => copyBot(bot)}>复制</button>
                <button className="toolbar-btn bot-danger-btn subtle" disabled={loading} onClick={() => confirmTripBot(bot)}>熔断</button>
              </div>
            </article>
          );
        })}
      </div>
      {selectedBot && (
        <div className="bot-modal-backdrop" onClick={() => setSelectedBot(null)}>
          <aside className="bot-modal" onClick={(event) => event.stopPropagation()}>
            <div className="bot-modal-head">
              <div>
                <h3>{selectedBot.name}</h3>
                <span className="bot-panel-subtitle">{selectedBot.strategyId}@{selectedBot.strategyVersion}</span>
              </div>
              <button className="toolbar-btn" onClick={() => setSelectedBot(null)}>关闭</button>
            </div>
            <div className="bot-detail-section">
              <h4>运行状态</h4>
              <div className="bot-detail-grid">
                <span>状态</span>
                <strong>{statusLabel[runtimes[selectedBot.botId]?.status || 'STOPPED']}</strong>
                <span>运行模式</span>
                <strong>{runModeLabel[runtimes[selectedBot.botId]?.activeRunMode || selectedBot.runMode || 'paper']}</strong>
                <span>今日盈亏</span>
                <strong>{formatUsd(runtimes[selectedBot.botId]?.pnlToday || 0)}</strong>
                <span>净敞口</span>
                <strong>{formatUsd(runtimes[selectedBot.botId]?.netExposure || 0)}</strong>
                <span>最后更新</span>
                <strong>{formatRuntimeTime(runtimes[selectedBot.botId]?.lastHeartbeatAt)}</strong>
                <span>行情状态</span>
                <strong>{healthLabel[selectedRuntime?.marketDataStatus || 'unknown']}</strong>
                <span>下单状态</span>
                <strong>{healthLabel[selectedRuntime?.executionStatus || 'unknown']}</strong>
                <span>延迟</span>
                <strong>{selectedRuntime?.latencyMs ? `${selectedRuntime.latencyMs}ms` : '-'}</strong>
              </div>
              <div className="bot-actions">
                <button className="toolbar-btn" disabled={loading} onClick={() => confirmStartBot(selectedBot)}>启动</button>
                <button className="toolbar-btn" disabled={loading} onClick={() => setStatus(selectedBot.botId, 'PAUSED')}>暂停</button>
                <button className="toolbar-btn" disabled={loading} onClick={() => copyBot(selectedBot)}>复制</button>
                <button className="toolbar-btn bot-danger-btn subtle" disabled={loading} onClick={() => confirmTripBot(selectedBot)}>熔断</button>
                <button className="toolbar-btn bot-danger-btn subtle" disabled={loading} onClick={() => confirmDeleteBot(selectedBot)}>删除</button>
              </div>
            </div>
            <div className="bot-detail-section">
              <h4>绑定账户</h4>
              <div className="bot-detail-grid">
                <span>主钱包</span>
                <strong className="mono">{formatAddress(selectedBot.ownerAddress)}</strong>
                <span>子账户</span>
                <strong className="mono">{formatAddress(selectedBot.subaccount || '-')}</strong>
                <span>市场</span>
                <strong>{selectedBot.symbols.join(', ')}</strong>
              </div>
            </div>
            <div className="bot-detail-section">
              <h4>保护限制</h4>
              <div className="bot-detail-grid">
                <span>最大下单价值</span>
                <strong>${selectedBot.maxNotional.toLocaleString()}</strong>
                <span>最大仓位</span>
                <strong>{selectedBot.maxPosition}</strong>
                <span>日亏损上限</span>
                <strong>${selectedBot.maxDailyLoss.toLocaleString()}</strong>
                <span>最大滑点</span>
                <strong>{selectedBot.maxSlippageBps} bps</strong>
                <span>每分钟下单数</span>
                <strong>{selectedBot.orderRateLimitPerMin}</strong>
              </div>
            </div>
            <div className="bot-detail-section">
              <h4>做市参数</h4>
              <div className="bot-detail-grid">
                <span>报价价差</span>
                <strong>{selectedBot.quoteSpreadBps ?? '-'} bps</strong>
                <span>挂单层数</span>
                <strong>{selectedBot.orderLevels ?? '-'}</strong>
                <span>档位间距</span>
                <strong>{selectedBot.levelSpacingBps ?? '-'} bps</strong>
                <span>刷新间隔</span>
                <strong>{selectedBot.refreshIntervalSec ?? '-'} 秒</strong>
                <span>单笔数量</span>
                <strong>{selectedBot.minOrderSize ?? '-'} - {selectedBot.maxOrderSize ?? '-'}</strong>
                <span>库存偏移</span>
                <strong>{selectedBot.inventorySkewBps ?? '-'} bps</strong>
                <span>目标库存</span>
                <strong>{selectedBot.targetInventoryPct ?? '-'}%</strong>
                <span>旧单撤销</span>
                <strong>{selectedBot.cancelStaleAfterSec ?? '-'} 秒</strong>
                <span>Post Only</span>
                <strong>{selectedBot.postOnly ? '开启' : '关闭'}</strong>
                <span>心跳超时</span>
                <strong>{selectedBot.heartbeatTimeoutSec ?? '-'} 秒</strong>
                <span>连续错误</span>
                <strong>{selectedBot.maxConsecutiveErrors ?? '-'}</strong>
                <span>最大延迟</span>
                <strong>{selectedBot.maxLatencyMs ?? '-'} ms</strong>
              </div>
            </div>
            <div className="bot-detail-section">
              <h4>最近事件</h4>
              {selectedBotEvents.length === 0 ? (
                <p className="text-secondary">暂无记录</p>
              ) : (
                <div className="bot-event-list">
                  {selectedBotEvents.map((event) => (
                    <div key={event.id} className="bot-event-item">
                      <div className="bot-event-dot" aria-hidden="true" />
                      <div className="bot-event-body">
                        <div className="bot-event-row">
                          <span>{event.type}</span>
                          <small>{new Date(event.createdAt).toLocaleString()}</small>
                        </div>
                        <strong>{event.message}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
      {pendingAction && (
        <div className="bot-modal-backdrop" onClick={() => {
          setPendingAction(null);
          setConfirmText('');
        }}>
          <aside className="bot-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="bot-modal-head">
              <div>
                <h3>{pendingAction.title}</h3>
                <span className="bot-panel-subtitle">{pendingAction.subtitle}</span>
              </div>
            </div>
            <div className="bot-confirm-actions">
              {pendingAction.details && (
                <div className="bot-confirm-details">
                  {pendingAction.details.map((item) => <span key={item}>{item}</span>)}
                </div>
              )}
              {pendingAction.requireConfirmText && (
                <label className="bot-live-confirm">
                  <span>为避免误操作，请输入：{pendingAction.requireConfirmText}</span>
                  <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} />
                </label>
              )}
              <button className="toolbar-btn" disabled={loading} onClick={() => {
                setPendingAction(null);
                setConfirmText('');
              }}>取消</button>
              <button
                className={`toolbar-btn ${pendingAction.danger ? 'bot-danger-btn' : ''}`}
                disabled={loading || Boolean(pendingAction.requireConfirmText && confirmText.trim() !== pendingAction.requireConfirmText)}
                onClick={handleConfirmAction}
              >
                {pendingAction.confirmLabel}
              </button>
            </div>
          </aside>
        </div>
      )}
      {editingBot && (
        <div className="bot-modal-backdrop" onClick={() => setEditingBot(null)}>
          <aside className="bot-modal" onClick={(event) => event.stopPropagation()}>
            <div className="bot-modal-head">
              <div>
                <h3>{bots.some((bot) => bot.botId === editingBot.botId) ? '编辑 Bot' : '新增 Bot'}</h3>
                <span className="bot-panel-subtitle">基础配置和保护限制</span>
              </div>
              <button className="toolbar-btn" onClick={() => setEditingBot(null)}>关闭</button>
            </div>
            {editError && <div className="inline-alert">{editError}</div>}
            <div className="bot-template-row">
              {strategies.map((template) => (
                <button
                  key={template.id}
                  className="bot-template-card"
                  onClick={() => setEditingBot({ ...editingBot, ...getStrategyPatch(template) })}
                >
                  <strong>{template.name}</strong>
                  <span>{template.description}</span>
                </button>
              ))}
            </div>
            <div className="bot-form-section">
              <h4>基础</h4>
              <div className="bot-form-grid">
                <label>
                <span>名称</span>
                <input value={editingBot.name} onChange={(event) => setEditingBot({ ...editingBot, name: event.target.value })} />
                </label>
                <label>
                <span>运行模式</span>
                <select value={editingBot.runMode || 'paper'} onChange={(event) => setEditingBot({ ...editingBot, runMode: event.target.value as BotRunMode })}>
                  <option value="monitor">仅监控</option>
                  <option value="paper">模拟</option>
                  <option value="live">实盘</option>
                </select>
                </label>
                <label>
                <span>主钱包</span>
                <select value={editingBot.ownerAddress} onChange={(event) => setEditingBot({ ...editingBot, ownerAddress: event.target.value, subaccount: '' })}>
                  <option value="">请选择主钱包</option>
                  {dashboardAccounts.map((account) => (
                    <option key={account.address} value={account.address}>
                      {account.name || formatAddress(account.address)}
                    </option>
                  ))}
                  {editingBot.ownerAddress && !dashboardAccounts.some((account) => account.address === editingBot.ownerAddress) && (
                    <option value={editingBot.ownerAddress}>{formatAddress(editingBot.ownerAddress)}</option>
                  )}
                </select>
                </label>
                <label>
                <span>子账户</span>
                <select value={editingBot.subaccount || ''} onChange={(event) => setEditingBot({ ...editingBot, subaccount: event.target.value })}>
                  <option value="">请选择子账户</option>
                  {subaccountsForEditingOwner.map((subaccount) => (
                    <option key={subaccount.address} value={subaccount.address}>
                      {subaccount.alias || formatAddress(subaccount.address)}
                    </option>
                  ))}
                  {editingBot.subaccount && !subaccountsForEditingOwner.some((subaccount) => subaccount.address === editingBot.subaccount) && (
                    <option value={editingBot.subaccount}>{formatAddress(editingBot.subaccount)}</option>
                  )}
                </select>
                </label>
                <label>
                <span>策略</span>
                <input value={editingBot.strategyId} onChange={(event) => setEditingBot({ ...editingBot, strategyId: event.target.value })} />
                </label>
                <label>
                <span>版本</span>
                <input value={editingBot.strategyVersion} onChange={(event) => setEditingBot({ ...editingBot, strategyVersion: event.target.value })} />
                </label>
                <label>
                <span>市场</span>
                <input value={editingBot.symbols.join(', ')} onChange={(event) => setEditingBot({ ...editingBot, symbols: event.target.value.split(',') })} />
                </label>
              </div>
            </div>
            <div className="bot-form-section">
              <h4>风控</h4>
              <div className="bot-form-grid">
                <label>
                <span>最大下单价值</span>
                <input type="number" value={editingBot.maxNotional} onChange={(event) => setEditingBot({ ...editingBot, maxNotional: Number(event.target.value) })} />
                </label>
                <label>
                <span>最大仓位</span>
                <input type="number" value={editingBot.maxPosition} onChange={(event) => setEditingBot({ ...editingBot, maxPosition: Number(event.target.value) })} />
                </label>
                <label>
                <span>日亏损上限</span>
                <input type="number" value={editingBot.maxDailyLoss} onChange={(event) => setEditingBot({ ...editingBot, maxDailyLoss: Number(event.target.value) })} />
                </label>
                <label>
                <span>最大滑点 bps</span>
                <input type="number" value={editingBot.maxSlippageBps} onChange={(event) => setEditingBot({ ...editingBot, maxSlippageBps: Number(event.target.value) })} />
                </label>
                <label>
                <span>每分钟下单数</span>
                <input type="number" value={editingBot.orderRateLimitPerMin} onChange={(event) => setEditingBot({ ...editingBot, orderRateLimitPerMin: Number(event.target.value) })} />
                </label>
              </div>
            </div>
            <div className="bot-form-section">
              <h4>报价</h4>
              <div className="bot-form-grid">
                <label>
                <span>报价价差 bps</span>
                <input type="number" value={editingBot.quoteSpreadBps ?? ''} onChange={(event) => setEditingBot({ ...editingBot, quoteSpreadBps: Number(event.target.value) })} />
                </label>
                <label>
                <span>挂单层数</span>
                <input type="number" value={editingBot.orderLevels ?? ''} onChange={(event) => setEditingBot({ ...editingBot, orderLevels: Number(event.target.value) })} />
                </label>
                <label>
                <span>档位间距 bps</span>
                <input type="number" value={editingBot.levelSpacingBps ?? ''} onChange={(event) => setEditingBot({ ...editingBot, levelSpacingBps: Number(event.target.value) })} />
                </label>
                <label>
                <span>刷新间隔 秒</span>
                <input type="number" value={editingBot.refreshIntervalSec ?? ''} onChange={(event) => setEditingBot({ ...editingBot, refreshIntervalSec: Number(event.target.value) })} />
                </label>
              </div>
            </div>
            <div className="bot-form-section">
              <h4>库存和撤单</h4>
              <div className="bot-form-grid">
                <label>
                <span>最小单笔数量</span>
                <input type="number" value={editingBot.minOrderSize ?? ''} onChange={(event) => setEditingBot({ ...editingBot, minOrderSize: Number(event.target.value) })} />
                </label>
                <label>
                <span>最大单笔数量</span>
                <input type="number" value={editingBot.maxOrderSize ?? ''} onChange={(event) => setEditingBot({ ...editingBot, maxOrderSize: Number(event.target.value) })} />
                </label>
                <label>
                <span>库存偏移 bps</span>
                <input type="number" value={editingBot.inventorySkewBps ?? ''} onChange={(event) => setEditingBot({ ...editingBot, inventorySkewBps: Number(event.target.value) })} />
                </label>
                <label>
                <span>目标库存 %</span>
                <input type="number" value={editingBot.targetInventoryPct ?? ''} onChange={(event) => setEditingBot({ ...editingBot, targetInventoryPct: Number(event.target.value) })} />
                </label>
                <label>
                <span>旧单撤销 秒</span>
                <input type="number" value={editingBot.cancelStaleAfterSec ?? ''} onChange={(event) => setEditingBot({ ...editingBot, cancelStaleAfterSec: Number(event.target.value) })} />
                </label>
                <label className="bot-checkbox-field">
                <span>Post Only</span>
                <input type="checkbox" checked={editingBot.postOnly !== false} onChange={(event) => setEditingBot({ ...editingBot, postOnly: event.target.checked })} />
                </label>
              </div>
            </div>
            <div className="bot-form-section">
              <h4>自动熔断</h4>
              <div className="bot-form-grid">
                <label>
                <span>心跳超时 秒</span>
                <input type="number" value={editingBot.heartbeatTimeoutSec ?? ''} onChange={(event) => setEditingBot({ ...editingBot, heartbeatTimeoutSec: Number(event.target.value) })} />
                </label>
                <label>
                <span>连续错误次数</span>
                <input type="number" value={editingBot.maxConsecutiveErrors ?? ''} onChange={(event) => setEditingBot({ ...editingBot, maxConsecutiveErrors: Number(event.target.value) })} />
                </label>
                <label>
                <span>最大延迟 ms</span>
                <input type="number" value={editingBot.maxLatencyMs ?? ''} onChange={(event) => setEditingBot({ ...editingBot, maxLatencyMs: Number(event.target.value) })} />
                </label>
              </div>
            </div>
            <div className="bot-confirm-actions">
              <button className="toolbar-btn" disabled={loading} onClick={() => setEditingBot(null)}>取消</button>
              <button className="toolbar-btn" disabled={loading} onClick={saveEditingBot}>保存</button>
            </div>
          </aside>
        </div>
      )}
      {bulkCreateOpen && (
        <div className="bot-modal-backdrop" onClick={() => setBulkCreateOpen(false)}>
          <aside className="bot-modal" onClick={(event) => event.stopPropagation()}>
            <div className="bot-modal-head">
              <div>
                <h3>批量创建 Bot</h3>
                <span className="bot-panel-subtitle">选择模板和子账户，一次生成多个配置</span>
              </div>
              <button className="toolbar-btn" onClick={() => setBulkCreateOpen(false)}>关闭</button>
            </div>
            <div className="bot-form-grid">
              <label>
                <span>模板</span>
                <select value={bulkTemplateId} onChange={(event) => setBulkTemplateId(event.target.value)}>
                  <option value="">默认第一个策略</option>
                  {strategies.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>市场</span>
                <input value={bulkSymbol} onChange={(event) => setBulkSymbol(event.target.value)} />
              </label>
            </div>
            <div className="bot-detail-section">
              <h4>选择子账户</h4>
              {dashboardSubaccounts.length === 0 ? (
                <p className="text-secondary">暂无可选子账户，请先在看板加载账户数据。</p>
              ) : (
                <div className="bot-bulk-account-list">
                  {dashboardSubaccounts.map((subaccount) => (
                    <label key={subaccount.address} className="bot-bulk-account-item">
                      <input
                        type="checkbox"
                        checked={bulkSubaccounts.includes(subaccount.address)}
                        onChange={() => toggleBulkSubaccount(subaccount.address)}
                      />
                      <span>{subaccount.alias || formatAddress(subaccount.address)}</span>
                      <small>{subaccount.ownerName || formatAddress(subaccount.owner || '')}</small>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="bot-confirm-actions">
              <button className="toolbar-btn" disabled={loading} onClick={() => setBulkCreateOpen(false)}>取消</button>
              <button className="toolbar-btn" disabled={loading || bulkSubaccounts.length === 0 || !bulkSymbol.trim()} onClick={saveBulkBots}>
                创建 {bulkSubaccounts.length} 个
              </button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
