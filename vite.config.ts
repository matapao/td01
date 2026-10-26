import { defineConfig } from 'vite';
import { bundleGuard } from './scripts/bundle-guard.ts';

export default defineConfig({
  plugins: [bundleGuard()],
  // The old prototype lives in .backup with its own index.html — keep Vite out of it.
  server: { watch: { ignored: ['**/.backup/**'] } },
  optimizeDeps: { entries: ['index.html'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
