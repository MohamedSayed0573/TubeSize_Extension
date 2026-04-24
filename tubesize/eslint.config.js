import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unicorn from "eslint-plugin-unicorn";
import promises from "eslint-plugin-promise";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
    globalIgnores(["dist", "coverage"]),
    {
        files: ["**/*.{ts,tsx}"],
        extends: [
            js.configs.recommended,
            tseslint.configs.recommendedTypeChecked,
            react.configs.flat.recommended,
            react.configs.flat["jsx-runtime"],
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
            unicorn.configs["flat/recommended"],
            promises.configs["flat/recommended"],
        ],
        languageOptions: {
            ecmaVersion: "latest",
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        settings: {
            react: {
                version: "19.2.5",
            },
        },
        rules: {
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-empty-object-type": "off",
            "no-empty": "off",
            radix: "error",
            "unicorn/catch-error-name": ["error", { name: "err" }],
            "unicorn/prevent-abbreviations": "off",
            "unicorn/filename-case": [
                "error",
                {
                    case: "camelCase",
                },
            ],
        },
    },
    {
        files: ["src/tests/**/*.{ts,tsx}"],
        languageOptions: {
            globals: globals.jest,
        },
    },
]);
