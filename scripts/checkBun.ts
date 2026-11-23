// TODO: Update this file once Bun ships the built-in `bun lint` command in a
// stable release (drop the canary requirement and switch upgrade hints from
// `bun upgrade --canary` to `bun upgrade`).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface PackageJson {
    packageManager?: string;
}

const pkgPath = resolve(import.meta.dir, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJson;
const expectedRaw = pkg.packageManager?.startsWith("bun@") ? pkg.packageManager.slice(4) : null;
const expectedBase = expectedRaw?.split("-")[0] ?? null;

const help = Bun.spawnSync([process.execPath, "--help"], {
    stdout: "pipe",
    stderr: "pipe",
});
const helpText = help.stdout.toString();

if (!/^\s+lint\s+/m.test(helpText)) {
    console.error(
        `TubeSize requires Bun canary with built-in "bun lint" (found Bun ${Bun.version}). Run: bun upgrade --canary`,
    );
    process.exit(1);
}

if (expectedBase && Bun.semver.order(Bun.version, expectedBase) < 0) {
    console.error(
        `Warning: Bun ${Bun.version} is older than ${expectedRaw} in package.json. Run: bun upgrade --canary`,
    );
}
