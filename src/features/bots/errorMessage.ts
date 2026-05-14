const BOT_ERROR_HINTS: Record<string, string> = {
  BOT_NOT_FOUND: 'Bot 不存在，可能已被删除或 botId 不正确。',
  BOT_INVALID_STATUS: '状态变更非法，请刷新后重试。',
  BOT_RISK_BLOCKED: '被风控拦截，请检查限额、仓位和日亏损阈值。',
  BOT_IDEMPOTENCY_CONFLICT: '检测到重复请求，请稍后重试。',
  BOT_UNAUTHORIZED: '没有操作权限，请检查后端 API Token。',
  BOT_BAD_REQUEST: '请求内容不完整，请刷新后重试。',
  BOT_PAYLOAD_TOO_LARGE: '请求内容太大，请减少导入内容后重试。',
  ALERT_NOT_FOUND: '告警记录不存在，可能已被其他操作处理。',
  RISK_KILL_SWITCH_LOCKED: '全局熔断当前不可执行，请检查权限或风控锁状态。',
  INTERNAL_ERROR: '服务内部错误，请稍后重试。',
};

export const formatBotErrorMessage = (error: string | null, errorCode: string | null) => {
  if (!error) return null;
  if (!errorCode) return error;
  const hint = BOT_ERROR_HINTS[errorCode] || '操作失败，请稍后重试。';
  return `[${errorCode}] ${error} ${hint}`;
};
