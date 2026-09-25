import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function getCommitHash(): string {
  try {
    return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim().slice(0, 7) || 'local';
  } catch {
    return 'local';
  }
}

export default defineConfig({
  plugins: [react()],
  base: '/argent-tekstil-yonetim/',
  define: {
    __APP_VERSION__: JSON.stringify(getCommitHash()),
  },
});
