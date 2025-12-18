import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': process.env,
    'global': 'window',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
      stream: 'stream-browserify',
      util: 'util',
      process: 'process/browser',
    },
  },
  optimizeDeps: {
    include: ['buffer', 'stream-browserify', 'util', 'process'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});