export type WaitForElementOptions<E extends Element> = {
    timeoutMs?: number;
    signal?: AbortSignal;
    root?: Node;
    predicate?: (element: E) => boolean;
};

export function waitForElement<E extends Element = Element>(
    selector: string,
    options: WaitForElementOptions<E> = {},
): Promise<E | undefined> {
    const { timeoutMs = 10_000, signal, root, predicate } = options;

    if (signal?.aborted) {
        return Promise.resolve(undefined);
    }

    const findElement = (): E | undefined => {
        const element = document.querySelector<E>(selector);
        if (!element) return undefined;
        if (predicate && !predicate(element)) return undefined;
        return element;
    };

    const initial = findElement();
    if (initial) {
        return Promise.resolve(initial);
    }

    const observeRoot = root ?? document.documentElement;
    if (!observeRoot) {
        return Promise.resolve(undefined);
    }

    return new Promise<E | undefined>((resolve) => {
        const cleanup = () => {
            observer.disconnect();
            clearTimeout(timeoutId);
            signal?.removeEventListener("abort", onAbort);
        };

        const onAbort = () => {
            cleanup();
            resolve(undefined);
        };

        const observer = new MutationObserver(() => {
            const observedElement = findElement();
            if (!observedElement) return;
            cleanup();
            resolve(observedElement);
        });

        const timeoutId = setTimeout(() => {
            cleanup();
            resolve(findElement());
        }, timeoutMs);

        signal?.addEventListener("abort", onAbort, { once: true });
        observer.observe(observeRoot, {
            childList: true,
            subtree: true,
        });
    });
}
