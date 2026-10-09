// Thin wrapper around chrome.i18n.getMessage() so call sites stay short.
// Message names are snake_case keys from public/_locales/*/messages.json,
// substitutions map to $1..$9 in order.
// See https://developer.chrome.com/docs/extensions/reference/api/i18n#concepts_and_usage
export function t(messageName: string, substitutions?: string | Array<string | number>): string {
    return chrome.i18n.getMessage(messageName, substitutions);
}
