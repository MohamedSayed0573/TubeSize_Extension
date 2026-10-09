import { DirectionProvider } from "@/components/ui/direction";

export function AppProviders({ children }: { children: React.ReactNode }) {
    const direction = chrome.i18n.getMessage("@@bidi_dir") === "rtl" ? "rtl" : "ltr";
    return <DirectionProvider direction={direction}>{children}</DirectionProvider>;
}
