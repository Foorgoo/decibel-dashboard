# VPS Deploy Guide

这份说明的目标很直接：把项目放到 VPS 后，可以用一个 Node 服务同时提供网页和 Bot API。

## 1. VPS 要准备什么

建议环境：

- Ubuntu 22.04 或 24.04
- Node.js 20+
- npm
- 一个域名，最好配 HTTPS

检查 Node：

```bash
node -v
npm -v
```

## 2. 上传项目

建议放到：

```text
/opt/decibel-dashboard
```

进入目录：

```bash
cd /opt/decibel-dashboard
```

安装依赖：

```bash
npm ci
```

构建前端和后端：

```bash
npm run build:prod
```

构建完成后会有：

- `dist/`：前端页面
- `dist-server/bot-server.mjs`：Node 后端服务

## 3. 配置环境变量

复制样例：

```bash
cp .env.example .env
```

编辑 `.env`：

```bash
nano .env
```

推荐至少改这几项：

```text
PORT=8080
BOT_SERVER_HOST=0.0.0.0
BOT_DATA_PATH=/var/lib/decibel-dashboard/bot-state.local
BOT_API_TOKEN=换成一串很长的随机字符
```

`BOT_API_TOKEN` 是写操作保护。开启后，页面读取普通数据不需要 Token，但启动、暂停、编辑、删除、紧急停止、备份下载、备份恢复都需要 Token。

页面里进入 `Bots`，点击 `后端 Token`，填同一串 Token 即可。点击 `运维` 可以查看 Runner 状态、下载备份、从备份恢复。

## 4. 创建数据目录

```bash
sudo mkdir -p /var/lib/decibel-dashboard
sudo chown -R www-data:www-data /var/lib/decibel-dashboard
```

## 5. 本机测试启动

```bash
npm run start
```

打开：

```text
http://VPS_IP:8080
```

健康检查：

```bash
curl http://127.0.0.1:8080/api/health
```

如果返回 `ok: true`，说明服务正常。

## 6. 用 systemd 常驻运行

复制服务文件：

```bash
sudo cp deploy/decibel-dashboard.service /etc/systemd/system/decibel-dashboard.service
```

确认服务文件里的路径是：

```text
WorkingDirectory=/opt/decibel-dashboard
EnvironmentFile=/opt/decibel-dashboard/.env
```

启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable decibel-dashboard
sudo systemctl start decibel-dashboard
```

看状态：

```bash
sudo systemctl status decibel-dashboard
```

看日志：

```bash
sudo journalctl -u decibel-dashboard -f
```

## 7. Nginx 反代建议

如果有域名，建议用 Nginx 反代到本服务。

示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

生产环境建议再加 HTTPS，例如用 certbot。

## 8. 现在 VPS 上可用到什么程度

已经可用：

- 打开页面
- 管理 Bot
- 管理策略
- 管理风控规则
- 查看告警和操作记录
- 后端保存数据文件
- 后端风控拦截
- 后端后台 Runner 定时心跳
- 亏损或延迟超过上限时自动熔断
- Token 保护写操作
- 运维弹窗查看 Runner 状态
- 当前状态备份下载
- 从备份文件恢复
- 写操作前自动保留最近 20 份备份

后台 Runner 默认每 5 秒运行一次，可用 `BOT_RUNNER_INTERVAL_MS` 调整。`BOT_RUNNER_SOURCE` 控制数据源，默认 `mock`，后续可切到 `readonly` 或 `live`。如果以后接入真正交易 Runner，可以把 `BOT_RUNNER_ENABLED=false`，让外部 Runner 接管运行状态。

还不是正式实盘交易：

- 还没有接真实行情源
- 还没有真实下单
- 还没有真实撤单
- 还没有权限分账号系统

下一步要做到真正生产交易，需要接真实 Runner。建议先做“只读 Runner”，只连行情和账户，不下单。
