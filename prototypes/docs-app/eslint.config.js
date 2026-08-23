import globals from 'globals';

export default [
  {
    ignores: ['dist/**'],
  },
  {
    files: ['src/**/*.{js,jsx}', 'scripts/**/*.mjs', 'tests/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {ecmaFeatures: {jsx: true}},
      globals: {...globals.browser, ...globals.node},
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-constant-binary-expression': 'error'
    }
  }
];
