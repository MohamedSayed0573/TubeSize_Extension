import { DirectionProvider } from "@/components/ui/direction";
import { getAppDirection } from "@/i18n/i18n";

export function AppProviders({ children }: { children: React.ReactNode }) {
    return <DirectionProvider direction={getAppDirection()}>{children}</DirectionProvider>;
}
