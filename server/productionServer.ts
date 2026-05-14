import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { handleBotApi, runBotRunnerTick, setRunnerEnabled, setRunnerError } from './botBackend';

const host = process.env.BOT_SERVER_HOST || '0.0.0.0';
const port = Number(process.env.PORT || process.env.BOT_SERVER_PORT || 8080);
const distDir = resolve(process.env.BOT_WEB_DIR || 'dist');
const storagePath = resolve(process.env.BOT_DATA_PATH || '.bot-backend.local');
const apiToken = process.env.BOT_API_TOKEN || '';
const runnerEnabled = process.env.BOT_RUNNER_ENABLED !== 'false';
const runnerIntervalMs = Math.max(1000, Number(process.env.BOT_RUNNER_INTERVAL_MS || 5000));
const runnerSource = process.env.BOT_RUNNER_SOURCE === 'readonly' || process.env.BOT_RUNNER_SOURCE === 'live'
  ? process.env.BOT_RUNNER_SOURCE
  : 'mock';

const mimeTypes: Record<string, string> = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
};

const sendNotFound = (res: ServerResponse) => {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain;charset=utf-8');
  res.end('Not found');
};

const sendFile = (filePath: string, res: ServerResponse) => {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    sendNotFound(res);
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', mimeTypes[extname(filePath)] || 'application/octet-stream');
  createReadStream(filePath).pipe(res);
};

const server = createServer(async (req, res) => {
  const handled = await handleBotApi(req, res, { storagePath, apiToken, runnerSource });
  if (handled) return;

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const rawPath = decodeURIComponent(url.pathname);
  const safePath = rawPath.includes('..') ? '/' : rawPath;
  const filePath = safePath === '/' ? join(distDir, 'index.html') : join(distDir, safePath);

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(filePath, res);
    return;
  }

  // SPA fallback: deep links should open the dashboard app.
  sendFile(join(distDir, 'index.html'), res);
});

server.listen(port, host, () => {
  console.log(`Decibel Bot server listening on http://${host}:${port}`);
  console.log(`Web dir: ${distDir}`);
  console.log(`Bot data: ${storagePath}`);
  console.log(`Write auth: ${apiToken ? 'enabled' : 'disabled'}`);
  console.log(`Runner: ${runnerEnabled ? `enabled every ${runnerIntervalMs}ms` : 'disabled'}`);
  console.log(`Runner source: ${runnerSource}`);
});

let runnerTimer: ReturnType<typeof setInterval> | null = null;

if (runnerEnabled) {
  setRunnerEnabled(true, runnerIntervalMs, runnerSource);
  runnerTimer = setInterval(() => {
    try {
      runBotRunnerTick({ storagePath, apiToken, runnerSource });
    } catch (error) {
      setRunnerError(error);
      console.error('Bot runner tick failed:', error);
    }
  }, runnerIntervalMs);
  runnerTimer.unref();
} else {
  setRunnerEnabled(false, runnerIntervalMs, runnerSource);
}

const shutdown = () => {
  if (runnerTimer) clearInterval(runnerTimer);
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
