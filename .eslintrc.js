module.exports = {
  env: {
    browser: false,
    es2021: true,
    mocha: true,
    node: true,
  },
  plugins: ["@typescript-eslint"],
  extends: ["standard", "eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:prettier/recommended"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 12,
  },
  rules: {
    "node/no-unsupported-features/es-syntax": ["warn", { ignores: ["modules"] }],
    "node/no-unpublished-import": "off",
    // this is not ideal as it duplicates configs in prettierrc, but it helps clear the errors in VSCode.
    // `usePrettierrc` doesn't work for some reason.
    "prettier/prettier": ["error", { printWidth: 145 }],
  },
};
