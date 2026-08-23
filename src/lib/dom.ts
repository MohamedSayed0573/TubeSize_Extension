import {
    PANEL_MENU_SELECTOR,
    QUALITY_MENU_BTN_SELECTOR,
    SETTINGS_BTN_SELECTOR,
} from "@/qualityMenuInjector";

type ElementSelectorMap = {
    video: HTMLVideoElement;
    [PANEL_MENU_SELECTOR]: HTMLDivElement;
    [SETTINGS_BTN_SELECTOR]: HTMLButtonElement;
    [QUALITY_MENU_BTN_SELECTOR]: HTMLDivElement;
};

export async function waitForElement<T extends keyof ElementSelectorMap>(
    selector: T,
    timeout: number = 10_000,
): Promise<ElementSelectorMap[T] | undefined> {
    const findElement = () => document.querySelector<ElementSelectorMap[T]>(selector);

    return new Promise<ElementSelectorMap[T] | undefined>((resolve) => {
        const element = findElement();
        if (element) {
            return resolve(element);
        }

        const observer = new MutationObserver(() => {
            const element = findElement();
            if (element) {
                observer.disconnect();
                clearTimeout(timeoutId);
                return resolve(element);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        const timeoutId = setTimeout(() => {
            observer.disconnect();
            return resolve(findElement() ?? undefined);
        }, timeout);
    });
}
