export default {
    preset: "ts-jest/presets/default-esm",
    testEnvironment: "node",
    setupFilesAfterEnv: ["jest-extended/all"],
    transform: {
        "^.+\\.tsx?$": [
            "ts-jest",
            {
                useESM: true,
            },
        ],
    },
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
    },
};
