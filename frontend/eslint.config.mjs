import js from '@eslint/js';
import ts from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
export default ts.config(
  { ignores: ['dist/**', 'node_modules/**', '.npm-cache/**', 'artifacts/**', 'coverage/**'] },
  js.configs.recommended, ...ts.configs.recommended, ...vue.configs['flat/essential'],
  { languageOptions: { globals: { ...globals.browser, ...globals.node } }, rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: ts.parser } } },
);
