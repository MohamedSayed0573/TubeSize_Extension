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
