import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettierPlugin from "eslint-plugin-prettier";

export default [
  { ignores: ["dist/**", "node_modules/**"] },

  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      sourceType: "module"
    },
    plugins: {
      "@typescript-eslint": tseslint,
      prettier: prettierPlugin
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "prettier/prettier": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "no-console": ["warn"]
    }
  }
];
