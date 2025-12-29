import eslint from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
	{
		ignores: [
			"eslint.config.js",
			"**/*.snap",
			"coverage",
			"lib",
			"node_modules",
			"pnpm-lock.yaml",
		],
	},
	{ linterOptions: { reportUnusedDisableDirectives: "warn" } },
	{
		extends: [
			eslint.configs.recommended,
			tseslint.configs.recommendedTypeChecked,
			tseslint.configs.stylisticTypeChecked,
		],
		files: ["**/*.{js,ts}"],
		languageOptions: {
			parserOptions: {
				projectService: true,
			},
		},
		rules: {
			"@typescript-eslint/no-unsafe-member-access": "warn",
			"@typescript-eslint/require-await": "warn",
			"@typescript-eslint/no-unsafe-enum-comparison": "off",
			// 未使用变量 - 设为警告
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{
					argsIgnorePattern: "^_", // 以下划线开头的参数忽略
					varsIgnorePattern: "^_", // 以下划线开头的变量忽略
					caughtErrorsIgnorePattern: "^_", // 以下划线开头的 catch 错误忽略
				},
			],
			"@typescript-eslint/restrict-template-expressions": [
				"warn",
				{
					allowAny: true,
					allowNumber: true,
					allowBoolean: true,
					allowNullish: true,
					allowNever: true,
				},
			],
			"@typescript-eslint/no-explicit-any": "warn",
		},
	},
	{
		extends: [vitest.configs.recommended],
		files: ["**/*.test.*"],
		settings: { vitest: { typecheck: true } },
	},
);
