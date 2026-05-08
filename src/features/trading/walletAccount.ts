import { useEffect, useState } from 'react';
import type { AccountInfo, AdapterWallet } from '@aptos-labs/wallet-adapter-core';

const getAccountAddress = (account?: AccountInfo | null) => {
  if (!account?.address) return null;
  return String(account.address);
};

const getAnyAccountAddress = (account: any) => {
  if (!account) return null;
  if (typeof account === 'string') return account;
  if (account.address) return String(account.address);
  if (account.accountAddress) return String(account.accountAddress);
  return null;
};

const getLegacyWalletAddress = async () => {
  const providers = [(window as any).petra, (window as any).aptos].filter(Boolean);

  for (const provider of providers) {
    if (!provider?.account) continue;
    try {
      const account = await provider.account();
      const address = getAnyAccountAddress(account);
      if (address) return address;
    } catch {
      // Try the next wallet provider shape.
    }
  }

  return null;
};

export const useDetectedWalletAddress = (
  connected: boolean,
  wallet: AdapterWallet | null,
  account?: AccountInfo | null,
) => {
  const [detectedAddress, setDetectedAddress] = useState<string | null>(getAccountAddress(account));

  useEffect(() => {
    if (!connected) {
      setDetectedAddress(null);
      return;
    }

    let cancelled = false;

    const updateAddress = async () => {
      try {
        const walletAccount = await wallet?.features?.['aptos:account']?.account();
        const nextAddress = await getLegacyWalletAddress()
          || getAccountAddress(walletAccount)
          || getAccountAddress(account);
        if (!cancelled) {
          setDetectedAddress(nextAddress);
        }
      } catch {
        if (!cancelled) {
          setDetectedAddress(await getLegacyWalletAddress() || getAccountAddress(account));
        }
      }
    };

    updateAddress();
    const interval = window.setInterval(updateAddress, 1200);
    const provider = (window as any).aptos || (window as any).petra;
    const handleAccountChange = (nextAccount: any) => {
      setDetectedAddress(getAnyAccountAddress(nextAccount));
    };
    const handleDisconnect = () => {
      setDetectedAddress(null);
    };

    try {
      provider?.onAccountChange?.(handleAccountChange);
      provider?.onDisconnect?.(handleDisconnect);
      provider?.on?.('accountChange', handleAccountChange);
      provider?.on?.('disconnect', handleDisconnect);
      wallet?.features?.['aptos:onAccountChange']?.onAccountChange?.(handleAccountChange);
    } catch {
      // Some wallets expose event helpers with incompatible signatures.
    }

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      try {
        provider?.offAccountChange?.(handleAccountChange);
        provider?.offDisconnect?.(handleDisconnect);
        provider?.removeListener?.('accountChange', handleAccountChange);
        provider?.removeListener?.('disconnect', handleDisconnect);
      } catch {
        // Best-effort cleanup for wallet-specific provider APIs.
      }
    };
  }, [account?.address, connected, wallet]);

  return detectedAddress;
};
