import { extractYtInitial } from "../youtube";
import path, { dirname } from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("extractYtInitial", () => {
    test("should extract YtInitialPlayerResponse from html page", async () => {
        const htmlPage = await fetch("https://www.youtube.com/watch?v=tKbV6BpH-C8");
        const parsedHtml = await htmlPage.text();

        // ensure the parser doesn’t throw when given real YouTube HTML
        expect(() => extractYtInitial(parsedHtml)).not.toThrow();
    });

    test("should return ytInitialPlayerResponse with the correct properties", () => {
        // Note: youtubePage.html should NOT be formatted using prettier.
        const htmlPage = readFileSync(path.join(__dirname, "assets", "youtubePage.html"), "utf-8");
        const ytInitial = extractYtInitial(htmlPage);

        expect(ytInitial).toHaveProperty("streamingData");
        expect(ytInitial).toHaveProperty("videoDetails");
        expect(ytInitial.streamingData).toHaveProperty("adaptiveFormats");
    });
});
