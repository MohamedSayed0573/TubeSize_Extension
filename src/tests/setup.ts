// eslint-disable-next-line unicorn/no-global-object-property-assignment
globalThis.chrome = {
    i18n: {
        getUILanguage: () => "en-US",
        // Jest has no _locales; return "" so our t() falls back to the key.
        // Per chrome.i18n docs, "" means "message missing".
        getMessage: () => "",
    },
    storage: {
        local: {
            get: () => {},
            set: () => {},
            remove: () => {},
            clear: () => {},
            onChanged: { addListener: () => {} },
        },
        sync: {
            get: () => {},
            set: () => {},
            remove: () => {},
            clear: () => {},
            onChanged: { addListener: () => {} },
        },
    },
} as unknown as typeof chrome;
