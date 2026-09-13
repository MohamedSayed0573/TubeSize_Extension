// i18n registers a chrome.storage.onChanged listener at import time, so every
// suite that transitively imports @lib/utils evaluates chrome code in a node
// environment. Suites that exercise storage replace this stub with their own
// mock (see cache.test.ts).
const noop = () => {};

// eslint-disable-next-line unicorn/no-global-object-property-assignment
globalThis.chrome = {
    storage: {
        local: {
            get: noop,
            set: noop,
            remove: noop,
            clear: noop,
            onChanged: { addListener: noop },
        },
        sync: {
            get: noop,
            set: noop,
            remove: noop,
            clear: noop,
            onChanged: { addListener: noop },
        },
    },
} as unknown as typeof chrome;
