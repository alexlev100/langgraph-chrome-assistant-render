# Vite Configuration Reference

Complete reference for building Chrome extensions with Vite.

## Table of Contents

- [Project Setup](#project-setup)
- [Vite Configuration](#vite-configuration)
- [Manifest Configuration](#manifest-configuration)
- [Build Scripts](#build-scripts)
- [TypeScript Configuration](#typescript-configuration)
- [Environment Variables](#environment-variables)
- [Common Issues & Solutions](#common-issues--solutions)

---

## Project Setup

### Directory Structure

```
extension/
├── public/                     # Static files (NOT processed by Vite)
│   ├── manifest.json           # Extension manifest
│   ├── background.js           # Service worker (plain JS)
│   ├── content.js              # Content script (plain JS)
│   └── icons/
│       ├── icon-16.png
│       ├── icon-32.png
│       ├── icon-48.png
│       └── icon-128.png
├── src/                        # Source files (processed by Vite)
│   ├── sidepanel/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── popup/                  # Optional
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── components/
│   │   └── ui/
│   └── lib/
│       ├── api.ts
│       └── types.ts
├── sidepanel.html              # Entry HTML (in root, NOT in public/)
├── popup.html                  # Optional
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── package.json
```

### package.json

```json
{
  "name": "chrome-extension",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build && npm run copy-static",
    "copy-static": "cp -r public/* dist/",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext ts,tsx"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.260",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.7.0",
    "vite": "^5.4.0"
  }
}
```

---

## Vite Configuration

### Basic vite.config.ts

```typescript
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
      // Entry points (HTML files only, not JS)
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        // popup: resolve(__dirname, 'popup.html'),
        // options: resolve(__dirname, 'options.html'),
      },

      // Output configuration
      output: {
        // JS file naming
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',

        // Asset file naming (CSS, images, etc.)
        assetFileNames: 'assets/[name].[ext]',
      },
    },

    // Source maps (disable in production for smaller bundle)
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
```

### Multiple Entry Points

```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        popup: resolve(__dirname, 'popup.html'),
        options: resolve(__dirname, 'options.html'),
      },
    },
  },
});
```

### Development Server (for testing UI only)

```typescript
export default defineConfig({
  // Dev server (won't work with extension APIs)
  server: {
    port: 5173,
    open: '/sidepanel.html',
  },
});
```

---

## Manifest Configuration

### manifest.json (in public/)

```json
{
  "manifest_version": 3,
  "name": "Extension Name",
  "version": "0.1.0",
  "description": "Extension description",

  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "sidePanel"
  ],

  "host_permissions": [
    "<all_urls>"
  ],

  "action": {
    "default_title": "Click to open",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },

  "side_panel": {
    "default_path": "sidepanel.html"
  },

  "background": {
    "service_worker": "background.js",
    "type": "module"
  },

  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],

  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },

  "commands": {
    "_execute_action": {
      "suggested_key": {
        "default": "Ctrl+Shift+E",
        "mac": "Command+Shift+E"
      }
    }
  },

  "web_accessible_resources": [
    {
      "resources": ["assets/*"],
      "matches": ["<all_urls>"]
    }
  ],

  "minimum_chrome_version": "120"
}
```

### Popup Instead of Side Panel

```json
{
  "action": {
    "default_popup": "popup.html",
    "default_title": "Click to open"
  }
}
```

### Both Popup and Side Panel

```json
{
  "action": {
    "default_popup": "popup.html"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  }
}
```

---

## Build Scripts

### package.json Scripts

```json
{
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build && npm run copy-static",
    "copy-static": "cp -r public/* dist/",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit"
  }
}
```

### Cross-Platform Copy Script

For Windows compatibility, use a Node.js script:

```javascript
// scripts/copy-static.js
import { cpSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const src = join(root, 'public');
const dest = join(root, 'dist');

if (!existsSync(dest)) {
  mkdirSync(dest, { recursive: true });
}

cpSync(src, dest, { recursive: true });
console.log('Static files copied to dist/');
```

```json
{
  "scripts": {
    "copy-static": "node scripts/copy-static.js"
  }
}
```

---

## TypeScript Configuration

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"],
      "@lib/*": ["./src/lib/*"]
    },

    "types": ["chrome"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### tsconfig.node.json

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

---

## Environment Variables

### .env Files

```bash
# .env
VITE_API_URL=http://localhost:8000

# .env.development
VITE_DEBUG=true

# .env.production
VITE_DEBUG=false
```

### Accessing in Code

```typescript
// Only VITE_ prefixed variables are exposed
const apiUrl = import.meta.env.VITE_API_URL;
const isDebug = import.meta.env.VITE_DEBUG === 'true';
const isDev = import.meta.env.DEV;
const isProd = import.meta.env.PROD;
const mode = import.meta.env.MODE;
```

### Type Declarations

```typescript
// src/vite-env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_DEBUG: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

---

## Common Issues & Solutions

### Issue: Service Worker Parse Error

**Error:** `Parse error @:1:1` when building

**Cause:** Including `background.js` in Vite's rollup input

**Solution:** Keep service worker in `public/` and copy post-build

```typescript
// WRONG
input: {
  background: resolve(__dirname, 'public/background.js'),
}

// CORRECT - don't include in input, copy via script
"copy-static": "cp -r public/* dist/"
```

### Issue: manifest.json Empty Chunks

**Cause:** Including `manifest.json` in Vite input

**Solution:** Keep in `public/` and copy post-build

### Issue: Side Panel Not Loading

**Cause:** Path mismatch between manifest and built file

**Solution:** Verify `sidepanel.html` exists at dist root

```bash
# After build, verify:
ls dist/
# Should show: sidepanel.html, manifest.json, background.js, assets/
```

### Issue: Content Script Not Found

**Cause:** `content.js` not copied to dist

**Solution:** Ensure `public/content.js` exists and `copy-static` runs

### Issue: CSS Not Loading

**Cause:** Tailwind content paths don't include entry HTML

**Solution:** Include HTML files in tailwind.config.js

```javascript
// tailwind.config.js
content: [
  './sidepanel.html',
  './popup.html',
  './src/**/*.{ts,tsx}',
],
```

### Issue: Chrome Types Not Found

**Cause:** Missing `@types/chrome`

**Solution:**
```bash
npm install -D @types/chrome
```

And add to tsconfig.json:
```json
{
  "compilerOptions": {
    "types": ["chrome"]
  }
}
```

### Issue: Module Not Found in Service Worker

**Cause:** Service worker can't use ES modules from node_modules

**Solution:** Keep service worker as plain JS without imports, or bundle separately

---

## Tailwind CSS Setup

### tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './sidepanel.html',
    './popup.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
      },
    },
  },
  plugins: [],
};
```

### postcss.config.js

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### CSS Entry Point

```css
/* src/sidepanel/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
}
```

---

## Build Verification Checklist

After running `npm run build`, verify:

```bash
ls -la dist/

# Required files:
# ✓ manifest.json
# ✓ background.js
# ✓ content.js
# ✓ sidepanel.html
# ✓ assets/ (contains bundled JS/CSS)
# ✓ icons/ (if using icons)
```

Load in Chrome:
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `dist/` folder
5. Check for errors in extension card
