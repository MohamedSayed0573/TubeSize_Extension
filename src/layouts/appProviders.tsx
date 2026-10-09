import { DirectionProvider } from "@/components/ui/direction";

export function AppProviders({ children }: { children: React.ReactNode }) {
    const direction = chrome.i18n.getUILanguage().toLowerCase().startsWith("ar") ? "rtl" : "ltr";
    return <DirectionProvider direction={direction}>{children}</DirectionProvider>;
}
