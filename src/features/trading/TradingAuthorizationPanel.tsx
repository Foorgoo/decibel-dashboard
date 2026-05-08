import { useEffect, useMemo, useState } from 'react';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { MAINNET_CONFIG } from '@decibeltrade/sdk';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useDashboardStore } from '../../store';
import {
  clearTradingSession,
  formatExpiration,
  getDefaultSessionExpirationSecs,
  getOrCreateTradingSession,
  loadDelegations,
  loadTradingSession,
  saveDelegation,
} from './session';
import { normalizeAddress } from '../../utils/dashboardData';
import { notifyTradingAuthStateChanged } from './events';
import { useDetectedWalletAddress } from './walletAccount';
import { markWalletConnectIntent, pickPreferredWallet } from './wallets';

const formatAddress = (address?: string) => {
  if (!address) return '-';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

interface TradingAuthorizationPanelProps {
  onClose?: () => void;
}

export function TradingAuthorizationPanel({ onClose }: TradingAuthorizationPanelProps) {
  const { accounts, apiKey, currentAccount, setCurrentAccount, subaccounts } = useDashboardStore();
  const {
    account,
    connected,
    connect,
    disconnect,
    signAndSubmitTransaction,
    wallets,
    wallet,
  } = useWallet();

  const [session, setSession] = useState(loadTradingSession());
  const [delegations, setDelegations] = useState(loadDelegations());
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [authorizing, setAuthorizing] = useState(false);
  const detectedAddress = useDetectedWalletAddress(connected, wallet, account);
  const ownerAddress = connected && detectedAddress ? detectedAddress : null;
  const nowSecs = Math.floor(Date.now() / 1000);
  const selectedOwner = currentAccount && currentAccount !== 'all' ? currentAccount : null;
  const isMultiAccountMode = currentAccount === 'all';
  const pageOwners = currentAccount === 'all'
    ? accounts.map((item) => item.address)
    : selectedOwner
      ? [selectedOwner]
      : ownerAddress
        ? [ownerAddress]
        : [];
  const selectedOwnerName = selectedOwner
    ? accounts.find((item) => normalizeAddress(item.address) === normalizeAddress(selectedOwner))?.name || formatAddress(selectedOwner)
    : currentAccount === 'all'
      ? '多账户'
      : '-';
  const walletMatchesSelectedOwner = Boolean(
    selectedOwner
      && ownerAddress
      && normalizeAddress(selectedOwner) === normalizeAddress(ownerAddress),
  );
  const walletMismatchSelectedOwner = Boolean(selectedOwner && ownerAddress && !walletMatchesSelectedOwner);

  const detectedWallets = wallets.filter((item) => item.readyState === 'Installed');
  const tradableSubaccounts = useMemo(() => (
    subaccounts.filter((item) => (
      item.address
        && item.owner
        && item.owner !== 'unknown'
        && ownerAddress
        && normalizeAddress(item.owner) === normalizeAddress(ownerAddress)
    ))
  ), [ownerAddress, subaccounts]);
  const delegatedCount = tradableSubaccounts.filter((item) => (
    delegations[item.address.toLowerCase()]?.sessionAddress.toLowerCase() === session?.address.toLowerCase()
      && delegations[item.address.toLowerCase()]?.expiresAtSecs > nowSecs
      && session
      && session.expiresAtSecs > nowSecs
  )).length;
  const allSubaccountsDelegated = tradableSubaccounts.length > 0 && delegatedCount === tradableSubaccounts.length;
  const hasExpiredConnectedSession = Boolean(session && session.expiresAtSecs <= nowSecs);

  const pageOwnerStats = pageOwners.map((owner) => {
    const ownerSession = ownerAddress && normalizeAddress(owner) === normalizeAddress(ownerAddress)
      ? session
      : loadTradingSession(owner);
    const ownerDelegations = ownerAddress && normalizeAddress(owner) === normalizeAddress(ownerAddress)
      ? delegations
      : loadDelegations(owner);
    const ownerSubaccounts = subaccounts.filter((item) => (
      item.owner && normalizeAddress(item.owner) === normalizeAddress(owner)
    ));
    const activeDelegationExpirations: number[] = [];
    let expiredDelegatedCount = 0;
    const ownerDelegatedCount = ownerSubaccounts.filter((item) => {
      const delegation = ownerDelegations[item.address.toLowerCase()];
      const matchesSession = Boolean(
        ownerSession
          && delegation
          && delegation.sessionAddress.toLowerCase() === ownerSession.address.toLowerCase(),
      );
      if (matchesSession && delegation && ownerSession && (delegation.expiresAtSecs <= nowSecs || ownerSession.expiresAtSecs <= nowSecs)) {
        expiredDelegatedCount += 1;
      }
      const active = Boolean(
        matchesSession
          && delegation
          && ownerSession
          && delegation.expiresAtSecs > nowSecs
          && ownerSession.expiresAtSecs > nowSecs,
      );
      if (active && delegation) {
        activeDelegationExpirations.push(delegation.expiresAtSecs);
      }
      return active;
    }).length;

    return {
      owner,
      session: ownerSession,
      delegatedExpiresAtSecs: activeDelegationExpirations.length > 0
        ? Math.min(...activeDelegationExpirations)
        : null,
      subaccounts: ownerSubaccounts,
      delegated: ownerDelegatedCount,
      expiredDelegated: expiredDelegatedCount,
      ready: ownerSubaccounts.length > 0 && ownerDelegatedCount === ownerSubaccounts.length,
    };
  });
  const pageTotalSubaccounts = pageOwnerStats.reduce((sum, item) => sum + item.subaccounts.length, 0);
  const pageDelegatedCount = pageOwnerStats.reduce((sum, item) => sum + item.delegated, 0);
  const pageReadyOwners = pageOwnerStats.filter((item) => item.ready).length;
  const pagePrimarySession = selectedOwner ? pageOwnerStats[0]?.session : null;
  const pagePrimaryDelegated = selectedOwner ? pageOwnerStats[0]?.delegated || 0 : 0;
  const pagePrimaryExpiredDelegated = selectedOwner ? pageOwnerStats[0]?.expiredDelegated || 0 : 0;
  const pagePrimaryDelegatedExpiresAtSecs = selectedOwner ? pageOwnerStats[0]?.delegatedExpiresAtSecs : null;
  const pageSessionExpired = Boolean(pagePrimarySession && pagePrimarySession.expiresAtSecs <= nowSecs);
  const pageAuthorizationExpired = pageSessionExpired || pagePrimaryExpiredDelegated > 0;
  const selectedOwnerReady = selectedOwner
    ? Boolean(pageOwnerStats[0]?.ready)
    : pageOwners.length > 0 && pageReadyOwners === pageOwners.length;
  const readyToTrade = selectedOwnerReady;
  const visibleSubaccounts = tradableSubaccounts.slice(0, 8);
  const hiddenSubaccountCount = Math.max(0, tradableSubaccounts.length - visibleSubaccounts.length);
  const visibleOwnerStats = pageOwnerStats.slice(0, 10);
  const hiddenOwnerCount = Math.max(0, pageOwnerStats.length - visibleOwnerStats.length);

  let statusTone: 'success' | 'warning' | 'muted' = 'muted';
  let statusTitle = '未连接钱包';
  let statusText = '连接 owner 钱包后，可为该主账户下的子账户授权交易。';

  if (isMultiAccountMode) {
    statusTone = pageReadyOwners > 0 ? 'success' : 'muted';
    statusTitle = '多账户模式';
    statusText = pageOwners.length > 0
      ? `正在按设置中的 ${pageOwners.length} 个 owner 汇总展示数据；授权需切到单账户模式。`
      : '多账户模式会读取设置中手动添加的 owner，请先在设置中添加账户。';
  } else if (pageOwners.length === 0) {
    statusTitle = '未选择账户';
    statusText = '请选择页面账户，或连接钱包后自动加入 owner 钱包。';
  } else if (pageTotalSubaccounts === 0) {
    statusTone = 'warning';
    statusTitle = '等待账户数据';
    statusText = '当前页面账户下暂未读取到可授权子账户，请刷新账户数据后再试。';
  } else if (!readyToTrade) {
    statusTone = 'warning';
    statusTitle = pageAuthorizationExpired ? '页面账户授权已过期' : '页面账户需要授权';
    statusText = currentAccount === 'all'
      ? `已有 ${pageReadyOwners}/${pageOwners.length} 个 owner 可交易，未授权账户需要连接对应 owner 钱包后授权。`
      : pageAuthorizationExpired
        ? 'Session 或子账户授权已过期，请重新授权后继续交易。'
        : `已授权 ${pageDelegatedCount}/${pageTotalSubaccounts} 个子账户；如需新增授权，请连接该 owner 钱包。`;
  } else {
    statusTone = 'success';
    statusTitle = currentAccount === 'all' ? '多账户均可交易' : '当前单账户可交易';
    statusText = 'Gas Station、Session Key 和子账户授权均已就绪，表格操作可直接使用。';
  }

  const handleConnect = async (walletName?: string) => {
    const name = walletName || pickPreferredWallet(wallets)?.name;
    if (!name) {
      setMessage({ type: 'error', text: '未检测到可用 Aptos 钱包，请先安装 Petra / Nightly / OKX 等钱包' });
      return;
    }
    try {
      markWalletConnectIntent();
      await connect(name);
      setMessage({ type: 'success', text: `已连接 ${name}` });
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || '连接钱包失败' });
    }
  };

  const reloadOwnerSessionState = (owner?: string | null) => {
    setSession(loadTradingSession(owner));
    setDelegations(loadDelegations(owner));
  };

  useEffect(() => {
    reloadOwnerSessionState(ownerAddress);
  }, [ownerAddress]);

  const handleAuthorize = async () => {
    if (!connected || !ownerAddress) {
      setMessage({ type: 'error', text: '请先连接钱包' });
      return;
    }
    const connectedOwner = ownerAddress;
    if (tradableSubaccounts.length === 0) {
      setMessage({ type: 'error', text: '当前连接钱包下没有可授权的子账户，请先确认已刷新并选择正确 owner 钱包' });
      return;
    }

    const expiresAtSecs = getDefaultSessionExpirationSecs();
    const nextSession = getOrCreateTradingSession(expiresAtSecs, connectedOwner);
    setSession(nextSession);
    setAuthorizing(true);
    setMessage({ type: 'warning', text: '请在钱包中逐个确认子账户交易授权' });

    try {
      const aptos = new Aptos(new AptosConfig({
        network: Network.MAINNET,
        fullnode: MAINNET_CONFIG.fullnodeUrl,
        clientConfig: apiKey ? { API_KEY: apiKey } : undefined,
      }));

      for (const subaccount of tradableSubaccounts) {
        const result = await signAndSubmitTransaction({
          data: {
            function: `${MAINNET_CONFIG.deployment.package}::dex_accounts_entry::delegate_trading_to_for_subaccount`,
            typeArguments: [],
            functionArguments: [subaccount.address, nextSession.address, expiresAtSecs],
          },
        });

        const hash = 'hash' in result ? result.hash : undefined;
        if (hash) {
          await aptos.waitForTransaction({ transactionHash: hash });
        }

        const nextDelegations = saveDelegation({
          subaccount: subaccount.address,
          sessionAddress: nextSession.address,
          expiresAtSecs,
          txHash: hash,
          updatedAt: new Date().toISOString(),
        }, connectedOwner);
        setDelegations(nextDelegations);
        notifyTradingAuthStateChanged();
      }

      setMessage({ type: 'success', text: `已授权 ${tradableSubaccounts.length} 个子账户，有效期至 ${formatExpiration(expiresAtSecs)}` });
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || '授权失败' });
    } finally {
      setAuthorizing(false);
    }
  };

  const handleClearSession = () => {
    clearTradingSession(ownerAddress);
    setSession(null);
    setDelegations({});
    notifyTradingAuthStateChanged();
    setMessage({ type: 'warning', text: '已清除当前 owner 的本地 session key 和授权记录。链上授权如需撤销，后续会接入 revoke。' });
  };

  const handleDisconnect = () => {
    disconnect();
    notifyTradingAuthStateChanged();
    setMessage({ type: 'warning', text: '已断开钱包连接' });
  };

  const handleReturnToTradingAccount = () => {
    if (ownerAddress) {
      setCurrentAccount(ownerAddress);
      onClose?.();
      return;
    }
    handleConnect();
  };

  return (
    <div className="trading-auth-panel">
      {message && <div className={`settings-message ${message.type}`}>{message.text}</div>}

      <div className={`trade-account-status ${statusTone}`}>
        <div className="trade-account-status-main">
          <span className="trade-account-status-dot" aria-hidden="true" />
          <div>
            <strong>{statusTitle}</strong>
            <p>{statusText}</p>
          </div>
        </div>
        <span className="trade-account-status-badge">
          {isMultiAccountMode ? 'Multi' : readyToTrade ? 'Ready' : 'Action Required'}
        </span>
      </div>

      {isMultiAccountMode ? (
        <>
          <div className="trade-account-metric-grid">
            <div className="trade-account-metric">
              <span>多账户</span>
              <strong>{pageOwners.length}</strong>
            </div>
            <div className="trade-account-metric">
              <span>可交易 owner</span>
              <strong className={pageReadyOwners > 0 ? 'positive' : undefined}>{pageReadyOwners}</strong>
            </div>
            <div className="trade-account-metric">
              <span>子账户授权</span>
              <strong>{pageDelegatedCount}/{pageTotalSubaccounts}</strong>
            </div>
          </div>

          <section className="trade-account-card">
            <div className="trade-account-card-title">
              <span>多账户授权概览</span>
              <strong>{pageReadyOwners}/{pageOwners.length}</strong>
            </div>
            {visibleOwnerStats.length > 0 ? (
              <div className="trade-observe-owner-list">
                {visibleOwnerStats.map((ownerStat) => {
                  const ownerMeta = accounts.find((item) => normalizeAddress(item.address) === normalizeAddress(ownerStat.owner));
                  return (
                    <div key={ownerStat.owner} className="trade-observe-owner-row">
                      <div>
                        <strong>{ownerMeta?.name || 'Owner'}</strong>
                        <span className="mono">{formatAddress(ownerStat.owner)}</span>
                      </div>
                      <span>{ownerStat.delegated}/{ownerStat.subaccounts.length}</span>
                      <span className={`trade-auth-chip ${ownerStat.ready ? 'success' : 'warning'}`}>
                        {ownerStat.ready ? '可交易' : '需授权'}
                      </span>
                    </div>
                  );
                })}
                {hiddenOwnerCount > 0 && (
                  <div className="trade-subaccount-more">还有 {hiddenOwnerCount} 个 owner 未展示</div>
                )}
              </div>
            ) : (
              <div className="trade-account-empty">暂无多账户 owner，请先到设置中添加。</div>
            )}
          </section>

          <div className="trade-account-note">多账户模式汇总设置中的 owner；更新授权需切到对应单账户。</div>
        </>
      ) : (
        <>
          <section className="trade-account-card trade-compact-card">
            <div className="trade-account-compact-row">
              <span>账户</span>
              <strong>{selectedOwnerName}</strong>
              <span className="trade-address-pill mono">{selectedOwner ? formatAddress(selectedOwner) : ownerAddress ? formatAddress(ownerAddress) : '-'}</span>
              <span className={`trade-auth-chip ${readyToTrade ? 'success' : 'warning'}`}>
                子账户 {selectedOwner && !walletMatchesSelectedOwner ? `${pageDelegatedCount}/${pageTotalSubaccounts}` : `${delegatedCount}/${tradableSubaccounts.length}`}
              </span>
            </div>
            {walletMismatchSelectedOwner && (
              <div className="trade-account-note warning">
                当前连接钱包不是该 owner，更新授权需切换钱包。
              </div>
            )}
          </section>

          <section className="trade-account-card">
            <div className="trade-account-card-title">
              <span>子账户授权</span>
              <strong>{selectedOwner && !walletMatchesSelectedOwner ? `${pageDelegatedCount} / ${pageTotalSubaccounts}` : `${delegatedCount} / ${tradableSubaccounts.length}`}</strong>
            </div>
            {selectedOwner && !walletMatchesSelectedOwner ? (
              <div className="trade-account-empty">连接该 owner 钱包后，可更新子账户授权；已有授权仍可用于表格交易操作。</div>
            ) : visibleSubaccounts.length > 0 ? (
              <div className="trade-subaccount-auth-list">
                {visibleSubaccounts.map((subaccount) => {
                  const delegation = delegations[subaccount.address.toLowerCase()];
                  const matchesSession = Boolean(
                    session
                      && delegation
                      && delegation.sessionAddress.toLowerCase() === session.address.toLowerCase(),
                  );
                  const expired = Boolean(
                    matchesSession
                      && delegation
                      && session
                      && (delegation.expiresAtSecs <= nowSecs || session.expiresAtSecs <= nowSecs),
                  );
                  const delegated = Boolean(
                    matchesSession
                      && delegation
                      && session
                      && delegation.expiresAtSecs > nowSecs
                      && session.expiresAtSecs > nowSecs,
                  );

                  return (
                    <div key={subaccount.address} className="trade-subaccount-auth-row">
                      <div>
                        <strong>{subaccount.alias || subaccount.ownerName || subaccount.address.slice(0, 6)}</strong>
                        <span className="mono">{formatAddress(subaccount.address)}</span>
                      </div>
                      <span className={`trade-auth-chip ${delegated ? 'success' : 'warning'}`}>
                        {delegated ? '已授权' : expired ? '已过期' : '待授权'}
                      </span>
                    </div>
                  );
                })}
                {hiddenSubaccountCount > 0 && (
                  <div className="trade-subaccount-more">还有 {hiddenSubaccountCount} 个子账户，授权时会一并处理</div>
                )}
              </div>
            ) : (
              <div className="trade-account-empty">暂无可授权子账户</div>
            )}
            <div className="trade-session-inline">
              <span>Session</span>
              <strong className={pagePrimaryDelegated > 0 ? 'positive' : 'warning'}>
                {pagePrimarySession ? pageAuthorizationExpired ? '已过期' : pagePrimaryDelegated > 0 ? '已授权' : '待授权' : '未生成'}
              </strong>
              <span className="trade-address-pill mono">{pagePrimarySession ? formatAddress(pagePrimarySession.address) : '-'}</span>
              <span>{pagePrimaryDelegatedExpiresAtSecs ? formatExpiration(pagePrimaryDelegatedExpiresAtSecs) : '-'}</span>
            </div>
          </section>
        </>
      )}

      <div className="trade-account-actions">
        {isMultiAccountMode ? (
          connected ? (
            <button className="btn btn-primary btn-small" onClick={handleReturnToTradingAccount}>
              切单账户
            </button>
          ) : null
        ) : connected ? (
          walletMismatchSelectedOwner ? (
            <button className="btn btn-primary btn-small" onClick={handleDisconnect}>
              切换钱包授权
            </button>
          ) : (
            <button
              className="btn btn-primary btn-small"
              onClick={handleAuthorize}
              disabled={authorizing || tradableSubaccounts.length === 0}
            >
              {authorizing ? '授权中...' : hasExpiredConnectedSession || pageAuthorizationExpired ? '重新授权' : allSubaccountsDelegated ? '更新授权' : '授权交易'}
            </button>
          )
        ) : (
          <button className="btn btn-primary btn-small" onClick={() => handleConnect()}>
            连接钱包
          </button>
        )}
        {connected && <button className="btn btn-secondary btn-small" onClick={handleDisconnect}>断开钱包</button>}
        {!isMultiAccountMode && session && (
          <button className="btn btn-secondary btn-small btn-danger-text" onClick={handleClearSession}>
            清除授权
          </button>
        )}
      </div>

      {!isMultiAccountMode && !connected && detectedWallets.length > 1 && (
        <div className="wallet-quick-list">
          {detectedWallets.map((item) => (
            <button key={item.name} className="wallet-chip" onClick={() => handleConnect(item.name)}>
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
