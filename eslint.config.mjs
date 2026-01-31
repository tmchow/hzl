import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
  },
  { 
    languageOptions: { 
      globals: globals.node,
      ecmaVersion: 2022,
      sourceType: "module",
    } 
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    }
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"],
  }
];
