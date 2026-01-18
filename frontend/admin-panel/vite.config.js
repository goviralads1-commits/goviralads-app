import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  server: {
    port: 5173,        // LOCKED: Admin Panel MUST run on 5173
    strictPort: true,  // Fail if port is taken (don't auto-increment)
  },
});