import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { aiPageContext } from '@ai-page-context/vite-plugin';

export default defineConfig({
  plugins: [react(), aiPageContext()],
  server: {
    port: 5173,
  },
});
