import { LanguageContext } from "@hooks/useLanguage";
import { useEffect, useLayoutEffect, useState } from "react";

import { DirectionProvider } from "@/components/ui/direction";
import { getLanguage, initializeLanguage, setLanguage, type Language } from "@/i18n/language";

export function AppProviders({ children }: { children: React.ReactNode }) {
    const [language, setCurrentLanguage] = useState(getLanguage);

    const direction = language === "ar" ? "rtl" : "ltr";

    useEffect(() => {
        void initializeLanguage()
            .then(() => setCurrentLanguage(getLanguage()))
            .catch((err: unknown) => console.error("Failed to load language preference", err));
    }, []);

    useLayoutEffect(() => {
        document.documentElement.lang = language;
        document.documentElement.dir = direction;
    }, [language, direction]);

    async function changeLanguage(next: Language) {
        await setLanguage(next);
        setCurrentLanguage(next);
    }

    // Translation calls are not hooks, so remount the UI when its locale changes.
    return (
        <LanguageContext value={{ language, changeLanguage }}>
            <DirectionProvider key={language} direction={direction}>
                {children}
            </DirectionProvider>
        </LanguageContext>
    );
}
