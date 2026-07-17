import js from '@eslint/js';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        indexedDB: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        console: 'readonly',
        globalThis: 'readonly',
        Element: 'readonly',
        Range: 'readonly',
        HTMLElement: 'readonly',
        IntersectionObserver: 'readonly',
        MutationObserver: 'readonly',
        FileReader: 'readonly',
        DOMParser: 'readonly',
        HTMLAnchorElement: 'readonly',
        NodeFilter: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        File: 'readonly',
        DataTransfer: 'readonly',
        DragEvent: 'readonly',
        ClipboardEvent: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }]
    }
  },
  {
    ignores: ['node_modules/', 'dist/']
  }
];
