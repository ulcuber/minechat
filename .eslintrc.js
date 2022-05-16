const OFF = 'off';
const WARN = 'warn';
const ERROR = 'error';

module.exports = {
  root: true,
  env: {
    node: true,
  },
  extends: [
    'eslint:recommended',
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 2020,
  },
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? ERROR : OFF,
    'no-debugger': process.env.NODE_ENV === 'production' ? ERROR : OFF,

    // import
    'import/no-commonjs': OFF,
    'global-require': OFF,

    'import/no-unresolved': ERROR,
    'import/no-extraneous-dependencies': ERROR,
    'import/extensions': [
      ERROR,
      'always',
      {
        js: 'never',
      },
    ],

    // airbnb-base
    // eslint-disable-next-line no-magic-numbers
    complexity: [WARN, 11],
    'no-eq-null': ERROR,
    'no-magic-numbers': [ERROR, {
      ignore: [0, -1, 1, 100],
      ignoreArrayIndexes: true,
      enforceConst: true,
      detectObjects: false,
    }],
    'no-param-reassign': [ERROR, {
      props: true,
      ignorePropertyModificationsFor: [
        'state', // for mutation vuex
        'e', // for e.return value
      ],
    }],
  },
};
