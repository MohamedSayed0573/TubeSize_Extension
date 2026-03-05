import { getElement } from "./utils";
import CONFIG from "./constants";
import { clearLocalStorage } from "./cache";

function displayOptions() {
    const optionsContainer = getElement("options-grid", true);
    CONFIG.optionIDs.forEach((optionId) => {
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
CONFIG.optionIDs.forEach((option) => {
    getElement(option, false)?.addEventListener("change", (event) => {
        chrome.storage.sync.set({ [option]: (event.target as HTMLInputElement).checked });
    });
});

// Listen to reset cache button click
const resetBtn = getElement("resetCache", false) as HTMLButtonElement | null;
resetBtn?.addEventListener("click", async () => {
    const originalText = resetBtn.textContent;

    const success = await clearLocalStorage();

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
getElement("cacheTTL", false)?.addEventListener("change", (event) => {
    const value = (event.target as HTMLInputElement).value;

    chrome.storage.sync.set({ cacheTTL: CONFIG.ttlInSecondsOptions.get(value) });
});

// Listen to choose API fallback checkbox
getElement("apiFallback", false)?.addEventListener("change", (event) => {
    const checked = (event.target as HTMLInputElement).checked;
    chrome.storage.sync.set({ apiFallback: checked });
});

// Load options from chrome storage when options page is opened
async function loadOptions() {
    const allOptions = await chrome.storage.sync.get();
    // Quality Options
    CONFIG.optionIDs.forEach((optionId) => {
        const checkbox = getElement(optionId, false) as HTMLInputElement;
        if (!checkbox) return;
        checkbox.checked = (allOptions[optionId] as boolean) ?? true;
    });

    // Cache TTL
    const { cacheTTL = CONFIG.DEFAULT_CACHE_TTL } = allOptions as { cacheTTL: number };
    const cacheEl = getElement("cacheTTL", false) as HTMLInputElement | null;
    if (cacheEl && cacheTTL && typeof cacheTTL === "number") {
        const days = cacheTTL / (24 * 60 * 60);
        cacheEl.value = String(days);
    }

    const apiFallbackBtn = getElement("apiFallback", false) as HTMLInputElement | null;
    if (apiFallbackBtn) {
        // read the flag from storage (default to false when missing)
        const { apiFallback = false } = allOptions as {
            apiFallback: boolean;
        };
        apiFallbackBtn.checked = apiFallback;
    }
}
loadOptions();
