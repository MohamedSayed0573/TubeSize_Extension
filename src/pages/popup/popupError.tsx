import Header from "@pages/popup/header";
import { RefreshCw } from "lucide-react";

import { t } from "@/i18n/t";

export default function PopupError({ error }: { error: unknown }) {
    const routeError = error;
    const message = routeError instanceof Error ? routeError.message : String(routeError);

    return (
        <>
            <Header />
            <div role="alert" className="flex flex-col items-center gap-2.5 px-3 py-3 text-center">
                <div
                    className="flex size-8 items-center justify-center rounded-full bg-red-500/15 text-base text-red-400"
                    aria-hidden="true"
                >
                    ⚠
                </div>
                <div className="text-xs font-semibold text-neutral-100">
                    {t("common_somethingWentWrong")}
                </div>
                <div className="w-full rounded-lg border border-s-3 border-red-400/30 border-s-red-400 bg-red-400/12 p-2.5 text-start text-[11px] break-words text-rose-300">
                    {message}
                </div>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-white/12 bg-white/8 px-2.5 py-1.5 text-xs font-medium text-neutral-100 transition-colors hover:border-white/20 hover:bg-white/15"
                >
                    <RefreshCw className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>{t("common_retry")}</span>
                </button>
            </div>
        </>
    );
}
