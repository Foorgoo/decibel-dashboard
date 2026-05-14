import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { AlertsPanel } from './AlertsPanel';
import { AuditTrailPanel } from './AuditTrailPanel';
import { BotControlPanel } from './BotControlPanel';
import { RiskCenterPanel } from './RiskCenterPanel';
import { StrategyPanel } from './StrategyPanel';
import { useBotStore } from './store';
import { botAdminApi, getBotApiToken, setBotApiToken } from '../../api/bots';
import type { BotBackupListing, BotRunnerStatus, BotSnapshot } from '../../api/botTypes';

type BotModuleView = 'manage' | 'strategies' | 'risk' | 'alerts' | 'audit';

export function BotModuleShell() {
  const [view, setView] = useState<BotModuleView>('manage');
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [opsModalOpen, setOpsModalOpen] = useState(false);
  const [tokenDraft, setTokenDraft] = useState('');
  const [runnerStatus, setRunnerStatus] = useState<BotRunnerStatus | null>(null);
  const [backupListing, setBackupListing] = useState<BotBackupListing | null>(null);
  const [opsMessage, setOpsMessage] = useState('');
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const bots = useBotStore((state) => state.bots);
  const alerts = useBotStore((state) => state.alerts);
  const events = useBotStore((state) => state.events);
  const runtimes = useBotStore((state) => state.runtimes);
  const loading = useBotStore((state) => state.loading);
  const hydrate = useBotStore((state) => state.hydrate);
  const runningCount = bots.filter((bot) => runtimes[bot.botId]?.status === 'RUNNING').length;
  const liveRunningCount = bots.filter((bot) => bot.runMode === 'live' && runtimes[bot.botId]?.status === 'RUNNING').length;
  const trippedCount = bots.filter((bot) => runtimes[bot.botId]?.status === 'TRIPPED').length;
  const openAlerts = alerts.filter((alert) => !alert.acked).length;

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    let alive = true;
    const loadRunnerStatus = async () => {
      try {
        const status = await botAdminApi.getRunnerStatus();
        if (alive) setRunnerStatus(status);
      } catch {
        if (alive) setRunnerStatus(null);
      }
    };
    loadRunnerStatus();
    const timer = window.setInterval(loadRunnerStatus, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const openTokenModal = () => {
    setTokenDraft(getBotApiToken());
    setTokenModalOpen(true);
  };

  const saveToken = () => {
    setBotApiToken(tokenDraft);
    setTokenModalOpen(false);
    hydrate();
  };

  const runnerSourceLabel = runnerStatus?.source === 'readonly'
    ? '只读'
    : runnerStatus?.source === 'live'
      ? '实盘'
      : '模拟';

  const openOpsModal = async () => {
    setOpsModalOpen(true);
    setOpsMessage('');
    try {
      const [status, backups] = await Promise.all([
        botAdminApi.getRunnerStatus(),
        botAdminApi.listBackups(),
      ]);
      setRunnerStatus(status);
      setBackupListing(backups);
    } catch (error: any) {
      setOpsMessage(error?.message || '运维数据加载失败，请检查 Token');
    }
  };

  const downloadBackup = async () => {
    try {
      const backup = await botAdminApi.exportBackup();
      const content = JSON.stringify(backup, null, 2);
      const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `decibel-bot-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setOpsMessage('备份已导出');
    } catch (error: any) {
      setOpsMessage(error?.message || '备份导出失败，请检查 Token');
    }
  };

  const restoreBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const snapshot = (parsed?.snapshot || parsed) as BotSnapshot;
      await botAdminApi.restoreBackup(snapshot);
      await hydrate();
      setOpsMessage('已恢复备份');
      const backups = await botAdminApi.listBackups();
      setBackupListing(backups);
    } catch (error: any) {
      setOpsMessage(error?.message || '恢复失败，请检查备份文件和 Token');
    }
  };

  return (
    <div className="bot-module">
      <div className="bot-module-head">
        <div>
          <h2>Bot 模块</h2>
          <span>独立管理多账号做市机器人</span>
        </div>
        <div className="bot-module-stats">
          <span>运行 {runningCount}</span>
          <span>实盘 {liveRunningCount}</span>
          <span>熔断 {trippedCount}</span>
          <span>告警 {openAlerts}</span>
          <button className="toolbar-btn" disabled={loading} onClick={() => hydrate()}>
            {loading ? '同步中' : '刷新'}
          </button>
          <button className="toolbar-btn" onClick={openTokenModal}>后端 Token</button>
          <button className="toolbar-btn" onClick={openOpsModal}>运维</button>
        </div>
      </div>
      <div className="bot-ops-strip">
        <span className={runnerStatus?.enabled ? 'text-success' : 'text-secondary'}>
          Runner {runnerStatus?.enabled ? '运行中' : '未知'}
        </span>
        <span>数据源 {runnerSourceLabel}</span>
        <span>Tick {runnerStatus?.tickCount ?? '-'}</span>
        <span>运行 Bot {runnerStatus?.runningCount ?? runningCount}</span>
        <span>最近 {runnerStatus?.lastTickAt ? new Date(runnerStatus.lastTickAt).toLocaleTimeString() : '-'}</span>
      </div>
      <div className="bot-module-tabs">
        <button className={`tab-btn ${view === 'manage' ? 'active' : ''}`} onClick={() => setView('manage')}>
          管理 <span>{bots.length}</span>
        </button>
        <button className={`tab-btn ${view === 'strategies' ? 'active' : ''}`} onClick={() => setView('strategies')}>策略</button>
        <button className={`tab-btn ${view === 'risk' ? 'active' : ''}`} onClick={() => setView('risk')}>风险</button>
        <button className={`tab-btn ${view === 'alerts' ? 'active' : ''}`} onClick={() => setView('alerts')}>
          告警 <span>{openAlerts}</span>
        </button>
        <button className={`tab-btn ${view === 'audit' ? 'active' : ''}`} onClick={() => setView('audit')}>
          记录 <span>{events.length}</span>
        </button>
      </div>
      {view === 'manage' && <BotControlPanel />}
      {view === 'strategies' && <StrategyPanel />}
      {view === 'risk' && <RiskCenterPanel />}
      {view === 'alerts' && <AlertsPanel />}
      {view === 'audit' && <AuditTrailPanel />}
      {tokenModalOpen && (
        <div className="bot-modal-backdrop" onClick={() => setTokenModalOpen(false)}>
          <aside className="bot-confirm-modal bot-token-modal" onClick={(event) => event.stopPropagation()}>
            <div className="bot-modal-head">
              <div>
                <h3>后端 Token</h3>
                <span className="bot-panel-subtitle">VPS 开启写操作保护后，在这里填同一个 Token</span>
              </div>
            </div>
            <label className="bot-token-field">
              <span>Token</span>
              <input
                type="password"
                value={tokenDraft}
                onChange={(event) => setTokenDraft(event.target.value)}
                placeholder="和 BOT_API_TOKEN 保持一致"
              />
            </label>
            <p className="text-secondary bot-token-help">
              不填也能读取数据；如果后端设置了 `BOT_API_TOKEN`，启动、暂停、编辑、删除等写操作需要这个 Token。
            </p>
            <div className="bot-confirm-actions">
              <button className="toolbar-btn" onClick={() => setTokenModalOpen(false)}>取消</button>
              <button className="toolbar-btn" onClick={saveToken}>保存</button>
            </div>
          </aside>
        </div>
      )}
      {opsModalOpen && (
        <div className="bot-modal-backdrop" onClick={() => setOpsModalOpen(false)}>
          <aside className="bot-modal bot-ops-modal" onClick={(event) => event.stopPropagation()}>
            <div className="bot-modal-head">
              <div>
                <h3>运维</h3>
                <span className="bot-panel-subtitle">Runner 状态、备份导出和恢复</span>
              </div>
              <button className="toolbar-btn" onClick={() => setOpsModalOpen(false)}>关闭</button>
            </div>
            {opsMessage && <div className="inline-alert">{opsMessage}</div>}
            <div className="bot-detail-section">
              <h4>Runner 状态</h4>
              <div className="bot-detail-grid">
                <span>状态</span>
                <strong>{runnerStatus?.enabled ? '运行中' : '未知/未开启'}</strong>
                <span>间隔</span>
                <strong>{runnerStatus ? `${runnerStatus.intervalMs}ms` : '-'}</strong>
                <span>数据源</span>
                <strong>{runnerSourceLabel}</strong>
                <span>Tick 次数</span>
                <strong>{runnerStatus?.tickCount ?? '-'}</strong>
                <span>最近运行</span>
                <strong>{runnerStatus?.lastTickAt ? new Date(runnerStatus.lastTickAt).toLocaleString() : '-'}</strong>
                <span>最近错误</span>
                <strong>{runnerStatus?.lastError || '-'}</strong>
              </div>
            </div>
            <div className="bot-detail-section">
              <h4>备份</h4>
              <div className="bot-actions">
                <button className="toolbar-btn" onClick={downloadBackup}>下载当前备份</button>
                <button className="toolbar-btn" onClick={() => restoreInputRef.current?.click()}>从文件恢复</button>
                <input ref={restoreInputRef} type="file" accept="application/json" hidden onChange={restoreBackup} />
              </div>
              <div className="bot-backup-list">
                {(backupListing?.backups || []).slice(0, 8).map((backup) => (
                  <div key={backup.name} className="bot-backup-item">
                    <strong>{backup.name}</strong>
                    <span>{new Date(backup.createdAt).toLocaleString()} · {(backup.size / 1024).toFixed(1)} KB</span>
                  </div>
                ))}
                {backupListing && backupListing.backups.length === 0 && <p className="text-secondary">暂无自动备份</p>}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
