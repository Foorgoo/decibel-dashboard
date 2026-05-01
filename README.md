# Decibel Dashboard

Decibel Dashboard 是一个面向 Decibel 主网账户的前端看板，用于查看主钱包及其子账户的账户权益、持仓、挂单、成交记录、AMP 积分和风险数据。

当前版本：`v0.1.2`

## 功能概览

- 只支持 Decibel 主网
- 添加 Owner Wallet 后自动读取其子账户
- 支持多个主钱包，并可查看所有账户汇总
- 展示账户权益、总盈亏、未实现盈亏、30 天交易量和 AMP 积分
- 展示持仓、挂单、最近成交和盈亏图表
- 所有账户模式下展示市场暴露汇总
- 持仓市场名可点击查看 Decibel 官方 K 线价格面板
- 支持本地编辑主钱包别名和子账户别名
- 支持 API Key 测试、本地配置导入导出和清除本地数据

## 使用方式

安装依赖：

```bash
npm install
```

本地开发：

```bash
npm run dev
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

打开页面后进入右上角“设置”：

1. 填写 Decibel 主网 API Key
2. 点击“测试连接”
3. 添加主钱包地址，也就是 Owner Wallet
4. 刷新或等待自动刷新后查看数据

API Key、钱包地址和别名默认保存在当前浏览器的 `localStorage` 中。导出的配置文件不包含 API Key，页面也不会把 API Key 上传到网站服务器。

## 数据源

项目使用 Decibel / Aptos Labs 主网 API：

```text
https://api.mainnet.aptoslabs.com/decibel/api/v1
```

K 线面板使用 Decibel 官方 `/candlesticks` 接口。

## 技术栈

- React
- TypeScript
- Vite
- Zustand
- Recharts

## 说明

本项目不是 Decibel 官方产品。页面展示数据依赖 Decibel API 返回结果，多账户汇总和 AMP 今日新增等部分数据为前端本地计算，仅供参考。
