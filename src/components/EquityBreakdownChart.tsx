import { useDashboardStore } from '../store';
import { formatDisplayMoney } from '../utils/displayFormat';
import { normalizeCurrencyAmount } from '../utils/numberFormat';

const PERCENT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const getFiniteNumber = (value: unknown) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const getFundingDisplayValue = (fundingCost: number) => normalizeCurrencyAmount(-fundingCost);

export function EquityBreakdownChart() {
  const { account, currentAccount } = useDashboardStore();

  if (!account) {
    return (
      <div className="chart-section equity-breakdown-section">
        <div className="section-header compact">
          <h2 className="section-title">权益拆分</h2>
        </div>
        <div className="empty-state equity-breakdown-empty">
          <p>暂无账户数据</p>
        </div>
      </div>
    );
  }

  const equity = getFiniteNumber(account.perp_equity_balance);
  const withdrawable = getFiniteNumber(account.usdc_cross_withdrawable_balance);
  const totalMargin = getFiniteNumber(account.total_margin);
  const maintenanceMargin = getFiniteNumber(account.maintenance_margin);
  const unrealizedPnl = getFiniteNumber(account.unrealized_pnl);
  const fundingCost = getFiniteNumber(account.unrealized_funding_cost);
  const fundingDisplayValue = getFundingDisplayValue(fundingCost);

  const rows = [
    { label: '可提款余额', value: withdrawable, color: '#38bdf8', tone: 'neutral' },
    { label: '保证金占用', value: totalMargin, color: '#ffb800', tone: 'neutral' },
    { label: '维持保证金', value: maintenanceMargin, color: '#a855f7', tone: 'neutral' },
    { label: '未实现盈亏', value: unrealizedPnl, color: unrealizedPnl >= 0 ? '#00d4aa' : '#ff4757', tone: unrealizedPnl >= 0 ? 'positive' : 'negative' },
    { label: '资金费', value: fundingDisplayValue, color: fundingDisplayValue > 0 ? '#00d4aa' : fundingDisplayValue < 0 ? '#ff4757' : '#55556a', tone: fundingDisplayValue > 0 ? 'positive' : fundingDisplayValue < 0 ? 'negative' : 'neutral' },
  ];
  const maxAbsValue = Math.max(...rows.map((row) => Math.abs(row.value)), Math.abs(equity), 1);
  const baseCapital = Math.max(withdrawable, 0) + Math.max(totalMargin, 0);
  const withdrawableRatio = baseCapital > 0 ? Math.max(withdrawable, 0) / baseCapital : 0;
  const marginRatio = baseCapital > 0 ? Math.max(totalMargin, 0) / baseCapital : 0;
  const marginUsage = equity > 0 ? totalMargin / equity : 0;

  return (
    <div className="chart-section equity-breakdown-section">
      <div className="section-header compact">
        <h2 className="section-title">权益拆分</h2>
        <span className="section-meta">{currentAccount === 'all' ? '多账户汇总' : '当前账户'}</span>
      </div>

      <div className="equity-breakdown-head">
        <span className="text-secondary">账户权益</span>
        <strong className="mono">{formatDisplayMoney(equity)}</strong>
      </div>

      <div className="equity-stack" aria-label="可提款余额和保证金占用占比">
        {withdrawableRatio > 0 && (
          <span
            className="equity-stack-segment equity-stack-withdrawable"
            style={{ width: `${Math.max(withdrawableRatio * 100, 2)}%` }}
          />
        )}
        {marginRatio > 0 && (
          <span
            className="equity-stack-segment equity-stack-margin"
            style={{ width: `${Math.max(marginRatio * 100, 2)}%` }}
          />
        )}
      </div>

      <div className="equity-stack-legend">
        <span><i className="equity-dot equity-dot-withdrawable" />可提款 {formatDisplayMoney(withdrawable)}</span>
        <span><i className="equity-dot equity-dot-margin" />保证金 {formatDisplayMoney(totalMargin)} · {PERCENT.format(Math.max(marginUsage, 0))}</span>
      </div>

      <div className="equity-breakdown-rows">
        {rows.map((row) => {
          const width = Math.max((Math.abs(row.value) / maxAbsValue) * 100, row.value === 0 ? 0 : 3);
          return (
            <div key={row.label} className="equity-breakdown-row">
              <div className="equity-breakdown-row-head">
                <span>{row.label}</span>
                <strong className={`mono ${row.tone}`}>{row.value > 0 && row.tone !== 'neutral' ? '+' : ''}{formatDisplayMoney(row.value)}</strong>
              </div>
              <div className="equity-breakdown-track">
                <span
                  className="equity-breakdown-bar"
                  style={{
                    width: `${width}%`,
                    marginLeft: row.value < 0 ? 'auto' : undefined,
                    background: row.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
