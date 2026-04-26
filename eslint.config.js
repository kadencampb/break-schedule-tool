import js from '@eslint/js';
import security from 'eslint-plugin-security';

export default [
    js.configs.recommended,
    security.configs.recommended,
    {
        rules: {
            'no-console': 'warn',
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'eqeqeq': 'error',
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'security/detect-non-literal-fs-filename': 'off'
        }
    }
];
