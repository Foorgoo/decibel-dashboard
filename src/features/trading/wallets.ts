import type { AdapterWallet } from '@aptos-labs/wallet-adapter-core';

const WALLET_CONNECT_INTENT_KEY = 'decibel_wallet_connect_intent_mainnet';

export const pickPreferredWallet = (wallets: ReadonlyArray<AdapterWallet>) => {
  const installedWallets = wallets.filter((item) => item.readyState === 'Installed');
  return (
    installedWallets.find((item) => /petra/i.test(item.name))
    || installedWallets[0]
    || wallets.find((item) => /petra/i.test(item.name))
    || wallets[0]
  );
};

export const markWalletConnectIntent = () => {
  sessionStorage.setItem(WALLET_CONNECT_INTENT_KEY, '1');
};

export const consumeWalletConnectIntent = () => {
  const hasIntent = sessionStorage.getItem(WALLET_CONNECT_INTENT_KEY) === '1';
  if (hasIntent) {
    sessionStorage.removeItem(WALLET_CONNECT_INTENT_KEY);
  }
  return hasIntent;
};
