// eslint-disable-next-line unicorn/no-global-object-property-assignment
globalThis.chrome = {
    i18n: {
        getUILanguage: () => "en-US",
        // Jest has no _locales; return "" ("message missing" per chrome.i18n docs).
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
