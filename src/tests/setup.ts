// eslint-disable-next-line unicorn/no-global-object-property-assignment
globalThis.chrome = {
    i18n: {
        getUILanguage: () => "en",
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
