// eslint.config.js
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});


export default defineConfig([
	{
                extends: compat.extends("eslint:recommended"),

                languageOptions: {
                      globals: {
                              ...globals.browser,
                              ...globals.node,
                              ...globals.jest,
                              Atomics: "readonly",
                              SharedArrayBuffer: "readonly",
                              HistoryService: true,
                              Characteristic: true,
                              Service: true,
                      },
                      ecmaVersion: 2018,
                      sourceType: "module",
                },

                files: ["**/*.js"],

		rules: {
                        "global-require": "off",
                        "no-unused-vars": "off",
                        "no-mixed-spaces-and-tabs": "off",
                        "no-fallthrough": "off",
                        "no-unreachable": "off",
                        "no-empty": "off",
                        "no-console": "off",
                        "quotes": "off",
                        "brace-style": "off",
                        "semi": "off",
                        "comma-dangle": "off",
                        "prefer-const": "off",
                        "eqeqeq": "off",
                        "no-extra-semi": "warn",
                        "dot-notation": "warn",
                        "indent": ["error", 2, {
                                "SwitchCase": 1,
                        }],
                        "linebreak-style": ["error", "windows"],
                        "curly": 1,
		},
	},
]);

