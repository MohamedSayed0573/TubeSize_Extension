import { t } from "@/i18n/t";
import { DirectionProvider } from "@/components/ui/direction";

export function AppProviders({ children }: { children: React.ReactNode }) {
    const direction = t("@@bidi_dir") === "rtl" ? "rtl" : "ltr";
    return <DirectionProvider direction={direction}>{children}</DirectionProvider>;
}
