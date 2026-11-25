import { Window } from "happy-dom";

const DOM_GLOBALS = [
    "window",
    "document",
    "location",
    "Node",
    "Element",
    "HTMLElement",
    "HTMLVideoElement",
    "Text",
    "DocumentFragment",
    "Event",
    "CustomEvent",
    "MutationObserver",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "IS_REACT_ACT_ENVIRONMENT",
] as const;

export function installDomEnv(
    url = "https://www.youtube.com/watch?v=I82j7AzMU80",
): () => Promise<void> {
    const win = new Window({ url });
    const previousDescriptors = new Map<string, PropertyDescriptor | undefined>();

    for (const key of DOM_GLOBALS) {
        previousDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    }

    const bindings: Record<(typeof DOM_GLOBALS)[number], unknown> = {
        window: win,
        document: win.document,
        location: win.location,
        Node: win.Node,
        Element: win.Element,
        HTMLElement: win.HTMLElement,
        HTMLVideoElement: win.HTMLVideoElement,
        Text: win.Text,
        DocumentFragment: win.DocumentFragment,
        Event: win.Event,
        CustomEvent: win.CustomEvent,
        MutationObserver: win.MutationObserver,
        requestAnimationFrame: win.requestAnimationFrame.bind(win),
        cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
        IS_REACT_ACT_ENVIRONMENT: true,
    };

    for (const key of DOM_GLOBALS) {
        Object.defineProperty(globalThis, key, {
            value: bindings[key],
            configurable: true,
            writable: true,
        });
    }

    return async () => {
        for (const [key, descriptor] of previousDescriptors) {
            if (descriptor) {
                Object.defineProperty(globalThis, key, descriptor);
            } else {
                Reflect.deleteProperty(globalThis, key);
            }
        }
        await win.happyDOM.close();
    };
}
