import { useState } from 'react';
import { MAINNET_CONFIG, getMarketAddr } from '@decibeltrade/sdk';
import type { InputGenerateTransactionPayloadData } from '@aptos-labs/ts-sdk';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useDashboardStore } from '../../store';
import { isSubaccountDelegated, loadTradingSession, sessionToAccount } from './session';
import { formatTradingError, submitGasStationTransaction, submitOwnerFeePayerTransaction } from './gasStation';
import {
  TRADING_REFRESH_EVENT,
  notifyTradingToast,
  openTradingAuthorization,
  openTradingConfig,
} from './events';
import { useDetectedWalletAddress } from './walletAccount';
import { normalizeAddress } from '../../utils/dashboardData';

interface CancelOrderActionProps {
  order: any;
}

const getOrderId = (order: any) => String(order.order_id || order.id || '');

const getMarketName = (order: any) => {
  const marketName = String(order.market_name || order.market || '');
  return marketName.includes('/') ? marketName.replace('/', '-') : marketName;
};

export function CancelOrderAction({ order }: CancelOrderActionProps) {
  const { account: walletAccount, connected, signTransaction, wallet } = useWallet();
  const detectedWalletAddress = useDetectedWalletAddress(connected, wallet, walletAccount);
  const { apiKey, currentAccount, gasStationApiKey, gasStationEnabled, markets } = useDashboardStore();
  const [submitting, setSubmitting] = useState(false);

  const orderId = getOrderId(order);
  const subaccount = String(order.subaccount || '');
  const owner = String(order.owner || '');
  const marketConfig = markets.find((market) => (
    market.market_addr?.toLowerCase() === String(order.market || '').toLowerCase()
      || market.market_name === getMarketName(order)
      || market.market_name === String(order.market_name || '')
  ));
  const delegated = isSubaccountDelegated(subaccount, owner);
  const effectiveGasStationKey = gasStationEnabled ? (gasStationApiKey || apiKey) : '';
  const walletMatchesOwner = Boolean(
    !gasStationEnabled
      && owner
      && detectedWalletAddress
      && normalizeAddress(owner) === normalizeAddress(detectedWalletAddress),
  );
  const canCancel = delegated
    && (gasStationEnabled ? Boolean(effectiveGasStationKey) : walletMatchesOwner)
    && Boolean(orderId)
    && Boolean(subaccount)
    && Boolean(marketConfig);
  const handleAuthorizeClick = () => {
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

  const handleOwnerMismatchClick = () => {
    notifyTradingToast({
      type: 'warning',
      title: '请连接当前 Owner 钱包',
      message: 'Owner 付 gas 模式需要连接当前 Owner 钱包',
    });
  };

  const handleCancel = async () => {
    if (!canCancel || !marketConfig) {
      notifyTradingToast({
        type: 'error',
        title: '取消订单失败',
        message: delegated ? '订单信息不完整或市场配置缺失' : '请先在设置中完成 session key 授权',
      });
      return;
    }

    const session = loadTradingSession(owner);
    if (!session) {
      notifyTradingToast({ type: 'error', title: '取消订单失败', message: '请先完成 session key 授权' });
      return;
    }

    setSubmitting(true);
    notifyTradingToast({
      type: 'warning',
      title: '正在取消订单',
    });

    try {
      const sessionAccount = sessionToAccount(session);
      const marketAddress = getMarketAddr(marketConfig.market_name, MAINNET_CONFIG.deployment.perpEngineGlobal);
      const data: InputGenerateTransactionPayloadData = {
        function: `${MAINNET_CONFIG.deployment.package}::dex_accounts_entry::cancel_order_to_subaccount`,
        typeArguments: [],
        functionArguments: [
          subaccount,
          BigInt(orderId),
          marketAddress.toString(),
        ],
      };
      const transactionHash = gasStationEnabled
        ? await submitGasStationTransaction({
            apiKey,
            gasStationApiKey: effectiveGasStationKey,
            signer: sessionAccount,
            data,
          })
        : await submitOwnerFeePayerTransaction({
            apiKey,
            signer: sessionAccount,
            feePayerAddress: owner,
            data,
            signFeePayerTransaction: signTransaction,
          });

      notifyTradingToast({
        type: 'success',
        title: '取消订单已提交',
      });
      window.dispatchEvent(new CustomEvent(TRADING_REFRESH_EVENT, {
        detail: { hash: transactionHash, action: 'cancel_order' },
      }));
    } catch (error: unknown) {
      notifyTradingToast({
        type: 'error',
        title: '取消订单失败',
        message: formatTradingError(error) || '请稍后重试',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="order-cancel-action">
      {gasStationEnabled && !effectiveGasStationKey ? (
        <button className="order-cancel-btn setup" onClick={openTradingConfig}>
          配置 Gas
        </button>
      ) : !gasStationEnabled && !walletMatchesOwner ? (
        <button className="order-cancel-btn setup" onClick={handleOwnerMismatchClick}>
          连接 Owner
        </button>
      ) : !delegated ? (
        <button className="order-cancel-btn auth" onClick={handleAuthorizeClick}>
          {currentAccount === 'all' ? '需授权交易' : '授权交易'}
        </button>
      ) : (
      <button
        className="order-cancel-btn"
        onClick={handleCancel}
        disabled={!canCancel || submitting}
        title={delegated ? '取消订单' : '请先授权 session key'}
      >
        {submitting ? '取消中' : '取消'}
      </button>
      )}
    </div>
  );
}
