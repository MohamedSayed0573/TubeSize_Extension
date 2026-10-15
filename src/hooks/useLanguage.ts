import { createContext, useContext } from "react";
import type { Language } from "@/i18n/language";

export const LanguageContext = createContext<{
    language: Language;
    changeLanguage: (language: Language) => Promise<void>;
} | null>(null);

export default function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) throw new Error("useLanguage must be used within AppProviders");
    return context;
}
