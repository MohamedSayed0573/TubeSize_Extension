import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unicorn from "eslint-plugin-unicorn";
import promises from "eslint-plugin-promise";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import pluginQuery from "@tanstack/eslint-plugin-query";

export default defineConfig([
    globalIgnores(["dist", "coverage", "src/components/ui"]),
    {
        files: ["**/*.{ts,tsx}"],
        extends: [
            js.configs.recommended,
            tseslint.configs.recommendedTypeChecked,
            react.configs.flat.recommended,
            react.configs.flat["jsx-runtime"],
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
            unicorn.configs["recommended"],
            promises.configs["flat/recommended"],
            pluginQuery.configs["flat/recommended"],
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
            "unicorn/no-array-sort": "off",
            "unicorn/prefer-top-level-await": "off",
            "@typescript-eslint/no-unnecessary-condition": "error",
            "@typescript-eslint/promise-function-async": "error",
            "unicorn/no-nested-ternary": "off",
            "@typescript-eslint/no-unnecessary-type-assertion": "off",
            "unicorn/name-replacements": "off",
            "unicorn/no-computed-property-existence-check": "off",
            "unicorn/no-null": "off",
            "unicorn/no-top-level-assignment-in-function": "off",
            "unicorn/prefer-switch": "off",
            "unicorn/no-this-outside-of-class": "off",
            "unicorn/prefer-spread": "off",
            "unicorn/prefer-iterator-helpers": "off",
            "unicorn/prefer-await": "off",
            "unicorn/prefer-split-limit": "off",
            "unicorn/prefer-ternary": "off",
            "unicorn/no-useless-else": "off",
            "unicorn/no-break-in-nested-loop": "off",
        },
    },
    {
        files: ["src/tests/**/*.{ts,tsx}"],
        languageOptions: {
            globals: globals.jest,
        },
    },
]);
