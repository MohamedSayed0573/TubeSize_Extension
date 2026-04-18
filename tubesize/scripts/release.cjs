const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const versionNumber = process.argv[2];
if (!versionNumber) {
    console.error("Usage: pnpm run release -- <version>");
    process.exit(1);
}
if (!/^\d+\.\d+\.\d+$/.test(versionNumber)) {
    console.error("Version must be in the format x.y.z");
    process.exit(1);
}
const fullVersion = `extension-v${versionNumber}`;

function checkGitClean() {
    try {
        execFileSync("git", ["diff", "--quiet"]);
        execFileSync("git", ["diff", "--cached", "--quiet"]);
    } catch {
        console.error("Git working directory is not clean. Please commit or stash your changes.");
        process.exit(1);
    }
}

function gitCommit() {
    execFileSync("git", ["add", "package.json", "manifest.json"], { stdio: "inherit" });
    execFileSync("git", ["commit", "-m", `Release ${fullVersion}`], { stdio: "inherit" });
}

function createGitTag() {
    execFileSync("git", ["tag", fullVersion]);
    console.log(
        `Created git tag ${fullVersion}. Run 'git push origin ${fullVersion}' to push it to remote.`,
    );
}
function tagExistsLocally(tagName) {
    try {
        execFileSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tagName}`], {
            stdio: "ignore",
        });
        return true;
    } catch {
        return false;
    }
}
function tagExistsOnRemote(tagName) {
    try {
        const output = execFileSync(
            "git",
            ["ls-remote", "--tags", "origin", `refs/tags/${tagName}`],
            { encoding: "utf8" },
        ).trim();
        return output.length > 0;
    } catch {
        return false;
    }
}
function updateJsonVersion(filePath) {
    const json = fs.readFileSync(filePath, { encoding: "utf-8" });
    const data = JSON.parse(json);
    data.version = versionNumber;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4), { encoding: "utf-8" });
}
function pack() {
    execFileSync("pnpm", ["run", "pack:firefox"], { stdio: "inherit" });
    execFileSync("pnpm", ["run", "pack"], { stdio: "inherit" });
}
function main() {
    if (tagExistsLocally(fullVersion)) {
        console.error(`Tag ${fullVersion} already exists locally. Please delete it first.`);
        process.exit(1);
    }
    if (tagExistsOnRemote(fullVersion)) {
        console.error(`Tag ${fullVersion} already exists on remote. Please delete it first.`);
        process.exit(1);
    }
    checkGitClean();
    updateJsonVersion(path.join(__dirname, "..", "manifest.json"));
    updateJsonVersion(path.join(__dirname, "..", "package.json"));
    gitCommit();
    pack();
    createGitTag();
}
main();
