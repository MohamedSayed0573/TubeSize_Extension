import ar from "../../public/_locales/ar/messages.json";
import en from "../../public/_locales/en/messages.json";
import { getLanguage, type Language } from "./language";

export type MessageKey = keyof typeof en | keyof typeof ar;

export type PluralMessagePrefix = {
    [K in MessageKey]: K extends `${infer Prefix}_other` ? Prefix : never;
}[MessageKey];

type MessageCatalog = Partial<Record<MessageKey, { readonly message: string }>>;

const CATALOGS: Record<Language, MessageCatalog> = { en, ar };

function isMessageKey(key: string): key is MessageKey {
    return Object.hasOwn(en, key) || Object.hasOwn(ar, key);
}

function formatMessage(message: string, substitutions: string | Array<string | number>): string {
    const values = typeof substitutions === "string" ? [substitutions] : substitutions;
    return message.replaceAll(/\$[1-9]/g, (placeholder) =>
        String(values[Number(placeholder[1]) - 1] ?? ""),
    );
}

export function t(key: MessageKey, substitutions: string | Array<string | number> = []): string {
    const message = CATALOGS[getLanguage()][key]?.message ?? "";
    return formatMessage(message, substitutions);
}

export function tPlural(
    prefix: PluralMessagePrefix,
    count: number,
    substitutions: string | Array<string | number> = [],
): string {
    const lang = getLanguage();
    const rule = new Intl.PluralRules(lang).select(count);
    const candidate = `${prefix}_${rule}`;
    const catalog = CATALOGS[lang];
    const message =
        (isMessageKey(candidate) ? catalog[candidate]?.message : undefined) ||
        catalog[`${prefix}_other`]?.message ||
        "";
    return formatMessage(message, substitutions);
}
