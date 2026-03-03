import { optionIDs, getElement } from "./utils";
import { clearStorage } from "./cache";

function displayOptions() {
    const optionsContainer = getElement("options-grid", true);
    optionIDs.forEach((optionId) => {
        const label = document.createElement("label");
        label.className = "option-item";

        const input = document.createElement("input") as HTMLInputElement;
        input.type = "checkbox";
        input.id = optionId;

        const span = document.createElement("span");
        span.className = "option-label";
        span.textContent = optionId.substring(1) + "p";

        label.appendChild(input);
        label.appendChild(span);

        optionsContainer.appendChild(label);
    });
}
displayOptions();

// Listen to changes in options and update chrome storage
optionIDs.forEach((option) => {
    getElement(option, false)?.addEventListener("change", (event) => {
        chrome.storage.sync.set({ [option]: (event.target as HTMLInputElement).checked });
    });
});

// Listen to reset cache button click
const resetBtn = getElement("resetCache", false) as HTMLButtonElement | null;
resetBtn?.addEventListener("click", async () => {
    const originalText = resetBtn.textContent;

    const success = await clearStorage();

    if (success) {
        resetBtn.textContent = "Cache Cleared!";
        resetBtn.style.color = "#40c057";
        resetBtn.style.borderColor = "rgba(64, 192, 87, 0.4)";
        resetBtn.style.background = "rgba(64, 192, 87, 0.08)";
    } else {
        resetBtn.textContent = "Failed to clear";
        resetBtn.style.color = "#ff6b6b";
    }

    setTimeout(() => {
        resetBtn.textContent = originalText;
        resetBtn.style.color = "";
        resetBtn.style.borderColor = "";
        resetBtn.style.background = "";
    }, 2000);
});

// Listen to choose Cache TTL option
const ttlInSeconds: Map<string, number> = new Map([
    ["1", 1 * 24 * 60 * 60],
    ["3", 3 * 24 * 60 * 60],
    ["7", 7 * 24 * 60 * 60],
]);
getElement("cacheTTL", false)?.addEventListener("change", (event) => {
    const value = (event.target as HTMLInputElement).value;

    chrome.storage.sync.set({ cacheTTL: ttlInSeconds.get(value) });
});

// Load options from chrome storage when options page is opened
async function loadOptions() {
    // Quality Options
    const options = await chrome.storage.sync.get(optionIDs);
    optionIDs.forEach((optionId) => {
        const checkbox = getElement(optionId, false) as HTMLInputElement;
        if (!checkbox) return;
        checkbox.checked = (options[optionId] as boolean) ?? true;
    });

    // Cache TTL
    const { cacheTTL = 3 * 24 * 60 * 60 } = await chrome.storage.sync.get("cacheTTL");
    const cacheEl = getElement("cacheTTL", false) as HTMLInputElement | null;
    if (cacheEl && cacheTTL && typeof cacheTTL === "number") {
        const days = cacheTTL / (24 * 60 * 60);
        cacheEl.value = String(days);
    }
}

loadOptions();
