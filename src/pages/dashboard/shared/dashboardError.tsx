import DashboardBanner from "@pages/dashboard/overview/dashboardBanner";
import { useTranslation } from "react-i18next";

export default function DashboardErrorPage({ error }: { error: unknown }) {
    const routeError = error;
    const message = routeError instanceof Error ? routeError.message : String(routeError);
    const { t } = useTranslation();
    return (
        <div className="flex h-screen flex-col">
            <DashboardBanner />
            <div className="flex flex-1 items-center justify-center overflow-x-clip bg-neutral-950">
                <div className="flex max-w-md flex-col items-center gap-3 rounded-lg border border-dashed border-red-900 bg-[#221718] px-10 py-8 text-center font-mono">
                    <span className="text-2xl text-red-400">⚠</span>
                    <span className="text-base text-stone-200">
                        {t("common.somethingWentWrong")}
                    </span>
                    <span className="text-xs text-neutral-500">
                        {t("dashboard.failedToLoadUsage")}
                    </span>
                    <div className="rounded border-l-3 border-red-400 bg-red-400/12 p-3 text-left text-xs text-rose-400">
                        {message}
                    </div>
                </div>
            </div>
        </div>
    );
}
