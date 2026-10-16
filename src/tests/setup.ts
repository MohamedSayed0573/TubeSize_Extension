// Bun test preload (see bunfig.toml [test] preload).
// Provides a minimal chrome mock; individual test files may override storage.
// eslint-disable-next-line unicorn/no-global-object-property-assignment
globalThis.chrome = {
    i18n: {
        getUILanguage: () => "en-US",
        // Bun has no _locales; return "" ("message missing" per chrome.i18n docs).
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
