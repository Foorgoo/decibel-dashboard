import { useDashboardStore } from '../store';
import { formatDisplayAmp, formatDisplayMoney, formatDisplaySignedMoney } from '../utils/displayFormat';

const PERCENT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function AccountStats() {
  const { account, amps, ampsDailyDelta, ampsRank, volume30d, currentAccount } = useDashboardStore();
  
  if (!account) return null;
  
  const equity = Number(account.perp_equity_balance || 0);
  const realizedPnl = Number(account.realized_pnl || 0);
  const unrealizedPnl = Number(account.unrealized_pnl || 0);
  const totalPnl = realizedPnl + unrealizedPnl;
  const marginRatio = Number(account.cross_margin_ratio || 0);
  const marginDeficit = Number(account.margin_deficit || 0);
  const liquidationFeesPaid = Number(account.liquidation_fees_paid || 0);
  const marginRatioLabel = currentAccount === 'all' ? '最高保证金率' : '保证金率';
  const avgDailyVolume = volume30d !== null ? volume30d / 30 : null;
  
  return (
    <div className="stats-grid">
      <div className="stat-card stat-card-equity">
        <div className="stat-label">账户权益</div>
        <div className="stat-value mono">{formatDisplayMoney(equity)}</div>
        <div className="stat-change text-secondary">
          已实现盈亏:{' '}
          <span className={realizedPnl === 0 ? '' : realizedPnl > 0 ? 'positive' : 'negative'}>
            {formatDisplaySignedMoney(realizedPnl)}
          </span>
        </div>
      </div>
      
      <div className="stat-card stat-card-pnl">
        <div className="stat-label">总盈亏</div>
        <div className={`stat-value mono ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
          {formatDisplaySignedMoney(totalPnl)}
        </div>
        <div className="stat-change text-secondary">
          未实现:{' '}
          <span className={unrealizedPnl === 0 ? '' : unrealizedPnl > 0 ? 'positive' : 'negative'}>
            {formatDisplaySignedMoney(unrealizedPnl)}
          </span>
        </div>
      </div>
      
      <div className="stat-card stat-card-risk">
        <div className="stat-label">{marginRatioLabel}</div>
        <div className={`stat-value mono ${marginDeficit > 0 ? 'negative' : ''}`}>
          {PERCENT.format(marginRatio)}
        </div>
        <div className="stat-change text-secondary">
          缺口:{' '}
          <span className={marginDeficit > 0 ? 'negative' : ''}>{formatDisplayMoney(marginDeficit)}</span>
          {' '}| 清算费:{' '}
          <span className={liquidationFeesPaid > 0 ? 'negative' : ''}>
            {formatDisplayMoney(liquidationFeesPaid)}
          </span>
        </div>
      </div>
      
      <div className="stat-card stat-card-volume">
        <div className="stat-label">30天交易量</div>
        <div className="stat-value mono">
          {volume30d !== null ? formatDisplayMoney(volume30d) : '-'}
        </div>
        <div className="stat-change text-secondary">
          日均: {avgDailyVolume !== null ? formatDisplayMoney(avgDailyVolume) : '-'}
        </div>
      </div>

      <div className="stat-card stat-card-amp">
        <div className="stat-label">AMP 积分</div>
        {amps !== null ? (
          <>
            <div className="amp-main-row">
              <span className="stat-value mono amp-value">
                {formatDisplayAmp(amps)}
              </span>
              {ampsRank && (
                <span className="amp-rank text-secondary">
                  #{ampsRank}
                </span>
              )}
            </div>
            {ampsDailyDelta !== null && (
              <div className="stat-change positive">
                今日新增: +{formatDisplayAmp(Math.max(0, ampsDailyDelta))}
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
