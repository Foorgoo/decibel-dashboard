import { useMemo, useState } from 'react';
import { useBotStore } from './store';
import { formatBotErrorMessage } from './errorMessage';

export function AlertsPanel() {
  const { alerts, events, ackAlert, ackAllAlerts, loading, error, errorCode } = useBotStore();
  const [onlyOpen, setOnlyOpen] = useState(false);
  const errorMessage = formatBotErrorMessage(error, errorCode);
  const unackedCount = alerts.filter((item) => !item.acked).length;
  const visibleAlerts = useMemo(() => (
    onlyOpen ? alerts.filter((alert) => !alert.acked) : alerts
  ), [alerts, onlyOpen]);
  const recentEvents = events.slice(0, 8);

  return (
    <section className="chart-section bot-panel">
      <div className="bot-panel-head">
        <div>
          <h3>告警</h3>
          <span className="bot-panel-subtitle">异常提醒和处理状态</span>
        </div>
      </div>
      <div className="bot-kpi-row">
        <div className="bot-kpi-card">
          <span className="text-secondary">告警总数</span>
          <strong>{alerts.length}</strong>
        </div>
        <div className="bot-kpi-card">
          <span className="text-secondary">待处理</span>
          <strong>{unackedCount}</strong>
        </div>
      </div>
      {errorMessage && <div className="inline-alert">{errorMessage}</div>}
      <div className="bot-toolbar">
        <button className={`toolbar-btn ${onlyOpen ? 'active-soft' : ''}`} onClick={() => setOnlyOpen((value) => !value)}>
          只看未处理
        </button>
        <button className="toolbar-btn" disabled={loading || unackedCount === 0} onClick={() => ackAllAlerts()}>
          一键确认
        </button>
      </div>
      {visibleAlerts.length === 0 ? (
        <p className="text-secondary">暂无告警</p>
      ) : (
        <div className="bot-alert-list">
          {visibleAlerts.map((alert) => (
            <div key={alert.id} className={`bot-alert-item alert-${alert.level}`}>
              <div>
                <div className="bot-alert-title">
                  <span className="bot-alert-level">{alert.level.toUpperCase()}</span>
                  <strong>{alert.message}</strong>
                </div>
                <div className="text-secondary">{alert.botId} · {new Date(alert.createdAt).toLocaleString()}</div>
              </div>
              <button className="toolbar-btn" disabled={alert.acked || loading} onClick={() => ackAlert(alert.id)}>
                {alert.acked ? '已确认' : '确认'}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="bot-detail-section bot-alert-events">
        <h4>最近动作</h4>
        {recentEvents.length === 0 ? (
          <p className="text-secondary">暂无记录</p>
        ) : (
          <div className="bot-event-list">
            {recentEvents.map((event) => (
              <div key={event.id} className="bot-event-item">
                <div className="bot-event-dot" aria-hidden="true" />
                <div className="bot-event-body">
                  <div className="bot-event-row">
                    <span>{event.type}</span>
                    <small>{new Date(event.createdAt).toLocaleString()}</small>
                  </div>
                  <strong>{event.botId} · {event.message}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
