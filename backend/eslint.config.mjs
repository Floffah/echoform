// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    eslint.configs.recommended,
    // tseslint.configs.recommendedTypeChecked,
    {
        rules: {
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    args: "all",
                    argsIgnorePattern: "^_",
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
            "@typescript-eslint/require-await": "off",
            "@typescript-eslint/no-unsafe-enum-comparison": "off",
            "@typescript-eslint/no-misused-promises": "warn",
            "@typescript-eslint/no-unsafe-argument": "warn",
            "@typescript-eslint/await-thenable": "warn",
            "@typescript-eslint/no-unsafe-assignment": "warn",
        },
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
);
