import type { AdapterWallet } from '@aptos-labs/wallet-adapter-core';

const WALLET_CONNECT_INTENT_KEY = 'decibel_wallet_connect_intent_mainnet';
const PETRA_WALLET_NAME = 'Petra';

export const isPetraWallet = (wallet: AdapterWallet) => /petra/i.test(wallet.name);

export const pickPreferredWallet = (wallets: ReadonlyArray<AdapterWallet>) => {
  const petraWallets = wallets.filter(isPetraWallet);
  return petraWallets.find((item) => item.readyState === 'Installed') || petraWallets[0];
};

export const getSupportedWalletLabel = () => PETRA_WALLET_NAME;

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
