import { useState } from 'react';
import { useBotStore } from './store';
import type { BotStrategy } from './types';

const createEmptyStrategy = (): BotStrategy => ({
  id: `strategy-${Date.now()}`,
  name: '',
  description: '',
  strategyId: 'mm-spread-v1',
  strategyVersion: '1.0.0',
  maxNotional: 10000,
  maxPosition: 0.2,
  maxDailyLoss: 300,
  maxSlippageBps: 20,
  orderRateLimitPerMin: 20,
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

export function StrategyPanel() {
  const { strategies, upsertStrategy, deleteStrategy, loading } = useBotStore();
  const [editingStrategy, setEditingStrategy] = useState<BotStrategy | null>(null);
  const [error, setError] = useState('');

  const saveStrategy = async () => {
    if (!editingStrategy) return;
    if (!editingStrategy.name.trim()) {
      setError('请填写策略名称');
      return;
    }
    if (!editingStrategy.strategyId.trim()) {
      setError('请填写策略 ID');
      return;
    }
    setError('');
    await upsertStrategy({
      ...editingStrategy,
      name: editingStrategy.name.trim(),
      description: editingStrategy.description.trim(),
      strategyId: editingStrategy.strategyId.trim(),
      strategyVersion: editingStrategy.strategyVersion.trim() || '1.0.0',
    });
    setEditingStrategy(null);
  };

  const copyStrategy = (strategy: BotStrategy) => {
    setError('');
    setEditingStrategy({
      ...strategy,
      id: `strategy-${Date.now()}`,
      name: `${strategy.name} Copy`,
    });
  };

  return (
    <section className="chart-section bot-panel">
      <div className="bot-panel-head">
        <div>
          <h3>策略管理</h3>
          <span className="bot-panel-subtitle">维护可复用的 bot 策略配置</span>
        </div>
        <button className="toolbar-btn" onClick={() => {
          setError('');
          setEditingStrategy(createEmptyStrategy());
        }}>新增策略</button>
      </div>
      <div className="bot-grid">
        {strategies.map((strategy) => (
          <article key={strategy.id} className="bot-card">
            <div className="bot-card-head">
              <strong>{strategy.name}</strong>
              <span className="bot-status-badge status-stopped">{strategy.strategyVersion}</span>
            </div>
            <p className="text-secondary">{strategy.description || '暂无说明'}</p>
            <div className="bot-meta-grid">
              <span>策略 ID</span>
              <strong>{strategy.strategyId}</strong>
              <span>最大下单价值</span>
              <strong>${strategy.maxNotional.toLocaleString()}</strong>
              <span>日亏损上限</span>
              <strong>${strategy.maxDailyLoss.toLocaleString()}</strong>
              <span>滑点</span>
              <strong>{strategy.maxSlippageBps} bps</strong>
              <span>报价价差</span>
              <strong>{strategy.quoteSpreadBps} bps</strong>
              <span>挂单层数</span>
              <strong>{strategy.orderLevels}</strong>
            </div>
            <div className="bot-actions">
              <button className="toolbar-btn" onClick={() => {
                setError('');
                setEditingStrategy(strategy);
              }}>编辑</button>
              <button className="toolbar-btn" onClick={() => copyStrategy(strategy)}>复制</button>
              <button className="toolbar-btn bot-danger-btn subtle" disabled={loading} onClick={() => deleteStrategy(strategy.id)}>删除</button>
            </div>
          </article>
        ))}
      </div>
      {editingStrategy && (
        <div className="bot-modal-backdrop" onClick={() => setEditingStrategy(null)}>
          <aside className="bot-modal" onClick={(event) => event.stopPropagation()}>
            <div className="bot-modal-head">
              <div>
                <h3>{strategies.some((item) => item.id === editingStrategy.id) ? '编辑策略' : '新增策略'}</h3>
                <span className="bot-panel-subtitle">保存后可用于新增和批量创建 bot</span>
              </div>
              <button className="toolbar-btn" onClick={() => setEditingStrategy(null)}>关闭</button>
            </div>
            {error && <div className="inline-alert">{error}</div>}
            <div className="bot-form-section">
              <h4>基础</h4>
              <div className="bot-form-grid">
                <label>
                <span>策略名称</span>
                <input value={editingStrategy.name} onChange={(event) => setEditingStrategy({ ...editingStrategy, name: event.target.value })} />
                </label>
                <label>
                <span>策略 ID</span>
                <input value={editingStrategy.strategyId} onChange={(event) => setEditingStrategy({ ...editingStrategy, strategyId: event.target.value })} />
                </label>
                <label>
                <span>版本</span>
                <input value={editingStrategy.strategyVersion} onChange={(event) => setEditingStrategy({ ...editingStrategy, strategyVersion: event.target.value })} />
                </label>
                <label>
                <span>说明</span>
                <input value={editingStrategy.description} onChange={(event) => setEditingStrategy({ ...editingStrategy, description: event.target.value })} />
                </label>
              </div>
            </div>
            <div className="bot-form-section">
              <h4>风控</h4>
              <div className="bot-form-grid">
                <label>
                <span>最大下单价值</span>
                <input type="number" value={editingStrategy.maxNotional} onChange={(event) => setEditingStrategy({ ...editingStrategy, maxNotional: Number(event.target.value) })} />
                </label>
                <label>
                <span>最大仓位</span>
                <input type="number" value={editingStrategy.maxPosition} onChange={(event) => setEditingStrategy({ ...editingStrategy, maxPosition: Number(event.target.value) })} />
                </label>
                <label>
                <span>日亏损上限</span>
                <input type="number" value={editingStrategy.maxDailyLoss} onChange={(event) => setEditingStrategy({ ...editingStrategy, maxDailyLoss: Number(event.target.value) })} />
                </label>
                <label>
                <span>最大滑点 bps</span>
                <input type="number" value={editingStrategy.maxSlippageBps} onChange={(event) => setEditingStrategy({ ...editingStrategy, maxSlippageBps: Number(event.target.value) })} />
                </label>
                <label>
                <span>每分钟下单数</span>
                <input type="number" value={editingStrategy.orderRateLimitPerMin} onChange={(event) => setEditingStrategy({ ...editingStrategy, orderRateLimitPerMin: Number(event.target.value) })} />
                </label>
              </div>
            </div>
            <div className="bot-form-section">
              <h4>报价</h4>
              <div className="bot-form-grid">
                <label>
                <span>报价价差 bps</span>
                <input type="number" value={editingStrategy.quoteSpreadBps} onChange={(event) => setEditingStrategy({ ...editingStrategy, quoteSpreadBps: Number(event.target.value) })} />
                </label>
                <label>
                <span>挂单层数</span>
                <input type="number" value={editingStrategy.orderLevels} onChange={(event) => setEditingStrategy({ ...editingStrategy, orderLevels: Number(event.target.value) })} />
                </label>
                <label>
                <span>档位间距 bps</span>
                <input type="number" value={editingStrategy.levelSpacingBps} onChange={(event) => setEditingStrategy({ ...editingStrategy, levelSpacingBps: Number(event.target.value) })} />
                </label>
                <label>
                <span>刷新间隔 秒</span>
                <input type="number" value={editingStrategy.refreshIntervalSec} onChange={(event) => setEditingStrategy({ ...editingStrategy, refreshIntervalSec: Number(event.target.value) })} />
                </label>
              </div>
            </div>
            <div className="bot-form-section">
              <h4>库存和撤单</h4>
              <div className="bot-form-grid">
                <label>
                <span>最小单笔数量</span>
                <input type="number" value={editingStrategy.minOrderSize} onChange={(event) => setEditingStrategy({ ...editingStrategy, minOrderSize: Number(event.target.value) })} />
                </label>
                <label>
                <span>最大单笔数量</span>
                <input type="number" value={editingStrategy.maxOrderSize} onChange={(event) => setEditingStrategy({ ...editingStrategy, maxOrderSize: Number(event.target.value) })} />
                </label>
                <label>
                <span>库存偏移 bps</span>
                <input type="number" value={editingStrategy.inventorySkewBps} onChange={(event) => setEditingStrategy({ ...editingStrategy, inventorySkewBps: Number(event.target.value) })} />
                </label>
                <label>
                <span>目标库存 %</span>
                <input type="number" value={editingStrategy.targetInventoryPct} onChange={(event) => setEditingStrategy({ ...editingStrategy, targetInventoryPct: Number(event.target.value) })} />
                </label>
                <label>
                <span>旧单撤销 秒</span>
                <input type="number" value={editingStrategy.cancelStaleAfterSec} onChange={(event) => setEditingStrategy({ ...editingStrategy, cancelStaleAfterSec: Number(event.target.value) })} />
                </label>
                <label className="bot-checkbox-field">
                <span>Post Only</span>
                <input type="checkbox" checked={editingStrategy.postOnly} onChange={(event) => setEditingStrategy({ ...editingStrategy, postOnly: event.target.checked })} />
                </label>
              </div>
            </div>
            <div className="bot-form-section">
              <h4>自动熔断</h4>
              <div className="bot-form-grid">
                <label>
                  <span>心跳超时 秒</span>
                  <input type="number" value={editingStrategy.heartbeatTimeoutSec} onChange={(event) => setEditingStrategy({ ...editingStrategy, heartbeatTimeoutSec: Number(event.target.value) })} />
                </label>
                <label>
                  <span>连续错误次数</span>
                  <input type="number" value={editingStrategy.maxConsecutiveErrors} onChange={(event) => setEditingStrategy({ ...editingStrategy, maxConsecutiveErrors: Number(event.target.value) })} />
                </label>
                <label>
                  <span>最大延迟 ms</span>
                  <input type="number" value={editingStrategy.maxLatencyMs} onChange={(event) => setEditingStrategy({ ...editingStrategy, maxLatencyMs: Number(event.target.value) })} />
                </label>
              </div>
            </div>
            <div className="bot-confirm-actions">
              <button className="toolbar-btn" disabled={loading} onClick={() => setEditingStrategy(null)}>取消</button>
              <button className="toolbar-btn" disabled={loading} onClick={saveStrategy}>保存</button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
