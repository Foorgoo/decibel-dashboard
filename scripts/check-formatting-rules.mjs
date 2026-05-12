import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);

const guardedFiles = [
  'src/components/OrdersTable.tsx',
  'src/components/PositionsTable.tsx',
  'src/components/TradesTable.tsx',
  'src/components/MarketExposure.tsx',
  'src/components/PositionPricePanel.tsx',
  'src/features/trading/ClosePositionDialog.tsx',
];

const bannedImports = [
  '../utils/numberFormat',
  '../utils/marketPrecision',
  '../../utils/numberFormat',
];

const requiredImports = [
  '../utils/displayFormat',
  '../../utils/displayFormat',
];

let failed = false;

for (const file of guardedFiles) {
  const path = resolve(root, file);
  const source = readFileSync(path, 'utf8');
  const label = relative(root, path);

  for (const importPath of bannedImports) {
    if (source.includes(importPath)) {
      console.error(`${label}: direct display formatter import is not allowed: ${importPath}`);
      failed = true;
    }
  }

  if (!requiredImports.some((importPath) => source.includes(importPath))) {
    console.error(`${label}: expected displayFormat import for user-visible trading numbers`);
    failed = true;
  }
}

const numberFormat = readFileSync(resolve(root, 'src/utils/numberFormat.ts'), 'utf8');
if (!numberFormat.includes('minimumFractionDigits: 2') || !numberFormat.includes('maximumFractionDigits: 2')) {
  console.error('src/utils/numberFormat.ts: money and AMP formatters must keep two decimals');
  failed = true;
}

const marketPrecision = readFileSync(resolve(root, 'src/utils/marketPrecision.ts'), 'utf8');
if (!marketPrecision.includes('const DEFAULT_SIZE_DECIMALS = 5')) {
  console.error('src/utils/marketPrecision.ts: default market size decimals must stay at 5');
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log('Formatting rules check passed.');

