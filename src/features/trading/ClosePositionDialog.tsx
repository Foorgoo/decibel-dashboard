import { useEffect, useMemo, useRef, useState } from 'react';
import { DecibelReadDex, MAINNET_CONFIG, TimeInForce, getMarketAddr } from '@decibeltrade/sdk';
import type { MarketDepth, MarketOrder } from '@decibeltrade/sdk';
import type { InputGenerateTransactionPayloadData } from '@aptos-labs/ts-sdk';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useDashboardStore } from '../../store';
import type { CloseOrderMode, ClosePositionDraft } from './types';
import { isSubaccountDelegated, sessionToAccount, loadTradingSession } from './session';
import { formatTradingError, submitGasStationTransaction, submitOwnerFeePayerTransaction } from './gasStation';
import { TRADING_REFRESH_EVENT, notifyTradingToast } from './events';
import { useDetectedWalletAddress } from './walletAccount';
import { normalizeAddress } from '../../utils/dashboardData';
import { formatMarketPrice, formatMarketSize, getMarketPriceDecimals, getMarketSizeDecimals } from '../../utils/marketPrecision';
import { formatCurrency, formatSignedCurrency } from '../../utils/numberFormat';

const PERCENT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const SLIPPAGE_PERCENT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const getMarketName = (position: any) => {
  const marketName = String(position.market_name || position.market || 'Unknown');
  return marketName.includes('/') ? marketName.split('/')[0] : marketName;
};

const createDraft = (position: any, mode: CloseOrderMode): ClosePositionDraft => {
  const size = Number(position.size || 0);
  const markPrice = Number(position.mark_price || position.mark_px || position.price || 0);
  const side = size >= 0 ? 'long' : 'short';

  return {
    mode,
    market: String(position.market || ''),
    marketName: getMarketName(position),
    subaccount: String(position.subaccount || ''),
    size: Math.abs(size),
    side,
    closeSide: side === 'long' ? 'SELL' : 'BUY',
    markPrice,
    limitPrice: markPrice,
    slippagePercent: 0.5,
    postOnly: true,
  };
};

const toChainUnits = (value: number, decimals: number) => Math.round(value * 10 ** decimals);

const fromChainUnits = (value: number, decimals: number) => value / 10 ** decimals;

const toNumericInput = (value: number, maxDecimals = 6) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  return Number(value.toFixed(maxDecimals)).toString();
};

const toPriceInput = (value: number, maxDecimals = 6) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  const fixedValue = value.toFixed(maxDecimals);
  const [integerPart, decimalPart = ''] = fixedValue.split('.');
  if (maxDecimals <= 2) return `${integerPart}.${decimalPart.padEnd(2, '0').slice(0, 2)}`;
  const trimmedDecimals = decimalPart.replace(/0+$/, '');
  return `${integerPart}.${trimmedDecimals.padEnd(2, '0')}`;
};

const parseNumericInput = (value: string) => Number(value.replace(/,/g, '').trim());

const roundPriceToTick = (
  price: number,
  tickSize: number,
  pxDecimals: number,
  direction: 'up' | 'down',
) => {
  if (!Number.isFinite(price) || price <= 0 || !tickSize || !pxDecimals) return price;
  const chainPrice = price * 10 ** pxDecimals;
  const tickCount = direction === 'up'
    ? Math.ceil(chainPrice / tickSize)
    : Math.floor(chainPrice / tickSize);
  return fromChainUnits(tickCount * tickSize, pxDecimals);
};

const getPositionPnl = (position: any, closePrice: number, closeSize: number, totalSize: number) => {
  const entryPrice = Number(position.entry_price || position.avg_entry_price || position.entry_px || 0);
  if (
    Number.isFinite(entryPrice)
    && entryPrice > 0
    && Number.isFinite(closePrice)
    && closePrice > 0
    && Number.isFinite(closeSize)
    && closeSize > 0
  ) {
    const signedSize = Number(position.size || 0);
    const sideMultiplier = signedSize >= 0 ? 1 : -1;
    return (closePrice - entryPrice) * closeSize * sideMultiplier;
  }

  const apiPnl = Number(position.pnl ?? position.unrealized_pnl ?? position.unrealized_pnl_amount);
  if (Number.isFinite(apiPnl) && totalSize > 0) return apiPnl * (closeSize / totalSize);

  return 0;
};

const getBookPrice = (level?: MarketOrder | null) => {
  const price = Number(level?.price);
  return Number.isFinite(price) && price > 0 ? price : 0;
};

const simulateFill = (levels: MarketOrder[], size: number, side: 'BUY' | 'SELL') => {
  if (!Number.isFinite(size) || size <= 0 || levels.length === 0) {
    return { averagePrice: 0, filledSize: 0, complete: false };
  }

  const sortedLevels = [...levels].sort((a, b) => (
    side === 'BUY' ? Number(a.price) - Number(b.price) : Number(b.price) - Number(a.price)
  ));
  let remaining = size;
  let notional = 0;
  let filledSize = 0;

  for (const level of sortedLevels) {
    const price = Number(level.price);
    const availableSize = Number(level.size);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(availableSize) || availableSize <= 0) continue;

    const fillSize = Math.min(remaining, availableSize);
    notional += fillSize * price;
    filledSize += fillSize;
    remaining -= fillSize;
    if (remaining <= 0) break;
  }

  return {
    averagePrice: filledSize > 0 ? notional / filledSize : 0,
    filledSize,
    complete: remaining <= 0,
  };
};

interface ClosePositionDialogProps {
  mode: CloseOrderMode;
  position: any;
  onClose: () => void;
}

export function ClosePositionDialog({ mode, position, onClose }: ClosePositionDialogProps) {
  const { account: walletAccount, connected, signTransaction, wallet } = useWallet();
  const detectedWalletAddress = useDetectedWalletAddress(connected, wallet, walletAccount);
  const { apiKey, gasStationApiKey, gasStationEnabled, markets } = useDashboardStore();
  const draft = useMemo(() => createDraft(position, mode), [position, mode]);
  const marketConfig = useMemo(() => markets.find((market) => (
    market.market_addr?.toLowerCase() === draft.market.toLowerCase()
      || market.market_name === position.market_name
      || market.market_name === String(position.market_name || '').replace('/', '-')
  )), [draft.market, markets, position.market_name]);
  const sizeInputDecimals = getMarketSizeDecimals(marketConfig, position) ?? 6;
  const priceInputDecimals = getMarketPriceDecimals(marketConfig) ?? 6;
  const [limitPrice, setLimitPrice] = useState(toPriceInput(draft.limitPrice, priceInputDecimals));
  const [limitTouched, setLimitTouched] = useState(false);
  const [limitSeededFromDepth, setLimitSeededFromDepth] = useState(false);
  const [sizeInput, setSizeInput] = useState(toNumericInput(draft.size, sizeInputDecimals));
  const [slippagePercent, setSlippagePercent] = useState(String(draft.slippagePercent));
  const [postOnly, setPostOnly] = useState(draft.postOnly);
  const [marketDepth, setMarketDepth] = useState<MarketDepth | null>(null);
  const [depthMessage, setDepthMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const priceInputRef = useRef<HTMLInputElement | null>(null);
  const sizeInputRef = useRef<HTMLInputElement | null>(null);
  const [displayReferencePrice, setDisplayReferencePrice] = useState(draft.markPrice);
  const latestReferencePriceRef = useRef(draft.markPrice);
  const hasDepthRef = useRef(false);
  const depthErrorCountRef = useRef(0);
  const bestBid = getBookPrice(marketDepth?.best_bid ? { price: marketDepth.best_bid, size: 0 } : marketDepth?.bids?.[0]);
  const bestAsk = getBookPrice(marketDepth?.best_ask ? { price: marketDepth.best_ask, size: 0 } : marketDepth?.asks?.[0]);
  const midPrice = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : draft.markPrice;
  const referencePrice = midPrice > 0 ? midPrice : draft.markPrice;
  const parsedLimitPrice = parseNumericInput(limitPrice);
  const parsedSize = parseNumericInput(sizeInput);
  const closeSize = Number.isFinite(parsedSize) ? Math.min(Math.max(parsedSize, 0), draft.size) : 0;
  const closePercent = draft.size > 0 ? Math.min(100, Math.max(0, (closeSize / draft.size) * 100)) : 0;
  const parsedSlippage = Number(slippagePercent);
  const safeSlippage = Number.isFinite(parsedSlippage) && parsedSlippage >= 0 ? parsedSlippage : 0;
  const fillEstimate = marketDepth
    ? simulateFill(draft.closeSide === 'BUY' ? marketDepth.asks : marketDepth.bids, closeSize, draft.closeSide)
    : { averagePrice: 0, filledSize: 0, complete: false };
  const estimatedSlippage = fillEstimate.averagePrice > 0 && referencePrice > 0
    ? draft.closeSide === 'BUY'
      ? Math.max(0, ((fillEstimate.averagePrice - referencePrice) / referencePrice) * 100)
      : Math.max(0, ((referencePrice - fillEstimate.averagePrice) / referencePrice) * 100)
    : 0;
  const rawProtectedPrice = draft.side === 'long'
    ? referencePrice * (1 - safeSlippage / 100)
    : referencePrice * (1 + safeSlippage / 100);
  const owner = String(position.owner || '');
  const delegated = isSubaccountDelegated(draft.subaccount, owner);
  const protectedPrice = marketConfig
    ? roundPriceToTick(
        rawProtectedPrice,
        Number(marketConfig.tick_size || 0),
        Number(marketConfig.px_decimals || 0),
        draft.closeSide === 'BUY' ? 'up' : 'down',
      )
    : rawProtectedPrice;
  const roundedLimitPrice = marketConfig
    ? roundPriceToTick(
        parsedLimitPrice,
        Number(marketConfig.tick_size || 0),
        Number(marketConfig.px_decimals || 0),
        draft.closeSide === 'BUY' ? 'up' : 'down',
      )
    : parsedLimitPrice;
  const orderPrice = mode === 'limit' ? roundedLimitPrice : protectedPrice;
  const displayClosePrice = mode === 'limit'
    ? limitTouched
      ? parsedLimitPrice
      : displayReferencePrice
    : fillEstimate.averagePrice > 0
      ? fillEstimate.averagePrice
      : orderPrice;
  const selectedPnl = getPositionPnl(position, displayClosePrice, closeSize, draft.size);
  const closeValue = closeSize * (displayClosePrice > 0 ? displayClosePrice : referencePrice);
  const pnlPercent = closeValue > 0 ? (selectedPnl / closeValue) * 100 : 0;
  const formattedCloseSize = formatMarketSize(closeSize, position, markets);
  const formattedClosePrice = formatMarketPrice(displayClosePrice, position, markets);
  const closePriceSummary = mode === 'limit' ? limitPrice || '-' : formattedClosePrice;
  const formattedRoundedLimitPrice = formatMarketPrice(roundedLimitPrice, position, markets);
  const tokenSymbol = draft.marketName.split('-')[0].split('/')[0];
  const closeActionText = draft.side === 'long' ? '平多' : '平空';
  const effectiveGasStationKey = gasStationEnabled ? (gasStationApiKey || apiKey) : '';
  const walletMatchesOwner = Boolean(
    !gasStationEnabled
      && owner
      && detectedWalletAddress
      && normalizeAddress(owner) === normalizeAddress(detectedWalletAddress),
  );
  const canSubmit = delegated
    && (gasStationEnabled ? Boolean(effectiveGasStationKey) : walletMatchesOwner)
    && closeSize > 0
    && closeSize <= draft.size
    && Number.isFinite(orderPrice)
    && orderPrice > 0
    && Boolean(marketConfig);

  useEffect(() => {
    if (!marketConfig || !apiKey) return undefined;

    setDepthMessage('');
    hasDepthRef.current = false;
    depthErrorCountRef.current = 0;
    const missingDepthTimer = window.setTimeout(() => {
      if (!hasDepthRef.current) {
        setDepthMessage('盘口暂未返回，价格会先回退到 Mark Price。');
      }
    }, 4500);

    const reader = new DecibelReadDex(MAINNET_CONFIG, {
      nodeApiKey: apiKey,
      onWsError: () => {
        depthErrorCountRef.current += 1;
        if (!hasDepthRef.current && depthErrorCountRef.current >= 2) {
          setDepthMessage('盘口暂未返回，价格会先回退到 Mark Price。');
        }
      },
    });

    const unsubscribe = reader.marketDepth.subscribeByName(marketConfig.market_name, 1, (depth) => {
      hasDepthRef.current = true;
      depthErrorCountRef.current = 0;
      setDepthMessage('');
      setMarketDepth(depth);
    });

    return () => {
      window.clearTimeout(missingDepthTimer);
      unsubscribe();
    };
  }, [apiKey, marketConfig?.market_name]);

  useEffect(() => {
    if (referencePrice > 0) {
      latestReferencePriceRef.current = referencePrice;
    }
  }, [referencePrice]);

  useEffect(() => {
    const updateDisplayPrice = () => {
      if (latestReferencePriceRef.current > 0) {
        setDisplayReferencePrice(latestReferencePriceRef.current);
      }
    };

    updateDisplayPrice();
    const intervalId = window.setInterval(updateDisplayPrice, 5000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (limitTouched || limitSeededFromDepth || bestBid <= 0 || bestAsk <= 0 || referencePrice <= 0) return;
    setLimitPrice(toPriceInput(referencePrice, priceInputDecimals));
    setDisplayReferencePrice(referencePrice);
    setLimitSeededFromDepth(true);
    requestAnimationFrame(() => {
      priceInputRef.current?.focus();
      priceInputRef.current?.select();
    });
  }, [bestAsk, bestBid, limitSeededFromDepth, limitTouched, priceInputDecimals, referencePrice]);

  useEffect(() => {
    const input = mode === 'limit' ? priceInputRef.current : sizeInputRef.current;
    if (!input) return;

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }, [mode]);

  const handlePercentSelect = (percent: number) => {
    setSizeInput(toNumericInput((draft.size * percent) / 100, sizeInputDecimals));
  };

  const handleMidPriceClick = () => {
    setLimitTouched(true);
    setLimitPrice(toPriceInput(referencePrice, priceInputDecimals));
  };

  const handleSubmit = async () => {
    if (!canSubmit || !marketConfig) {
      notifyTradingToast({
        type: 'error',
        title: '平仓提交失败',
        message: delegated ? '交易参数不完整或市场配置缺失' : '请先在设置中完成 session key 授权',
      });
      return;
    }

    const session = loadTradingSession(owner);
    if (!session) {
      notifyTradingToast({ type: 'error', title: '平仓提交失败', message: '未找到本地 session key，请重新授权' });
      return;
    }

    setSubmitting(true);
    notifyTradingToast({
      type: 'warning',
      title: '正在提交平仓',
    });

    try {
      const sessionAccount = sessionToAccount(session);
      const marketAddress = getMarketAddr(marketConfig.market_name, MAINNET_CONFIG.deployment.perpEngineGlobal);
      const data: InputGenerateTransactionPayloadData = {
        function: `${MAINNET_CONFIG.deployment.package}::dex_accounts_entry::place_order_to_subaccount`,
        typeArguments: [],
        functionArguments: [
          draft.subaccount,
          marketAddress.toString(),
          toChainUnits(orderPrice, marketConfig.px_decimals),
          toChainUnits(closeSize, marketConfig.sz_decimals),
          draft.closeSide === 'BUY',
          mode === 'market'
            ? TimeInForce.ImmediateOrCancel
            : postOnly
              ? TimeInForce.PostOnly
              : TimeInForce.GoodTillCanceled,
          true,
          crypto.randomUUID().replace(/-/g, ''),
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
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
        title: '平仓订单已提交',
      });
      window.dispatchEvent(new CustomEvent(TRADING_REFRESH_EVENT, {
        detail: { hash: transactionHash, action: 'close_position' },
      }));
      onClose();
    } catch (error: unknown) {
      const rawMessage = formatTradingError(error) || '交易提交失败';
      const text = rawMessage.includes('INSUFFICIENT_BALANCE_FOR_TRANSACTION_FEE')
        ? gasStationEnabled
          ? '交易提交失败：Gas Station 未成功赞助 gas，请检查 Gas Station API Key 和 allow functions。'
          : '交易提交失败：owner 钱包 APT 余额不足，无法支付 gas。'
        : rawMessage;
      notifyTradingToast({
        type: 'error',
        title: '平仓提交失败',
        message: text,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal trade-modal" onClick={(event) => event.stopPropagation()}>
        <div className="trade-modal-header">
          <h2 className="modal-title">{mode === 'limit' ? '限价平仓' : '市价平仓'}</h2>
          <p>
            {mode === 'limit'
              ? '设置平仓限价，默认使用盘口 Mid Price。'
              : '按盘口即时平仓，未成交部分会自动取消。'}
          </p>
        </div>

        <div className="trade-modal-body">
          <div className="trade-close-summary">
            <div>
              <span>{mode === 'market' ? '数量' : '平仓价'}</span>
              <strong className="mono">
                {mode === 'market'
                  ? `${formattedCloseSize} ${tokenSymbol}`
                  : closePriceSummary}
              </strong>
            </div>
            <div>
              <span>{mode === 'market' ? '价格' : '数量'}</span>
              <strong className="mono">
                {mode === 'market' ? '市价' : `${formattedCloseSize} ${tokenSymbol}`}
              </strong>
            </div>
            <div>
              <span>{mode === 'market' ? '预估滑点' : '平仓价值'}</span>
              <strong className="mono">
                {mode === 'market'
                  ? marketDepth ? `${SLIPPAGE_PERCENT.format(estimatedSlippage)}%` : '0.0000%'
                  : closeValue > 0 ? formatCurrency(closeValue) : '-'}
              </strong>
            </div>
            <div>
              <span>{mode === 'market' ? '预估盈亏' : '盈亏'}</span>
              <strong className={selectedPnl >= 0 ? 'positive' : 'negative'}>{formatSignedCurrency(selectedPnl)}</strong>
            </div>
          </div>

          <div className="trade-fields">
            {mode === 'limit' ? (
              <div className="trade-field-row">
                <label htmlFor="close-limit-price">限价价格 (USD)</label>
                <input
                  id="close-limit-price"
                  ref={priceInputRef}
                  value={limitPrice}
                  onChange={(event) => {
                    setLimitTouched(true);
                    setLimitPrice(event.target.value);
                  }}
                  inputMode="decimal"
                />
                <button type="button" onClick={handleMidPriceClick}>Mid</button>
              </div>
            ) : (
              <div className="trade-field-row">
                <label htmlFor="close-slippage">最大滑点</label>
                <input
                  id="close-slippage"
                  value={slippagePercent}
                  onChange={(event) => setSlippagePercent(event.target.value)}
                  inputMode="decimal"
                />
                <span>%</span>
              </div>
            )}

            <div className="trade-field-row">
              <label htmlFor="close-size">平仓数量</label>
              <input
                id="close-size"
                ref={sizeInputRef}
                value={sizeInput}
                onChange={(event) => setSizeInput(event.target.value)}
                inputMode="decimal"
              />
              <span>{tokenSymbol}</span>
            </div>
          </div>

          <div className={`trade-pnl-line ${selectedPnl >= 0 ? 'positive' : 'negative'}`}>
            预估 {formatSignedCurrency(selectedPnl)} / {PERCENT.format(pnlPercent)}% {selectedPnl >= 0 ? '盈利' : '亏损'}
          </div>

          <div className="trade-slider-wrap">
            <input
              className="trade-size-slider"
              type="range"
              min="0"
              max="100"
              step="1"
              value={Number.isFinite(closePercent) ? closePercent : 0}
              onChange={(event) => handlePercentSelect(Number(event.target.value))}
            />
            <div className="trade-slider-labels">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="trade-minor-row">
            <span>
              {closeActionText} ·{' '}
              <strong className={draft.closeSide === 'SELL' ? 'negative' : 'positive'}>{draft.closeSide}</strong>
              {' '}· Reduce Only
            </span>
            <label className="trade-toggle trade-toggle-compact">
              <input
                type="checkbox"
                checked={postOnly}
                disabled={mode === 'market'}
                onChange={(event) => setPostOnly(event.target.checked)}
              />
              <span>{mode === 'market' ? 'IOC' : 'Post Only'}</span>
            </label>
          </div>

          {mode === 'limit' && marketConfig && roundedLimitPrice !== parsedLimitPrice && (
            <p className="settings-hint trade-inline-hint">提交价: <span className="mono">{formattedRoundedLimitPrice}</span></p>
          )}
          {mode === 'market' && marketDepth && !fillEstimate.complete && (
            <p className="settings-hint warning-text trade-inline-hint">当前盘口深度不足，可能只能部分成交。</p>
          )}
          {mode === 'market' && depthMessage && <p className="settings-hint warning-text trade-inline-hint">{depthMessage}</p>}

          {(!delegated || (gasStationEnabled && !effectiveGasStationKey) || (!gasStationEnabled && !walletMatchesOwner)) && (
            <div className="trade-blocked-messages">
              {!delegated && <div className="settings-message warning">该子账户还没有 session key 授权，请先到设置里授权。</div>}
              {gasStationEnabled && !effectiveGasStationKey && <div className="settings-message warning">请先在设置中配置 Gas Station API Key。</div>}
              {!gasStationEnabled && !walletMatchesOwner && <div className="settings-message warning">Owner 付 gas 模式需要连接当前 Owner 钱包。</div>}
            </div>
          )}
        </div>

        <div className="modal-actions trade-modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? '提交中...' : '确认'}
          </button>
        </div>
      </div>
    </div>
  );
}
