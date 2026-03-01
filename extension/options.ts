import { loadOptions, optionIDs, getElement } from "./utils";

// If changes in options, update chrome storage
optionIDs.forEach((option) => {
    getElement(option, false)?.addEventListener("change", (event) => {
        chrome.storage.sync.set({ [option]: (event.target as HTMLInputElement).checked });
    });
});

loadOptions();
