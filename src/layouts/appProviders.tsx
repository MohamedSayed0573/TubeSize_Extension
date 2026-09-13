import { DirectionProvider } from "@/components/ui/direction";
import { useTranslation } from "react-i18next";

export function AppProviders({ children }: { children: React.ReactNode }) {
    const { i18n } = useTranslation();
    return <DirectionProvider direction={i18n.dir()}>{children}</DirectionProvider>;
}
