import type { BotConfig, BotRiskRule, BotRuntime, BotStrategy } from './types';

export const validateBotConfig = (bot: BotConfig) => {
  const issues: string[] = [];
  if (!bot.ownerAddress.trim()) issues.push('缺少主钱包');
  if (!bot.subaccount?.trim()) issues.push('缺少子账户');
  if (bot.symbols.length === 0 || bot.symbols.every((symbol) => !symbol.trim())) issues.push('缺少市场');
  if (bot.maxNotional <= 0) issues.push('最大下单价值需要大于 0');
  if (bot.maxDailyLoss <= 0) issues.push('日亏损上限需要大于 0');
  if (bot.maxSlippageBps <= 0) issues.push('最大滑点需要大于 0');
  if (bot.orderRateLimitPerMin <= 0) issues.push('每分钟下单数需要大于 0');
  if (!bot.quoteSpreadBps || bot.quoteSpreadBps <= 0) issues.push('报价价差需要大于 0');
  if (!bot.orderLevels || bot.orderLevels <= 0) issues.push('挂单层数需要大于 0');
  if (!bot.levelSpacingBps || bot.levelSpacingBps <= 0) issues.push('档位间距需要大于 0');
  if (!bot.refreshIntervalSec || bot.refreshIntervalSec <= 0) issues.push('刷新间隔需要大于 0');
  if (!bot.minOrderSize || bot.minOrderSize <= 0) issues.push('最小单笔数量需要大于 0');
  if (!bot.maxOrderSize || bot.maxOrderSize <= 0) issues.push('最大单笔数量需要大于 0');
  if ((bot.minOrderSize || 0) > (bot.maxOrderSize || 0)) issues.push('最小单笔数量不能大于最大单笔数量');
  if (bot.targetInventoryPct === undefined || bot.targetInventoryPct < 0 || bot.targetInventoryPct > 100) issues.push('目标库存需要在 0-100 之间');
  if (!bot.cancelStaleAfterSec || bot.cancelStaleAfterSec <= 0) issues.push('旧单撤销时间需要大于 0');
  if (!bot.heartbeatTimeoutSec || bot.heartbeatTimeoutSec <= 0) issues.push('心跳超时需要大于 0');
  if (!bot.maxConsecutiveErrors || bot.maxConsecutiveErrors <= 0) issues.push('连续错误次数需要大于 0');
  if (!bot.maxLatencyMs || bot.maxLatencyMs <= 0) issues.push('最大延迟需要大于 0');
  return issues;
};

export const validateBotStrategy = (strategy: BotStrategy) => {
  const issues: string[] = [];
  if (!strategy.id?.trim()) issues.push('缺少策略编号');
  if (!strategy.name?.trim()) issues.push('缺少策略名称');
  if (!strategy.strategyId?.trim()) issues.push('缺少策略类型');
  if (!strategy.strategyVersion?.trim()) issues.push('缺少策略版本');
  if (strategy.maxNotional <= 0) issues.push('最大下单价值需要大于 0');
  if (strategy.maxPosition <= 0) issues.push('最大仓位需要大于 0');
  if (strategy.maxDailyLoss <= 0) issues.push('日亏损上限需要大于 0');
  if (strategy.maxSlippageBps <= 0) issues.push('最大滑点需要大于 0');
  if (strategy.orderRateLimitPerMin <= 0) issues.push('每分钟下单数需要大于 0');
  if (strategy.quoteSpreadBps <= 0) issues.push('报价价差需要大于 0');
  if (strategy.orderLevels <= 0) issues.push('挂单层数需要大于 0');
  if (strategy.levelSpacingBps <= 0) issues.push('档位间距需要大于 0');
  if (strategy.refreshIntervalSec <= 0) issues.push('刷新间隔需要大于 0');
  if (strategy.minOrderSize <= 0) issues.push('最小单笔数量需要大于 0');
  if (strategy.maxOrderSize <= 0) issues.push('最大单笔数量需要大于 0');
  if (strategy.minOrderSize > strategy.maxOrderSize) issues.push('最小单笔数量不能大于最大单笔数量');
  if (strategy.targetInventoryPct < 0 || strategy.targetInventoryPct > 100) issues.push('目标库存需要在 0-100 之间');
  if (strategy.cancelStaleAfterSec <= 0) issues.push('旧单撤销时间需要大于 0');
  if (strategy.heartbeatTimeoutSec <= 0) issues.push('心跳超时需要大于 0');
  if (strategy.maxConsecutiveErrors <= 0) issues.push('连续错误次数需要大于 0');
  if (strategy.maxLatencyMs <= 0) issues.push('最大延迟需要大于 0');
  return issues;
};

export const validateRiskRule = (rule: BotRiskRule) => {
  const issues: string[] = [];
  if (!rule.id?.trim()) issues.push('缺少规则编号');
  if (!rule.name?.trim()) issues.push('请填写规则名称');
  if (!rule.target?.trim()) issues.push('请填写对象');
  if (rule.maxNotional <= 0) issues.push('最大总价值需要大于 0');
  if (rule.maxDailyLoss <= 0) issues.push('日亏损上限需要大于 0');
  if (rule.maxRunningBots <= 0) issues.push('最多运行 Bot 需要大于 0');
  return issues;
};

export const validateRiskRulesForStart = (
  bot: BotConfig,
  bots: BotConfig[],
  runtimes: Record<string, BotRuntime>,
  riskRules: BotRiskRule[],
) => {
  const issues: string[] = [];
  const enabledRules = riskRules.filter((rule) => rule.enabled);
  enabledRules.forEach((rule) => {
    const matchesScope = rule.scope === 'global'
      || (rule.scope === 'account' && rule.target.toLowerCase() === bot.ownerAddress.toLowerCase())
      || (rule.scope === 'market' && bot.symbols.some((symbol) => symbol.toLowerCase() === rule.target.toLowerCase()));
    if (!matchesScope) return;

    const runningBots = bots.filter((item) => {
      const runtime = runtimes[item.botId];
      if (runtime?.status !== 'RUNNING') return false;
      if (rule.scope === 'global') return true;
      if (rule.scope === 'account') return item.ownerAddress.toLowerCase() === rule.target.toLowerCase();
      return item.symbols.some((symbol) => symbol.toLowerCase() === rule.target.toLowerCase());
    });

    if (bot.maxNotional > rule.maxNotional) {
      issues.push(`${rule.name} 不允许这个 Bot 设置这么大的下单价值`);
    }
    if (bot.maxDailyLoss > rule.maxDailyLoss) {
      issues.push(`${rule.name} 不允许这个 Bot 设置这么高的日亏损上限`);
    }
    if (runningBots.length >= rule.maxRunningBots) {
      issues.push(`${rule.name} 已达到最多运行 Bot 数`);
    }
  });
  return issues;
};
