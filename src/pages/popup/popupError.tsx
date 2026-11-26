import Header from "@pages/popup/header";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { t } from "@/i18n/t";

export default function PopupError({ error }: { error: unknown }) {
    const routeError = error;
    const message = routeError instanceof Error ? routeError.message : String(routeError);

    return (
        <>
            <Header />
            <div
                role="alert"
                className="flex flex-col items-center gap-2 px-3 pt-4 pb-3 text-center"
            >
                <div
                    className="mb-0.5 flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5"
                    aria-hidden="true"
                >
                    <AlertTriangle className="size-3.5 shrink-0 text-red-400" />
                </div>
                <div className="text-[12.5px] font-semibold text-neutral-50">
                    {t("common_somethingWentWrong")}
                </div>
                <div
                    dir="ltr"
                    className="mt-0.5 w-full rounded-md border border-white/8 bg-white/4 px-2.5 py-2 text-start font-mono text-[10px] leading-relaxed break-words text-zinc-300"
                >
                    {message}
                </div>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="mt-1 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full border border-transparent bg-zinc-100 px-3 py-1.5 text-[11px] font-semibold text-zinc-950 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
                >
                    <RefreshCw className="size-3 shrink-0" aria-hidden="true" />
                    <span>{t("common_retry")}</span>
                </button>
            </div>
        </>
    );
}
