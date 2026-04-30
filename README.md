# Decibel Dashboard

面向 Decibel 主网账户的本地做市 / 持仓 / 风控看板。

当前版本：`v0.1.2`

## 功能

- 主网账户总览：账户权益、总盈亏、未实现盈亏、30 天交易量、AMP 积分
- AMP 今日新增：以本地每日基准计算当天积分变化
- Owner Wallet 模式：只添加主钱包，自动读取其子账户数据
- 多账户汇总：支持“所有主钱包”模式，汇总权益、持仓、挂单、交易量和 AMP
- 子账户本地别名：按主钱包分组保存，方便识别不同子账户
- 持仓表：市场、子账户、方向、数量、价值、开仓价、现价、盈亏、清算价、保证金、资金费
- 挂单表：市场、子账户、订单 ID、类型、方向、数量、价值、价格、状态
- 最近成交：单账户模式展示最近成交，支持查看更多，包含来源、手续费和平仓盈亏
- 市场暴露：所有账户模式下展示不同市场的多空暴露和盈亏
- 盈亏图表：支持 24 小时、7 天、30 天、90 天、全部
- 持仓价格面板：点击持仓市场名查看 Decibel 官方 K 线、开仓价、现价、清算价
- 本地配置管理：API Key 测试、主钱包管理、配置导入 / 导出、清除本地数据

## 数据源

本项目使用 Decibel / Aptos Labs 主网 API：

```text
https://api.mainnet.aptoslabs.com/decibel/api/v1
```

主要接口包括：

- `/subaccounts`
- `/account_overviews`
- `/account_positions`
- `/open_orders`
- `/trade_history`
- `/portfolio_chart`
- `/markets`
- `/prices`
- `/points_leaderboard`
- `/candlesticks`

K 线面板使用 Decibel 官方 `/candlesticks` 接口，不依赖第三方行情源。

## 本地运行

```bash
npm install
npm run dev
```

默认开发地址：

```text
http://localhost:5173
```

生产构建：

```bash
npm run build
```

预览构建产物：

```bash
npm run preview
```

## 配置

1. 打开页面后点击右上角“设置”
2. 输入 Decibel 主网 API Key
3. 点击“测试连接”确认 API Key 可用
4. 添加 Owner Wallet，也就是主钱包地址
5. 刷新后系统会自动读取主钱包下的子账户数据

设置页支持：

- API Key 掩码显示
- 删除 API Key
- 测试 API Key 连接
- 添加 / 编辑 / 删除主钱包
- 编辑子账户本地别名
- 导出本地配置
- 导入本地配置
- 清除所有本地数据

## 本地存储

项目默认是本地工具，配置保存在浏览器 `localStorage`。

会保存的信息：

- 主网 API Key
- 主钱包地址和别名
- 当前选择账户
- 子账户本地别名
- AMP 每日基准

导出的配置文件不包含 API Key。

如果后续部署成公网服务，建议将 API Key 改为后端加密保存或后端代理请求，不建议长期在前端保存完整 Key。

## 版本说明

### v0.1.2

- 仅保留主网，移除测试网配置
- 新版交易工作台 UI
- 添加 logo 和 favicon
- 支持多主钱包汇总
- 支持本地子账户别名
- 添加最近成交表
- 添加 30 天交易量
- 修复 AMP 主网积分读取
- 持仓、挂单按价值排序
- 持仓新增保证金和资金费字段
- 最近成交新增来源、手续费、平仓盈亏
- 增加 Decibel 官方 K 线价格面板
- 设置页新增 API Key 测试、配置导入导出和清除本地数据
- 优化构建体积，图表懒加载，市场图标改为静态资源

### v0.1.1

- 当前功能稳定版打包留存
- 不包含后续 K 线价格面板改动

## 技术栈

- React 18
- TypeScript
- Vite
- Zustand
- Recharts

## 注意事项

- 本项目不是 Decibel 官方产品
- 数据准确性依赖 Decibel API 返回
- AMP 今日新增基于本地每日基准，非官方独立字段
- 多账户模式下部分指标为本地聚合结果
- K 线缩放为前端展示缩放，不会改变 Decibel 原始数据
