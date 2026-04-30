import { useDashboardStore } from '../store';

const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PERCENT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const AMP_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

export function AccountStats() {
  const { account, amps, ampsDailyDelta, ampsRank, volume30d, currentAccount } = useDashboardStore();
  
  if (!account) return null;
  
  const equity = Number(account.perp_equity_balance || 0);
  const realizedPnl = Number(account.realized_pnl || 0);
  const unrealizedPnl = Number(account.unrealized_pnl || 0);
  const totalPnl = realizedPnl + unrealizedPnl;
  const marginRatio = Number(account.cross_margin_ratio || 0);
  const withdrawable = Number(account.usdc_cross_withdrawable_balance || 0);
  const totalMargin = Number(account.total_margin || 0);
  const fundingCost = Number(account.unrealized_funding_cost || 0);
  const marginRatioLabel = currentAccount === 'all' ? '最高保证金率' : '保证金率';
  
  return (
    <div className="stats-grid">
      <div className="stat-card stat-card-equity">
        <div className="stat-label">账户权益</div>
        <div className="stat-value mono">{CURRENCY.format(equity)}</div>
        <div className="stat-change text-secondary">
          总保证金: {CURRENCY.format(totalMargin)} | 可提款: {CURRENCY.format(withdrawable)}
        </div>
      </div>
      
      <div className="stat-card stat-card-pnl">
        <div className="stat-label">总盈亏</div>
        <div className={`stat-value mono ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
          {totalPnl >= 0 ? '+' : ''}{CURRENCY.format(totalPnl)}
        </div>
      </div>
      
      <div className="stat-card stat-card-risk">
        <div className="stat-label">未实现盈亏</div>
        <div className={`stat-value mono ${unrealizedPnl >= 0 ? 'positive' : 'negative'}`}>
          {unrealizedPnl >= 0 ? '+' : ''}{CURRENCY.format(unrealizedPnl)}
        </div>
        <div className="stat-change text-secondary">
          {marginRatioLabel}: {PERCENT.format(marginRatio)} | 资金费: {CURRENCY.format(fundingCost)}
        </div>
      </div>
      
      <div className="stat-card stat-card-volume">
        <div className="stat-label">30天交易量</div>
        <div className="stat-value mono">
          {volume30d !== null ? CURRENCY.format(volume30d) : '-'}
        </div>
      </div>

      <div className="stat-card stat-card-amp">
        <div className="stat-label">AMP 积分</div>
        {amps !== null ? (
          <>
            <div className="amp-main-row">
              <span className="stat-value mono amp-value">
                {AMP_FORMAT.format(amps)}
              </span>
              {ampsRank && (
                <span className="amp-rank text-secondary">
                  #{ampsRank}
                </span>
              )}
            </div>
            {ampsDailyDelta !== null && (
              <div className={`stat-change ${ampsDailyDelta >= 0 ? 'positive' : 'negative'}`}>
                今日新增: {ampsDailyDelta >= 0 ? '+' : ''}{AMP_FORMAT.format(ampsDailyDelta)}
              </div>
            )}
          </>
        ) : (
          <div className="stat-value mono text-secondary" style={{ fontSize: '14px' }}>
            未获取到 (请检查 API Key)
          </div>
        )}
      </div>
    </div>
  );
}
