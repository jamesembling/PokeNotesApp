import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off"
    }
  },
  {
    // CommonJS files can only load their dependencies with require().
    files: ["**/*.cjs", "next.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  },
  {
    ignores: [
      "node_modules/**",
      ".claude/worktrees/**",
      ".next/**",
      ".next-e2e/**",
      "coverage/**",
      "dist/**",
      "out/**",
      "next-env.d.ts"
    ]
  }
];
