import { useMemo, useState } from 'react';
import { useBotStore } from './store';
import type { BotEvent } from './types';

const eventTypeOptions: Array<'ALL' | BotEvent['type']> = ['ALL', '启动', '暂停', '熔断', '告警', '系统'];

const formatEventTime = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString();
};

export function AuditTrailPanel() {
  const { bots, events } = useBotStore();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | BotEvent['type']>('ALL');
  const [botFilter, setBotFilter] = useState('ALL');

  const botNameById = useMemo(() => new Map(bots.map((bot) => [bot.botId, bot.name])), [bots]);
  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return events.filter((event) => {
      const botName = botNameById.get(event.botId) || event.botId;
      const typeOk = typeFilter === 'ALL' || event.type === typeFilter;
      const botOk = botFilter === 'ALL' || event.botId === botFilter;
      const queryOk = !normalizedQuery || [event.type, event.message, event.botId, botName]
        .some((value) => value.toLowerCase().includes(normalizedQuery));
      return typeOk && botOk && queryOk;
    });
  }, [botFilter, botNameById, events, query, typeFilter]);

  const exportEvents = () => {
    const content = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), events: filteredEvents }, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'decibel-bot-audit-log.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="chart-section bot-panel">
      <div className="bot-panel-head">
        <div>
          <h3>操作记录</h3>
          <span className="bot-panel-subtitle">查看 bot、策略、风控的最近操作</span>
        </div>
        <button className="toolbar-btn" disabled={filteredEvents.length === 0} onClick={exportEvents}>导出记录</button>
      </div>
      <div className="bot-toolbar audit-toolbar">
        <input
          className="toolbar-control bot-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索动作 / bot / 内容"
        />
        <select className="toolbar-control toolbar-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'ALL' | BotEvent['type'])}>
          {eventTypeOptions.map((type) => (
            <option key={type} value={type}>{type === 'ALL' ? '全部动作' : type}</option>
          ))}
        </select>
        <select className="toolbar-control toolbar-select" value={botFilter} onChange={(event) => setBotFilter(event.target.value)}>
          <option value="ALL">全部 Bot</option>
          <option value="GLOBAL">全局动作</option>
          {bots.map((bot) => (
            <option key={bot.botId} value={bot.botId}>{bot.name}</option>
          ))}
        </select>
        <span className="bot-toolbar-note text-secondary">共 {filteredEvents.length} 条</span>
      </div>
      {filteredEvents.length === 0 ? (
        <div className="bot-empty-state">
          <strong>暂无匹配记录</strong>
          <span className="text-secondary">启动、暂停、编辑、熔断等动作会显示在这里</span>
        </div>
      ) : (
        <div className="bot-event-list audit-event-list">
          {filteredEvents.map((event) => {
            const botName = botNameById.get(event.botId) || event.botId;
            return (
              <div key={event.id} className="bot-event-item audit-event-item">
                <div className="bot-event-dot" aria-hidden="true" />
                <div className="bot-event-body">
                  <div className="bot-event-row">
                    <span>{event.type}</span>
                    <small>{formatEventTime(event.createdAt)}</small>
                  </div>
                  <strong>{botName}</strong>
                  <p>{event.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
