import { onMessage } from "@/messaging";
import { getCurrentResolution } from "@/resolution";

export function setupMessageHandler() {
    onMessage("getCurrentResolution", async () => await getCurrentResolution());
}
