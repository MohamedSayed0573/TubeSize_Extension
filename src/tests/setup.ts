// WXT's recommended way to mock extension APIs outside Vitest is to install
// `@webext-core/fake-browser` as the global `chrome` object. It provides an
// in-memory implementation of `runtime`, `storage`, and most other APIs used by
// `@wxt-dev/storage` and `@webext-core/messaging`.
import { beforeEach } from "bun:test";

import { fakeBrowser } from "@webext-core/fake-browser";
import "fake-indexeddb/auto";

function installI18nStubs() {
    fakeBrowser.i18n.getUILanguage = () => "en-US";
    fakeBrowser.i18n.getMessage = () => "";
}

installI18nStubs();

// eslint-disable-next-line unicorn/no-global-object-property-assignment
globalThis.chrome = fakeBrowser as unknown as typeof chrome;

beforeEach(() => {
    fakeBrowser.reset();
    installI18nStubs();
});
