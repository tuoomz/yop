module.exports = {
  overrides: [
    {
      files: "*.sol",
      options: {
        bracketSpacing: false,
        printWidth: 120,
        tabWidth: 2,
        useTabs: false,
        singleQuote: false,
        explicitTypes: "always",
      },
    },
    {
      files: "*.ts",
      options: {
        printWidth: 145,
        semi: true,
        trailingComma: "es5",
      },
    },
    {
      files: "*.js",
      options: {
        printWidth: 145,
        semi: true,
        trailingComma: "es5",
      },
    },
  ],
};
