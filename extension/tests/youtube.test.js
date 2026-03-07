import { extractYtInitial } from "../youtube";

describe("extractYtInitial", () => {
    test("should extract YtInitialPlayerResponse from html page", async () => {
        const htmlPage = await fetch("https://www.youtube.com/watch?v=tKbV6BpH-C8");
        const parsedHtml = await htmlPage.text();

        // ensure the parser doesn’t throw when given real YouTube HTML
        expect(() => extractYtInitial(parsedHtml)).not.toThrow();
    });
});
