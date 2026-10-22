type ElementSelectorMap = {
    video: HTMLVideoElement;
    ".ytp-panel-menu": HTMLDivElement;
    ".ytp-button.ytp-settings-button": HTMLButtonElement;
    ".ytp-settings-menu": HTMLDivElement;
    ".ytp-panel.ytp-quality-menu": HTMLDivElement;
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
            const observedElement = findElement();
            if (!observedElement) {
                return;
            }

            observer.disconnect();
            clearTimeout(timeoutId);
            return resolve(observedElement);
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
