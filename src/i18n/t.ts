import ar from "../../public/_locales/ar/messages.json";
import en from "../../public/_locales/en/messages.json";
import { getLanguage } from "./language";

export function t(key: string, substitutions: string | Array<string | number> = []): string {
    const messages: Record<string, { message: string }> = getLanguage() === "ar" ? ar : en;
    const message = messages[key]?.message ?? "";
    const values = typeof substitutions === "string" ? [substitutions] : substitutions;

    return message.replaceAll(/\$[1-9]/g, (placeholder) =>
        String(values[Number(placeholder[1]) - 1] ?? ""),
    );
}
