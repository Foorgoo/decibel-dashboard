import { AptosWalletAdapterProvider, useWallet } from '@aptos-labs/wallet-adapter-react';
import { Network } from '@aptos-labs/ts-sdk';
import { useEffect, useRef } from 'react';
import App from '../../App';
import { useDashboardStore } from '../../store';
import { normalizeAddress } from '../../utils/dashboardData';
import { useDetectedWalletAddress } from './walletAccount';
import { consumeWalletConnectIntent } from './wallets';

const localApiKey = typeof window !== 'undefined'
  ? localStorage.getItem('decibel_api_key_mainnet') || undefined
  : undefined;

function WalletOwnerSync() {
  const { account, connected, wallet } = useWallet();
  const detectedAddress = useDetectedWalletAddress(connected, wallet, account);
  const { accounts, addAccount, currentAccount, setCurrentAccount } = useDashboardStore();
  const missingAddressTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (missingAddressTimerRef.current) {
      window.clearTimeout(missingAddressTimerRef.current);
      missingAddressTimerRef.current = null;
    }

    if (!connected) {
      if (currentAccount !== 'all' && currentAccount !== null) {
        setCurrentAccount(null);
      }
      return;
    }
    if (!detectedAddress) {
      if (currentAccount !== 'all' && currentAccount !== null) {
        missingAddressTimerRef.current = window.setTimeout(() => {
          if (useDashboardStore.getState().currentAccount !== 'all') {
            setCurrentAccount(null);
          }
        }, 1500);
      }
      return;
    }
    const ownerAddress = detectedAddress;
    const exists = accounts.some((item) => normalizeAddress(item.address) === normalizeAddress(ownerAddress));
    const connectIntent = consumeWalletConnectIntent();
    if (!exists) {
      if (connectIntent) {
        addAccount({ address: ownerAddress, name: '连接钱包' });
        setCurrentAccount(ownerAddress);
      } else if (currentAccount !== 'all') {
        setCurrentAccount(null);
      }
      return;
    }
    if (currentAccount !== 'all' && normalizeAddress(currentAccount || '') !== normalizeAddress(ownerAddress)) {
      setCurrentAccount(ownerAddress);
    }
    return () => {
      if (missingAddressTimerRef.current) {
        window.clearTimeout(missingAddressTimerRef.current);
        missingAddressTimerRef.current = null;
      }
    };
  }, [accounts, addAccount, connected, currentAccount, detectedAddress, setCurrentAccount]);

  return null;
}

export function TradingRoot() {
  return (
    <AptosWalletAdapterProvider
      autoConnect
      disableTelemetry
      dappConfig={{
        network: Network.MAINNET,
        aptosApiKeys: localApiKey ? { [Network.MAINNET]: localApiKey } : undefined,
      }}
    >
      <WalletOwnerSync />
      <App />
    </AptosWalletAdapterProvider>
  );
}
