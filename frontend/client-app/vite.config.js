import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  server: {
    port: 5175,        // LOCKED: Client App MUST run on 5175
    strictPort: true,  // Fail if port is taken (don't auto-increment)
  },
});