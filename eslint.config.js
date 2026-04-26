import js from '@eslint/js';
import security from 'eslint-plugin-security';
import globals from 'globals';

export default [
    js.configs.recommended,
    security.configs.recommended,
    // Source files run in a browser — declare browser globals so ESLint
    // doesn't flag document, window, localStorage, etc. as undefined.
    {
        files: ['src/**/*.js'],
        languageOptions: {
            globals: globals.browser
        }
    },
    // Test files run in Node via Vitest.
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: globals.node
        }
    },
    {
        rules: {
            'no-console': 'warn',
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            // Allow == null / != null (idiomatic undefined+null check); require === elsewhere.
            'eqeqeq': ['error', 'always', { null: 'ignore' }],
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'security/detect-non-literal-fs-filename': 'off'
        }
    }
];
