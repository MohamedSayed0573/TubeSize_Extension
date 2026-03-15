export default {
    preset: "ts-jest/presets/default-esm",
    testEnvironment: "node",
    extensionsToTreatAsEsm: [".ts", ".tsx"],
    setupFilesAfterEnv: ["jest-extended/all"],
    transform: {
        "^.+\\.(ts|tsx|js)$": [
            "ts-jest",
            {
                useESM: true,
                tsconfig: {
                    target: "ES2022",
                    module: "ESNext",
                    moduleResolution: "bundler",
                    allowImportingTsExtensions: true,
                    esModuleInterop: true,
                    verbatimModuleSyntax: false,
                    types: ["jest", "jest-extended", "node", "vite/client", "chrome"],
                },
            },
        ],
    },
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
    },
};
