import js from '@eslint/js';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';

export default [
    { ignores: ['node_modules/**', 'test/**'] },
    js.configs.recommended,
    {
        files: ['**/*.js', 'bin/www'],
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'commonjs',
            globals: { ...globals.browser, ...globals.node },
        },
        plugins: { '@stylistic': stylistic },
        rules: {
            '@stylistic/indent': ['error', 4],
            '@stylistic/quotes': ['error', 'single'],
            '@stylistic/semi': ['error', 'always'],
            eqeqeq: ['error', 'always'],
            'func-names': 'error',
            'no-await-in-loop': 'error',
            'no-console': 'off',
            'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
            'no-param-reassign': ['error', {
                props: true,
                ignorePropertyModificationsFor: ['socket', 'start', 'end'],
            }],
        },
    },
];
