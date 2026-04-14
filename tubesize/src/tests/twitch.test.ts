import { getClientId } from "@lib/twitch";
import path from "path";
import fs from "fs";
describe("getClientId", () => {
    test("should extract client ID from Twitch page", async () => {
        const channelName = "hivise";
        const htmlPath = path.join(process.cwd(), "src", "tests", "assets", "twitch.html");
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => fs.readFileSync(htmlPath, "utf-8"),
        });
        const clientId = await getClientId(channelName);
        expect(clientId).toBe("kimne78kx3ncx6brgo4mv6wki5et0ko");
    });
});
