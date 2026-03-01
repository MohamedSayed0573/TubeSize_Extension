export function extractVideoTag(url: string): string | undefined {
    try {
        const parsedUrl = new URL(url);
        const videoTag = parsedUrl.searchParams.get("v");
        if (!videoTag) return;

        const regex = /^[a-zA-Z0-9_-]{11}$/;
        if (!regex.test(videoTag)) {
            return;
        }
        return videoTag;
    } catch (err) {
        console.error(err);
    }
}

export const optionIDs = ["p144", "p240", "p360", "p480", "p720", "p1080"];

// Load the options page
export async function loadOptions() {
    const options = await chrome.storage.sync.get(optionIDs);
    optionIDs.forEach((optionId) => {
        const checkbox = getElement(optionId, false) as HTMLInputElement;
        if (!checkbox) return;
        checkbox.checked = (options[optionId] as boolean) ?? true;
    });
}

// Return the user options
export async function getOptions() {
    return await chrome.storage.sync.get(optionIDs);
}

export function getElement(id: string, isFatal: true): HTMLElement;
export function getElement(id: string, isFatal?: false): HTMLElement | null;

export function getElement(id: string, isFatal: boolean = false): HTMLElement | null {
    const element = document.getElementById(id);
    if (!element) {
        const message = `[HTML] [${isFatal ? "Fatal" : "Not-Fatal"}] Element #${id} not found`;
        console.error(message);

        if (isFatal) {
            throw new Error(message);
        }
    }
    return element;
}
