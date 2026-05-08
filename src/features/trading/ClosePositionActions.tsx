import { useState } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useDashboardStore } from '../../store';
import { ClosePositionDialog } from './ClosePositionDialog';
import { isSubaccountDelegated } from './session';
import type { CloseOrderMode } from './types';
import { notifyTradingToast, openTradingAuthorization, openTradingConfig } from './events';
import { useDetectedWalletAddress } from './walletAccount';
import { normalizeAddress } from '../../utils/dashboardData';

interface ClosePositionActionsProps {
  position: any;
}

export function ClosePositionActions({ position }: ClosePositionActionsProps) {
  const { account: walletAccount, connected, wallet } = useWallet();
  const detectedWalletAddress = useDetectedWalletAddress(connected, wallet, walletAccount);
  const { apiKey, currentAccount, gasStationApiKey, gasStationEnabled } = useDashboardStore();
  const [mode, setMode] = useState<CloseOrderMode | null>(null);
  const owner = String(position.owner || '');
  const subaccount = String(position.subaccount || '');
  const effectiveGasStationKey = gasStationEnabled ? (gasStationApiKey || apiKey) : '';
  const delegated = isSubaccountDelegated(subaccount, owner);
  const walletMatchesOwner = Boolean(
    !gasStationEnabled
      && owner
      && detectedWalletAddress
      && normalizeAddress(owner) === normalizeAddress(detectedWalletAddress),
  );

  if (gasStationEnabled && !effectiveGasStationKey) {
    return (
      <div className="position-close-actions">
        <button className="position-close-btn setup" onClick={openTradingConfig}>
          配置 Gas
        </button>
      </div>
    );
  }

  if (!delegated) {
    const handleAuthClick = () => {
      if (currentAccount === 'all') {
        notifyTradingToast({
          type: 'warning',
          title: '多账户模式无法直接授权',
          message: '请切到单账户并连接对应 Owner 钱包后授权',
        });
        return;
      }
      openTradingAuthorization();
    };

    return (
      <div className="position-close-actions">
        <button className="position-close-btn auth" onClick={handleAuthClick}>
          {currentAccount === 'all' ? '需授权交易' : '授权交易'}
        </button>
      </div>
    );
  }

  if (!gasStationEnabled && !walletMatchesOwner) {
    const handleOwnerMismatchClick = () => {
      notifyTradingToast({
        type: 'warning',
        title: '请连接当前 Owner 钱包',
        message: 'Owner 付 gas 模式需要连接当前 Owner 钱包',
      });
    };

    return (
      <div className="position-close-actions">
        <button className="position-close-btn setup" onClick={handleOwnerMismatchClick}>
          连接 Owner
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="position-close-actions">
        <button className="position-close-btn limit" onClick={() => setMode('limit')}>
          限价
        </button>
        <button className="position-close-btn market" onClick={() => setMode('market')}>
          市价
        </button>
      </div>
      {mode && (
        <ClosePositionDialog
          mode={mode}
          position={position}
          onClose={() => setMode(null)}
        />
      )}
    </>
  );
}
