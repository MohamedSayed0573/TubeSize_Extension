import { describe, expect, test } from "bun:test";

import {
    BUNDLE_BUDGETS,
    type BundleBuildReport,
    type BundlePerfReport,
    evaluateBundleBudgets,
} from "../../scripts/verify/perf";

function makeBuild(
    dir: string,
    overrides?: {
        totalBytes?: number;
        fileBytes?: Record<string, number>;
    },
): BundleBuildReport {
    const fileBytes: Record<string, number> = overrides?.fileBytes ?? {
        "background.js": 700_000,
        "content-scripts/genericObserver.js": 5_000,
        "content-scripts/usageBridge.js": 7_000,
        "content-scripts/content.js": 53_000,
    };
    return {
        dir,
        totalBytes: overrides?.totalBytes ?? 2_830_000,
        fileCount: Object.keys(fileBytes).length,
        categories: {},
        largestFiles: [],
        fileBytes,
    };
}

function makeReport(overrides?: Partial<BundlePerfReport>): BundlePerfReport {
    return {
        chrome: makeBuild(".output/chrome-mv3"),
        firefox: makeBuild(".output/firefox-mv3"),
        ...overrides,
    };
}

describe("BUNDLE_BUDGETS", () => {
    test("defines explicit decimal-SI byte caps for total and critical scripts", () => {
        expect(BUNDLE_BUDGETS.totalBytes).toBe(3_200_000);
        expect(BUNDLE_BUDGETS.files).toEqual({
            "background.js": 800_000,
            "content-scripts/genericObserver.js": 10_000,
            "content-scripts/usageBridge.js": 15_000,
            "content-scripts/content.js": 75_000,
        });
    });
});

describe("evaluateBundleBudgets", () => {
    test("passes when both chrome and firefox builds are within all budgets", () => {
        const result = evaluateBundleBudgets(makeReport());

        expect(result.passed).toBe(true);
        expect(result.missingBuilds).toEqual([]);
        expect(result.failures).toEqual([]);
        expect(result.checks).toHaveLength(10);
        expect(result.checks.every((check) => check.passed)).toBe(true);
    });

    test("passes at exact budget boundaries", () => {
        const atLimit = {
            totalBytes: BUNDLE_BUDGETS.totalBytes,
            fileBytes: { ...BUNDLE_BUDGETS.files },
        };
        const result = evaluateBundleBudgets(
            makeReport({
                chrome: makeBuild(".output/chrome-mv3", atLimit),
                firefox: makeBuild(".output/firefox-mv3", atLimit),
            }),
        );

        expect(result.passed).toBe(true);
        expect(result.failures).toEqual([]);
    });

    test("fails when total build size exceeds the budget", () => {
        const result = evaluateBundleBudgets(
            makeReport({
                firefox: makeBuild(".output/firefox-mv3", {
                    totalBytes: BUNDLE_BUDGETS.totalBytes + 1,
                }),
            }),
        );

        expect(result.passed).toBe(false);
        expect(result.missingBuilds).toEqual([]);
        expect(result.failures).toEqual([
            {
                target: "firefox-mv3",
                metric: "total",
                actualBytes: BUNDLE_BUDGETS.totalBytes + 1,
                budgetBytes: BUNDLE_BUDGETS.totalBytes,
                passed: false,
                reason: "over-budget",
            },
        ]);
    });

    test("fails when a content script exceeds its budget", () => {
        const result = evaluateBundleBudgets(
            makeReport({
                chrome: makeBuild(".output/chrome-mv3", {
                    fileBytes: {
                        "background.js": 700_000,
                        "content-scripts/genericObserver.js": 12_500,
                        "content-scripts/usageBridge.js": 7_000,
                        "content-scripts/content.js": 53_000,
                    },
                }),
            }),
        );

        expect(result.passed).toBe(false);
        expect(result.missingBuilds).toEqual([]);
        expect(result.failures).toEqual([
            {
                target: "chrome-mv3",
                metric: "content-scripts/genericObserver.js",
                actualBytes: 12_500,
                budgetBytes: BUNDLE_BUDGETS.files["content-scripts/genericObserver.js"],
                passed: false,
                reason: "over-budget",
            },
        ]);
    });

    test("reports missing builds cleanly when chrome or firefox build is absent", () => {
        const result = evaluateBundleBudgets(makeReport({ firefox: null }));

        expect(result.passed).toBe(false);
        expect(result.missingBuilds).toEqual(["firefox-mv3"]);
        expect(result.failures).toEqual([
            {
                target: "firefox-mv3",
                metric: "total",
                actualBytes: null,
                budgetBytes: BUNDLE_BUDGETS.totalBytes,
                passed: false,
                reason: "missing-build",
            },
        ]);
    });

    test("reports both builds missing when neither build exists", () => {
        const result = evaluateBundleBudgets({ chrome: null, firefox: null });

        expect(result.passed).toBe(false);
        expect(result.missingBuilds).toEqual(["chrome-mv3", "firefox-mv3"]);
        expect(result.failures).toHaveLength(2);
        expect(result.failures.every((failure) => failure.reason === "missing-build")).toBe(true);
    });

    test("fails when a budgeted file is absent from a build", () => {
        const result = evaluateBundleBudgets(
            makeReport({
                chrome: makeBuild(".output/chrome-mv3", {
                    fileBytes: {
                        "background.js": 700_000,
                        "content-scripts/genericObserver.js": 5_000,
                        "content-scripts/content.js": 53_000,
                    },
                }),
            }),
        );

        expect(result.passed).toBe(false);
        expect(result.missingBuilds).toEqual([]);
        expect(result.failures).toEqual([
            {
                target: "chrome-mv3",
                metric: "content-scripts/usageBridge.js",
                actualBytes: null,
                budgetBytes: BUNDLE_BUDGETS.files["content-scripts/usageBridge.js"],
                passed: false,
                reason: "missing-file",
            },
        ]);
    });
});
