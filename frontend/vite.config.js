import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// strictPort: fail loudly instead of silently moving to another port that the
// backend's CORS_ORIGIN would not allow.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  test: { environment: 'jsdom' },
});
