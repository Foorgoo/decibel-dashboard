# Decibel Dashboard

A real-time monitoring and statistics dashboard for Decibel market-making strategies.

## Features

- **Account Overview**: Equity, realized P&L, unrealized P&L, margin utilization
- **Positions Table**: Open positions with P&L and liquidation prices
- **Orders Table**: Open orders (limit, stop, TP/SL)
- **P&L Chart**: Time-series portfolio value chart
- **Real-time Updates**: Auto-refresh every 30 seconds

## Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Configuration

1. Click "⚙ Configure" button
2. Enter your Decibel API key
3. Enter your owner address (0x...)
4. Click Save

API keys can be generated from the Decibel dashboard.

## Tech Stack

- React 18 + TypeScript
- Vite
- Recharts
- Zustand