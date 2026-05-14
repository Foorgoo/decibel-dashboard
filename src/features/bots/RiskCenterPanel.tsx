import { useState } from 'react';
import { useBotStore } from './store';
import { formatBotErrorMessage } from './errorMessage';
import { validateRiskRule } from './validation';
import type { BotRiskRule } from './types';

const createEmptyRule = (): BotRiskRule => ({
  id: `risk-${Date.now()}`,
  scope: 'account',
  target: '',
  name: '',
  maxNotional: 50000,
  maxDailyLoss: 1000,
  maxRunningBots: 5,
  enabled: true,
});

export function RiskCenterPanel() {
  const { bots, runtimes, alerts, riskRules, upsertRiskRule, deleteRiskRule, globalKillSwitch, loading, error, errorCode } = useBotStore();
  const errorMessage = formatBotErrorMessage(error, errorCode);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BotRiskRule | null>(null);
  const [ruleError, setRuleError] = useState('');
  const runningCount = bots.filter((bot) => runtimes[bot.botId]?.status === 'RUNNING').length;
  const trippedCount = bots.filter((bot) => runtimes[bot.botId]?.status === 'TRIPPED').length;
  const liveRunningCount = bots.filter((bot) => bot.runMode === 'live' && runtimes[bot.botId]?.status === 'RUNNING').length;
  const unhealthyCount = bots.filter((bot) => {
    const runtime = runtimes[bot.botId];
    return runtime?.marketDataStatus === 'down'
      || runtime?.executionStatus === 'down'
      || runtime?.marketDataStatus === 'warning'
      || runtime?.executionStatus === 'warning';
  }).length;
  const openAlerts = alerts.filter((alert) => !alert.acked).length;
  const riskState = trippedCount > 0 || openAlerts > 0 || unhealthyCount > 0 ? '需要关注' : runningCount > 0 ? '正常运行' : '空闲';

  const handleConfirmKillSwitch = async () => {
    await globalKillSwitch();
    setConfirmOpen(false);
  };

  const saveRule = async () => {
    if (!editingRule) return;
    const normalizedRule = {
      ...editingRule,
      name: editingRule.name.trim(),
      target: editingRule.scope === 'global' ? 'GLOBAL' : editingRule.target.trim(),
      maxRunningBots: Math.floor(editingRule.maxRunningBots),
    };
    const issues = validateRiskRule(normalizedRule);
    if (issues.length > 0) {
      setRuleError(issues[0]);
      return;
    }
    setRuleError('');
    await upsertRiskRule(normalizedRule);
    setEditingRule(null);
  };

  return (
    <section className="chart-section bot-panel">
      <div className="bot-panel-head">
        <div>
          <h3>风险控制</h3>
          <span className="bot-panel-subtitle">全局开关和保护状态</span>
        </div>
      </div>
      {errorMessage && <div className="inline-alert">{errorMessage}</div>}
      <div className="bot-risk-state">
        <span className={riskState === '需要关注' ? 'text-danger' : 'text-success'}>{riskState}</span>
        <strong>{runningCount} 个运行中</strong>
      </div>
      <div className="bot-risk-grid">
        <div className="bot-risk-tile">
          <span className="text-secondary">运行中</span>
          <strong>{runningCount}</strong>
        </div>
        <div className="bot-risk-tile">
          <span className="text-secondary">实盘运行</span>
          <strong>{liveRunningCount}</strong>
        </div>
        <div className="bot-risk-tile">
          <span className="text-secondary">已熔断</span>
          <strong>{trippedCount}</strong>
        </div>
        <div className="bot-risk-tile">
          <span className="text-secondary">健康异常</span>
          <strong>{unhealthyCount}</strong>
        </div>
        <div className="bot-risk-tile">
          <span className="text-secondary">待处理告警</span>
          <strong>{openAlerts}</strong>
        </div>
      </div>
      <div className="bot-actions">
        <button className="toolbar-btn bot-danger-btn" disabled={loading} onClick={() => setConfirmOpen(true)}>
          全部紧急停止
        </button>
        <button className="toolbar-btn" disabled={loading} onClick={() => {
          setRuleError('');
          setEditingRule(createEmptyRule());
        }}>
          新增风控规则
        </button>
      </div>
      <div className="bot-detail-section">
        <h4>风控规则</h4>
        {riskRules.length === 0 ? (
          <p className="text-secondary">暂无规则</p>
        ) : (
          <div className="bot-alert-list">
            {riskRules.map((rule) => (
              <div key={rule.id} className="bot-alert-item">
                <div>
                  <div className="bot-alert-title">
                    <span className="bot-alert-level">{rule.scope.toUpperCase()}</span>
                    <strong>{rule.name}</strong>
                  </div>
                  <div className="text-secondary">
                    {rule.target} · ${rule.maxNotional.toLocaleString()} · 日亏损 ${rule.maxDailyLoss.toLocaleString()} · 运行 {rule.maxRunningBots}
                  </div>
                </div>
                <div className="bot-actions">
                  <button className="toolbar-btn" onClick={() => {
                    setRuleError('');
                    setEditingRule(rule);
                  }}>编辑</button>
                  <button className="toolbar-btn bot-danger-btn subtle" disabled={loading} onClick={() => deleteRiskRule(rule.id)}>删除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {confirmOpen && (
        <div className="bot-modal-backdrop" onClick={() => setConfirmOpen(false)}>
          <aside className="bot-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="bot-modal-head">
              <div>
                <h3>确认全部紧急停止？</h3>
                <span className="bot-panel-subtitle">所有 bot 会进入已熔断状态</span>
              </div>
            </div>
            <p className="text-secondary">
              适合行情异常、网络异常或策略异常时使用。确认后，需要手动恢复 bot。
            </p>
            <div className="bot-confirm-actions">
              <button className="toolbar-btn" disabled={loading} onClick={() => setConfirmOpen(false)}>取消</button>
              <button className="toolbar-btn bot-danger-btn" disabled={loading} onClick={handleConfirmKillSwitch}>
                确认停止全部
              </button>
            </div>
          </aside>
        </div>
      )}
      {editingRule && (
        <div className="bot-modal-backdrop" onClick={() => setEditingRule(null)}>
          <aside className="bot-modal" onClick={(event) => event.stopPropagation()}>
            <div className="bot-modal-head">
              <div>
                <h3>{riskRules.some((rule) => rule.id === editingRule.id) ? '编辑风控规则' : '新增风控规则'}</h3>
                <span className="bot-panel-subtitle">账户级、市场级、全局级限制</span>
              </div>
              <button className="toolbar-btn" onClick={() => setEditingRule(null)}>关闭</button>
            </div>
            {ruleError && <div className="inline-alert">{ruleError}</div>}
            <div className="bot-form-grid">
              <label>
                <span>规则名称</span>
                <input value={editingRule.name} onChange={(event) => setEditingRule({ ...editingRule, name: event.target.value })} />
              </label>
              <label>
                <span>范围</span>
                <select value={editingRule.scope} onChange={(event) => {
                  const scope = event.target.value as BotRiskRule['scope'];
                  setEditingRule({ ...editingRule, scope, target: scope === 'global' ? 'GLOBAL' : editingRule.target });
                }}>
                  <option value="account">账户</option>
                  <option value="market">市场</option>
                  <option value="global">全局</option>
                </select>
              </label>
              <label>
                <span>对象</span>
                <input value={editingRule.target} onChange={(event) => setEditingRule({ ...editingRule, target: event.target.value })} />
              </label>
              <label>
                <span>最大总价值</span>
                <input type="number" value={editingRule.maxNotional} onChange={(event) => setEditingRule({ ...editingRule, maxNotional: Number(event.target.value) })} />
              </label>
              <label>
                <span>日亏损上限</span>
                <input type="number" value={editingRule.maxDailyLoss} onChange={(event) => setEditingRule({ ...editingRule, maxDailyLoss: Number(event.target.value) })} />
              </label>
              <label>
                <span>最多运行 Bot</span>
                <input type="number" value={editingRule.maxRunningBots} onChange={(event) => setEditingRule({ ...editingRule, maxRunningBots: Number(event.target.value) })} />
              </label>
              <label className="bot-checkbox-field">
                <span>启用</span>
                <input type="checkbox" checked={editingRule.enabled} onChange={(event) => setEditingRule({ ...editingRule, enabled: event.target.checked })} />
              </label>
            </div>
            <div className="bot-confirm-actions">
              <button className="toolbar-btn" disabled={loading} onClick={() => setEditingRule(null)}>取消</button>
              <button className="toolbar-btn" disabled={loading} onClick={saveRule}>保存</button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
