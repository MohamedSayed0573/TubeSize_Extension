import DashboardBanner from "@pages/dashboard/overview/dashboardBanner";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { t } from "@/i18n/t";

export default function DashboardErrorPage({ error }: { error: unknown }) {
    const message = error instanceof Error ? error.message : String(error);

    return (
        <div className="flex h-screen flex-col">
            <DashboardBanner />
            <div className="flex flex-1 items-center justify-center overflow-x-clip px-6 py-10">
                <div
                    role="alert"
                    data-error-boundary="true"
                    className="flex w-full max-w-sm flex-col items-center gap-2 text-center"
                >
                    <div
                        className="mb-1 flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/5"
                        aria-hidden="true"
                    >
                        <AlertTriangle className="size-4.5 shrink-0 text-red-400" />
                    </div>
                    <div className="text-sm font-semibold text-neutral-50">
                        {t("common_somethingWentWrong")}
                    </div>
                    <p className="max-w-xs text-xs leading-relaxed text-zinc-400">
                        {t("dashboard_failedToLoadUsage")}
                    </p>
                    <div
                        dir="ltr"
                        className="mt-1 w-full rounded-md border border-white/8 bg-white/4 px-3 py-2.5 text-start font-mono text-xs leading-relaxed break-words text-zinc-300"
                    >
                        {message}
                    </div>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="mt-2 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full border border-transparent bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-950 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
                    >
                        <RefreshCw className="size-3.5 shrink-0" aria-hidden="true" />
                        <span>{t("common_retry")}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
