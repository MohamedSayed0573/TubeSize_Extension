import { getClientId } from "@lib/twitch";
describe("getClientId", () => {
    test("should extract client ID from Twitch page", async () => {
        const channelName = "hivise";
        const clientId = await getClientId(channelName);
        console.log(clientId);
        expect(clientId).toBeDefined();
    });
});
