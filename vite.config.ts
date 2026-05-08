import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined

          if (id.includes('/react/') || id.includes('/react-dom/')) {
            return 'vendor-react'
          }

          if (id.includes('/recharts/') || id.includes('/d3-')) {
            return 'vendor-charts'
          }

          if (id.includes('/@aptos-labs/wallet-adapter')) {
            return 'vendor-wallet'
          }

          if (id.includes('/@aptos-labs/gas-station-client')) {
            return 'vendor-gas-station'
          }

          if (id.includes('/@aptos-labs/ts-sdk')) {
            return 'vendor-aptos-sdk'
          }

          if (
            id.includes('/@noble/') ||
            id.includes('/@scure/') ||
            id.includes('/tweetnacl/') ||
            id.includes('/js-sha3/')
          ) {
            return 'vendor-crypto'
          }

          if (
            id.includes('/axios/') ||
            id.includes('/bech32/') ||
            id.includes('/borsh/') ||
            id.includes('/buffer/') ||
            id.includes('/superstruct/')
          ) {
            return 'vendor-aptos-utils'
          }

          if (id.includes('/@decibeltrade/')) {
            return 'vendor-decibel'
          }

          return undefined
        },
      },
    },
  },
})
