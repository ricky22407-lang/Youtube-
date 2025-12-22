
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // 載入環境變數
  // Fix: Cast process to any to resolve "Property 'cwd' does not exist on type 'Process'"
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // 確保在瀏覽器環境中能存取到 process.env (Vercel 風格)
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env': JSON.stringify(env),
      'global': 'window',
    },
    server: {
      port: 3000,
    },
    resolve: {
      alias: {
        buffer: 'buffer',
        stream: 'stream-browserify',
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});
