import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
    BUNDLE_BUDGETS,
    type BundleBuildReport,
    type BundlePerfReport,
    evaluateBundleBudgets,
    measureBundle,
} from "../../scripts/verify/perf";

const DEFAULT_MANIFEST_CONTENT_SCRIPTS = [
    "content-scripts/content.js",
    "content-scripts/genericObserver.js",
    "content-scripts/usageBridge.js",
];

function makeBuild(
    dir: string,
    overrides?: {
        totalBytes?: number;
        fileBytes?: Record<string, number>;
        manifestContentScripts?: string[] | null;
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
        manifestContentScripts:
            overrides && "manifestContentScripts" in overrides
                ? (overrides.manifestContentScripts ?? null)
                : [...DEFAULT_MANIFEST_CONTENT_SCRIPTS],
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
    test("defines explicit decimal-SI byte caps for total, manifest content scripts, and critical scripts", () => {
        expect(BUNDLE_BUDGETS.totalBytes).toBe(3_200_000);
        expect(BUNDLE_BUDGETS.contentScriptsTotalBytes).toBe(80_000);
        expect(BUNDLE_BUDGETS.files).toEqual({
            "background.js": 800_000,
            "content-scripts/genericObserver.js": 8_000,
            "content-scripts/usageBridge.js": 10_000,
            "content-scripts/content.js": 65_000,
        });
    });
});

describe("evaluateBundleBudgets", () => {
    test("passes when both chrome and firefox builds are within all budgets", () => {
        const result = evaluateBundleBudgets(makeReport());

        expect(result.passed).toBe(true);
        expect(result.missingBuilds).toEqual([]);
        expect(result.failures).toEqual([]);
        expect(result.checks).toHaveLength(12);
        expect(result.checks.every((check) => check.passed)).toBe(true);
    });

    test("passes at exact budget boundaries", () => {
        const atLimit = {
            totalBytes: BUNDLE_BUDGETS.totalBytes,
            fileBytes: {
                "background.js": BUNDLE_BUDGETS.files["background.js"],
                "content-scripts/genericObserver.js":
                    BUNDLE_BUDGETS.files["content-scripts/genericObserver.js"],
                "content-scripts/usageBridge.js":
                    BUNDLE_BUDGETS.files["content-scripts/usageBridge.js"],
                "content-scripts/content.js": 62_000,
            },
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

    test("fails when combined manifest content_scripts total exceeds contentScriptsTotalBytes even if each file is under its cap", () => {
        const result = evaluateBundleBudgets(
            makeReport({
                chrome: makeBuild(".output/chrome-mv3", {
                    fileBytes: {
                        "background.js": 700_000,
                        "content-scripts/genericObserver.js": 8_000,
                        "content-scripts/usageBridge.js": 10_000,
                        "content-scripts/content.js": 65_000,
                    },
                }),
            }),
        );

        expect(result.passed).toBe(false);
        expect(result.failures).toEqual([
            {
                target: "chrome-mv3",
                metric: "manifest:content_scripts",
                actualBytes: 83_000,
                budgetBytes: BUNDLE_BUDGETS.contentScriptsTotalBytes,
                passed: false,
                reason: "over-budget",
            },
        ]);
    });

    test("fails when manifest.json declares an unbudgeted content script JS or CSS asset", () => {
        const result = evaluateBundleBudgets(
            makeReport({
                chrome: makeBuild(".output/chrome-mv3", {
                    fileBytes: {
                        "background.js": 700_000,
                        "content-scripts/genericObserver.js": 5_000,
                        "content-scripts/usageBridge.js": 7_000,
                        "content-scripts/content.js": 53_000,
                        "content-scripts/content.css": 1_200,
                    },
                    manifestContentScripts: [
                        ...DEFAULT_MANIFEST_CONTENT_SCRIPTS,
                        "content-scripts/content.css",
                    ],
                }),
            }),
        );

        expect(result.passed).toBe(false);
        expect(result.failures).toEqual([
            {
                target: "chrome-mv3",
                metric: "content-scripts/content.css",
                actualBytes: 1_200,
                budgetBytes: 0,
                passed: false,
                reason: "unbudgeted-content-script",
            },
        ]);
    });

    test("fails when an unbudgeted file exists on disk under content-scripts/", () => {
        const result = evaluateBundleBudgets(
            makeReport({
                firefox: makeBuild(".output/firefox-mv3", {
                    fileBytes: {
                        "background.js": 700_000,
                        "content-scripts/genericObserver.js": 5_000,
                        "content-scripts/usageBridge.js": 7_000,
                        "content-scripts/content.js": 53_000,
                        "content-scripts/extra.js": 2_500,
                    },
                }),
            }),
        );

        expect(result.passed).toBe(false);
        expect(result.failures).toEqual([
            {
                target: "firefox-mv3",
                metric: "content-scripts/extra.js",
                actualBytes: 2_500,
                budgetBytes: 0,
                passed: false,
                reason: "unbudgeted-content-script",
            },
        ]);
    });

    test("fails when manifest.json content_scripts metadata is missing or invalid", () => {
        const result = evaluateBundleBudgets(
            makeReport({
                chrome: makeBuild(".output/chrome-mv3", {
                    manifestContentScripts: null,
                }),
            }),
        );

        expect(result.passed).toBe(false);
        expect(result.failures).toEqual([
            {
                target: "chrome-mv3",
                metric: "manifest:content_scripts",
                actualBytes: null,
                budgetBytes: BUNDLE_BUDGETS.contentScriptsTotalBytes,
                passed: false,
                reason: "invalid-manifest",
            },
        ]);
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

    test("measures small budgeted scripts from disk even when crowded out of largestFiles", () => {
        const tmpRoot = mkdtempSync(join(tmpdir(), "tubesize-bundle-"));
        try {
            const writeSizedFile = (relPath: string, bytes: number) => {
                const absPath = join(tmpRoot, relPath);
                mkdirSync(dirname(absPath), { recursive: true });
                writeFileSync(absPath, Buffer.alloc(bytes));
            };

            for (const target of ["chrome-mv3", "firefox-mv3"] as const) {
                const base = `.output/${target}`;
                for (let i = 0; i < 9; i++) {
                    writeSizedFile(`${base}/chunks/large-${i}.js`, 30_000 + i * 100);
                }
                writeSizedFile(`${base}/background.js`, 40_000);
                writeSizedFile(`${base}/content-scripts/content.js`, 25_000);
                writeSizedFile(`${base}/content-scripts/usageBridge.js`, 7_000);
                writeSizedFile(
                    `${base}/content-scripts/genericObserver.js`,
                    target === "chrome-mv3" ? 9_000 : 5_000,
                );
                const manifestAbsPath = join(tmpRoot, `${base}/manifest.json`);
                mkdirSync(dirname(manifestAbsPath), { recursive: true });
                writeFileSync(
                    manifestAbsPath,
                    JSON.stringify({
                        manifest_version: 3,
                        content_scripts: [
                            { js: ["content-scripts/content.js"] },
                            { js: ["content-scripts/genericObserver.js"] },
                            { js: ["content-scripts/usageBridge.js"] },
                        ],
                    }),
                );
            }

            const report = measureBundle(tmpRoot);
            expect(
                report.chrome?.largestFiles.some(
                    (entry) => entry.path === "content-scripts/genericObserver.js",
                ),
            ).toBe(false);
            expect(report.chrome?.fileBytes["content-scripts/genericObserver.js"]).toBe(9_000);
            expect(report.firefox?.fileBytes["content-scripts/genericObserver.js"]).toBe(5_000);
            expect(report.chrome?.manifestContentScripts).toEqual(DEFAULT_MANIFEST_CONTENT_SCRIPTS);

            const result = evaluateBundleBudgets(report);
            expect(result.passed).toBe(false);
            expect(result.failures).toEqual([
                {
                    target: "chrome-mv3",
                    metric: "content-scripts/genericObserver.js",
                    actualBytes: 9_000,
                    budgetBytes: BUNDLE_BUDGETS.files["content-scripts/genericObserver.js"],
                    passed: false,
                    reason: "over-budget",
                },
            ]);
        } finally {
            rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    test("rejects malformed or missing manifest.json content_scripts entries on disk and detects manifest CSS assets", () => {
        const tmpRoot = mkdtempSync(join(tmpdir(), "tubesize-manifest-"));
        try {
            const writeBuildFiles = (target: "chrome-mv3" | "firefox-mv3", manifest?: string) => {
                const base = `.output/${target}`;
                const writeFile = (relPath: string, content: string | Buffer) => {
                    const absPath = join(tmpRoot, `${base}/${relPath}`);
                    mkdirSync(dirname(absPath), { recursive: true });
                    writeFileSync(absPath, content);
                };
                writeFile("background.js", Buffer.alloc(40_000));
                writeFile("content-scripts/content.js", Buffer.alloc(25_000));
                writeFile("content-scripts/usageBridge.js", Buffer.alloc(7_000));
                writeFile("content-scripts/genericObserver.js", Buffer.alloc(5_000));
                if (manifest !== undefined) {
                    writeFile("manifest.json", manifest);
                }
            };

            const validManifest = JSON.stringify({
                manifest_version: 3,
                content_scripts: [
                    { js: ["content-scripts/content.js"] },
                    { js: ["content-scripts/genericObserver.js"] },
                    { js: ["content-scripts/usageBridge.js"] },
                ],
            });

            writeBuildFiles("firefox-mv3", validManifest);

            for (const malformedManifest of [
                JSON.stringify({ manifest_version: 3, content_scripts: [] }),
                JSON.stringify({ manifest_version: 3, content_scripts: [{}] }),
                JSON.stringify({ manifest_version: 3, content_scripts: [[]] }),
                JSON.stringify({ manifest_version: 3, content_scripts: [{ js: [] }] }),
                "{not-json",
            ]) {
                writeBuildFiles("chrome-mv3", malformedManifest);
                const report = measureBundle(tmpRoot);
                expect(report.chrome?.manifestContentScripts).toBeNull();
                const evaluation = evaluateBundleBudgets(report);
                expect(evaluation.passed).toBe(false);
                expect(evaluation.failures).toEqual([
                    {
                        target: "chrome-mv3",
                        metric: "manifest:content_scripts",
                        actualBytes: null,
                        budgetBytes: BUNDLE_BUDGETS.contentScriptsTotalBytes,
                        passed: false,
                        reason: "invalid-manifest",
                    },
                ]);
            }

            // Manifest declaring an unbudgeted CSS file on disk
            writeBuildFiles(
                "chrome-mv3",
                JSON.stringify({
                    manifest_version: 3,
                    content_scripts: [
                        {
                            js: ["content-scripts/content.js"],
                            css: ["./content-scripts/content.css"],
                        },
                        { js: ["content-scripts/genericObserver.js"] },
                        { js: ["content-scripts/usageBridge.js"] },
                    ],
                }),
            );
            writeFileSync(
                join(tmpRoot, ".output/chrome-mv3/content-scripts/content.css"),
                Buffer.alloc(1_500),
            );

            const cssReport = measureBundle(tmpRoot);
            expect(cssReport.chrome?.manifestContentScripts).toContain(
                "content-scripts/content.css",
            );
            const cssEvaluation = evaluateBundleBudgets(cssReport);
            expect(cssEvaluation.passed).toBe(false);
            expect(cssEvaluation.failures).toEqual([
                {
                    target: "chrome-mv3",
                    metric: "content-scripts/content.css",
                    actualBytes: 1_500,
                    budgetBytes: 0,
                    passed: false,
                    reason: "unbudgeted-content-script",
                },
            ]);
        } finally {
            rmSync(tmpRoot, { recursive: true, force: true });
        }
    });
});
