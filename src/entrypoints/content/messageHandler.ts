import { getCurrentResolution } from "@/resolution";

export function setupMessageHandler() {
    type ResponseMessage = number | undefined;
    chrome.runtime.onMessage.addListener(
        (
            message: { type: string },
            _sender: chrome.runtime.MessageSender,
            sendResponse: (response: ResponseMessage) => void,
        ) => {
            switch (message.type) {
                case "getCurrentResolution": {
                    void (async () => {
                        const resolution = await getCurrentResolution();
                        sendResponse(resolution);
                    })();
                    return true;
                }
            }
        },
    );
}
