import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],

  build: {
    // Output directory
    outDir: 'dist',

    // Clear dist before build
    emptyDirBeforeWrite: true,

    // Rollup options
    rollupOptions: {
      // Entry points - HTML files only
      // DO NOT include background.js or content.js here!
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        // popup: resolve(__dirname, 'popup.html'),
        // options: resolve(__dirname, 'options.html'),
      },

      // Output configuration
      output: {
        // JS file naming (no hash for predictable paths)
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',

        // Asset file naming (CSS, images, etc.)
        assetFileNames: 'assets/[name].[ext]',
      },
    },

    // Source maps (disable in production)
    sourcemap: process.env.NODE_ENV === 'development',

    // Minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production',
      },
    },
  },

  // Path aliases
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@lib': resolve(__dirname, 'src/lib'),
    },
  },

  // CSS configuration
  css: {
    postcss: './postcss.config.js',
  },
});
