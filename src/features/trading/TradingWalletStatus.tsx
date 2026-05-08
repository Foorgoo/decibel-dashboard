import { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useDashboardStore } from '../../store';
import { normalizeAddress } from '../../utils/dashboardData';
import { useDetectedWalletAddress } from './walletAccount';
import { isSubaccountDelegated } from './session';
import { TRADING_AUTH_STATE_EVENT, openTradingAuthorization } from './events';
import { markWalletConnectIntent, pickPreferredWallet } from './wallets';

const formatAddress = (address?: string) => {
  if (!address) return '-';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export function TradingWalletStatus() {
  const { account, connected, connect, isLoading, wallet, wallets } = useWallet();
  const { accounts, addAccount, currentAccount, setCurrentAccount, subaccounts } = useDashboardStore();
  const [connecting, setConnecting] = useState(false);
  const [authStateVersion, setAuthStateVersion] = useState(0);
  const connectTimeoutRef = useRef<number | null>(null);
  const detectedAddress = useDetectedWalletAddress(connected, wallet, account);
  const ownerAddress = connected && detectedAddress ? detectedAddress : null;
  const connectedOwnerKnown = Boolean(
    ownerAddress && accounts.some((item) => normalizeAddress(item.address) === normalizeAddress(ownerAddress)),
  );
  const preferredWallet = pickPreferredWallet(wallets);
  const connectLabel = '连接钱包';
  const isMultiAccountMode = currentAccount === 'all';

  const selectedOwners = useMemo(() => {
    if (currentAccount === 'all') return accounts.map((item) => item.address);
    return currentAccount ? [currentAccount] : [];
  }, [accounts, currentAccount]);

  const selectedOwnerStats = useMemo(() => selectedOwners.map((owner) => {
    const ownerSubaccounts = subaccounts.filter((item) => (
      item.owner && normalizeAddress(item.owner) === normalizeAddress(owner)
    ));
    const delegatedCount = ownerSubaccounts.filter((item) => isSubaccountDelegated(item.address, owner)).length;
    return {
      owner,
      total: ownerSubaccounts.length,
      delegated: delegatedCount,
      ready: ownerSubaccounts.length > 0 && delegatedCount === ownerSubaccounts.length,
    };
  }), [authStateVersion, selectedOwners, subaccounts]);

  const selectedAccountLabel = currentAccount === 'all'
    ? '多账户'
    : accounts.find((item) => currentAccount && normalizeAddress(item.address) === normalizeAddress(currentAccount))?.name
      || formatAddress(currentAccount || (connectedOwnerKnown ? ownerAddress || '' : ''));
  const totalSubaccounts = selectedOwnerStats.reduce((sum, item) => sum + item.total, 0);
  const delegatedSubaccounts = selectedOwnerStats.reduce((sum, item) => sum + item.delegated, 0);
  const readyOwners = selectedOwnerStats.filter((item) => item.ready).length;
  const ownerMismatch = Boolean(
    connectedOwnerKnown
      && currentAccount
      && currentAccount !== 'all'
      && ownerAddress
      && normalizeAddress(ownerAddress) !== normalizeAddress(currentAccount),
  );

  useEffect(() => {
    const handleAuthStateChange = () => setAuthStateVersion((value) => value + 1);
    window.addEventListener(TRADING_AUTH_STATE_EVENT, handleAuthStateChange);
    return () => window.removeEventListener(TRADING_AUTH_STATE_EVENT, handleAuthStateChange);
  }, []);

  void authStateVersion;

  useEffect(() => {
    if (connected || !isLoading) {
      setConnecting(false);
    }
  }, [connected, isLoading]);

  useEffect(() => () => {
    if (connectTimeoutRef.current) {
      window.clearTimeout(connectTimeoutRef.current);
    }
  }, []);

  const handleConnect = async () => {
    if (ownerAddress && connectedOwnerKnown && !currentAccount) {
      setCurrentAccount(ownerAddress);
      return;
    }
    if (connected && ownerAddress && !connectedOwnerKnown) {
      addAccount({ address: ownerAddress, name: '连接钱包' });
      setCurrentAccount(ownerAddress);
      return;
    }
    if (!preferredWallet?.name) {
      openTradingAuthorization();
      return;
    }
    setConnecting(true);
    try {
      markWalletConnectIntent();
      connect(preferredWallet.name);
      if (connectTimeoutRef.current) {
        window.clearTimeout(connectTimeoutRef.current);
      }
      connectTimeoutRef.current = window.setTimeout(() => {
        setConnecting(false);
      }, 12000);
    } catch {
      setConnecting(false);
    }
  };

  let statusLabel = connectedOwnerKnown ? '未选择账户' : '未连接';
  let statusTone: 'muted' | 'warning' | 'success' = 'muted';
  let handleStatusClick = openTradingAuthorization;
  if (!currentAccount && connectedOwnerKnown && ownerAddress) {
    handleStatusClick = () => setCurrentAccount(ownerAddress);
  }

  if (selectedOwners.length === 0) {
    statusLabel = connectedOwnerKnown ? '未选择账户' : '连接钱包';
  } else if (totalSubaccounts === 0) {
    statusLabel = '等待账户数据';
    statusTone = 'warning';
  } else if (currentAccount === 'all') {
    statusLabel = readyOwners === selectedOwnerStats.length
      ? `可交易 ${readyOwners}/${selectedOwnerStats.length}`
      : `授权 ${readyOwners}/${selectedOwnerStats.length}`;
    statusTone = readyOwners === selectedOwnerStats.length ? 'success' : 'warning';
  } else if (delegatedSubaccounts < totalSubaccounts) {
    statusLabel = ownerMismatch ? `需切换钱包 · ${delegatedSubaccounts}/${totalSubaccounts}` : `授权 ${delegatedSubaccounts}/${totalSubaccounts}`;
    statusTone = 'warning';
  } else {
    statusLabel = '可交易';
    statusTone = 'success';
  }
  const showStatusReminder = statusTone !== 'success';

  const handleToggleAccountMode = () => {
    if (isMultiAccountMode) {
      if (ownerAddress && connectedOwnerKnown) {
        setCurrentAccount(ownerAddress);
      } else {
        setCurrentAccount(null);
        openTradingAuthorization();
      }
      return;
    }
    setCurrentAccount('all');
  };

  return (
    <div className="trading-wallet-status">
      <button
        className={`trading-account-pill ${statusTone}`}
        onClick={selectedOwners.length > 0 || connectedOwnerKnown ? handleStatusClick : handleConnect}
        disabled={connecting}
        title="查看账户状态"
      >
        <span className="trading-account-dot" aria-hidden="true" />
        <span className="trading-wallet-name">
          {connecting ? '连接中...' : selectedOwners.length > 0 ? selectedAccountLabel : connectLabel}
        </span>
        {!isMultiAccountMode && connectedOwnerKnown && (
          <strong className="trading-wallet-address">
            {wallet?.name || 'Wallet'} · {formatAddress(ownerAddress || '')}
          </strong>
        )}
        {showStatusReminder && <span className="trading-account-state">{statusLabel}</span>}
      </button>
      <div className="account-mode-segmented" aria-label="账户模式">
        <button
          type="button"
          className={!isMultiAccountMode ? 'active' : ''}
          onClick={() => {
            if (isMultiAccountMode) handleToggleAccountMode();
          }}
          aria-pressed={!isMultiAccountMode}
        >
          单账户
        </button>
        <button
          type="button"
          className={isMultiAccountMode ? 'active' : ''}
          onClick={() => {
            if (!isMultiAccountMode) handleToggleAccountMode();
          }}
          aria-pressed={isMultiAccountMode}
        >
          多账户
        </button>
      </div>
    </div>
  );
}
