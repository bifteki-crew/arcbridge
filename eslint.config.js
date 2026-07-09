import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // Benchmark corpus fixtures are indexed as test data, not project source —
    // they are deliberately minimal and not part of any lint tsconfig project.
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "**/*.config.ts",
      "**/*.config.js",
      "packages/bench/corpus/",
    ],
  },
);
