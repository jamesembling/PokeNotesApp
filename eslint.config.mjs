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
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-e2e/**",
      "coverage/**",
      "dist/**",
      "out/**",
      "next-env.d.ts"
    ]
  }
];
