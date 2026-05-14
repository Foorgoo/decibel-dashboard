# Local Bot Backend

这个项目现在带了一个本地 Bot 后端，主要用于把前端管理台和后端接口链路先跑通。

它不是实盘交易机器人，也不会真的下单。它的作用是：让前端不再只靠浏览器本地模拟，而是可以真正请求 `/api/bots` 这类后端接口。

## 怎么启动

正常启动开发服务即可：

```bash
npm run dev
```

Vite 会自动挂上本地 Bot 后端。

接口地址和前端同源，比如：

```text
http://127.0.0.1:5173/api/bots
```

## 数据保存在哪里

本地后端会把 Bot 数据保存到项目根目录：

```text
.bot-backend.local
```

这个文件用于本地调试，已经被 `.gitignore` 的 `*.local` 规则忽略，不会提交到仓库。

## 已支持的接口

- `GET /api/bots`
- `POST /api/bots/:id/start`
- `POST /api/bots/:id/pause`
- `POST /api/bots/:id/trip`
- `POST /api/bots/:id/stop`
- `PUT /api/bots/:id`
- `DELETE /api/bots/:id`
- `PUT /api/bot-strategies/:id`
- `DELETE /api/bot-strategies/:id`
- `PUT /api/bot-risk-rules/:id`
- `DELETE /api/bot-risk-rules/:id`
- `POST /api/alerts/:id/ack`
- `POST /api/risk/global-kill-switch`
- `GET /api/runner/status`
- `GET /api/admin/backup`
- `GET /api/admin/backups`
- `POST /api/admin/restore`

## 现在会做什么

### 1. 保存 Bot 配置

新增、编辑、删除 Bot 会写入本地后端文件。

### 2. 保存策略和风控规则

策略和风控规则也会通过后端接口保存。

### 3. 启动前做风控检查

启动 Bot 时，后端会再次检查：

- Bot 配置是否完整。
- 是否超过账户、市场、全局规则。
- 是否超过最大下单价值。
- 是否超过日亏损上限。
- 是否超过最多运行 Bot 数。

如果不通过，后端会返回 `BOT_RISK_BLOCKED`，前端会显示错误，不会再偷偷切回本地模拟。

### 4. 后台 Runner 心跳

如果 Bot 是运行中，生产服务会按固定间隔自动更新；开发模式下读取数据时也会更新：

- 心跳时间
- 行情状态
- 下单状态
- 延迟
- 今日盈亏
- 净敞口
- 自动熔断检查

这只是模拟数据，用来验证页面和接口链路。

### 5. 操作记录

后端会记录：

- 启动
- 暂停
- 熔断
- 删除
- 策略修改
- 风控修改
- 告警确认
- 全部紧急停止

前端“记录”页会显示这些内容。

## 现在还不是哪些东西

它现在还不是正式交易后端：

- 不连接真实行情源。
- 不计算真实报价。
- 不提交真实订单。
- 不撤真实挂单。
- 不管理真实私钥或 Session Key。
- 不做用户权限系统。

简单说：它是“接口和管理流程后端”，不是“真钱交易机器人”。

## 后续接真实 Runner 的路线

建议按这个顺序继续：

1. 把本地 Runner 替换成只读 Runner，只监听行情和账户，不下单。
2. 接模拟撮合，用真实行情跑模拟订单。
3. 加服务端权限和操作审计。
4. 加真实风控检查，所有实盘请求必须服务端二次确认。
5. 最后才开放小额度实盘。
