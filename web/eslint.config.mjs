import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TryStatement[handler] > BlockStatement.block CallExpression[callee.name='requireAuth']",
          message:
            "Call requireAuth() outside try/catch: redirect() throws, and a catch would swallow it.",
        },
        {
          // The API versions (requireApiOrgRole, requireApiOrgResource) return a Response instead
          selector:
            "TryStatement[handler] > BlockStatement.block CallExpression[callee.name=/^(requireOrgRole|requireOrgResource)$/]",
          message:
            "Call requireOrgRole() and requireOrgResource() outside try/catch: redirect(), notFound() and forbidden() throw, and a catch would swallow them.",
        },
        {
          // The API version (requireApiAdmin) returns a Response instead
          selector:
            "TryStatement[handler] > BlockStatement.block CallExpression[callee.name='requireAdmin']",
          message:
            "Call requireAdmin() outside try/catch: redirect() and notFound() throw, and a catch would swallow them.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
