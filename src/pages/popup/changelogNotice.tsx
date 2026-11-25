import useChangelogNotice from "@hooks/useChangelogNotice";
import { ExternalLink, Sparkles, X } from "lucide-react";

import { t } from "@/i18n/t";

const RELEASES_URL = "https://github.com/MohamedSayed0573/TubeSize_Extension/releases/latest";

export default function ChangelogNotice() {
    const { version, isNewRelease, dismiss } = useChangelogNotice();

    if (!isNewRelease) return null;

    return (
        <output className="flex items-start gap-2 border-b-2 border-white/8 bg-blue-400/12 px-3 py-2 text-xs">
            <Sparkles className="mt-px size-3.5 shrink-0 text-sky-300" aria-hidden="true" />
            <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium text-sky-200">
                    {t("popup_newReleaseTitle", [version])}
                </span>
                <a
                    href={RELEASES_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sky-400 underline-offset-2 transition-colors hover:text-sky-300 hover:underline"
                >
                    {t("popup_newReleaseLink")}
                    <ExternalLink className="size-3 opacity-70" aria-hidden="true" />
                </a>
            </div>
            <button
                type="button"
                onClick={dismiss}
                aria-label={t("popup_dismissNotice")}
                className="ms-auto -me-0.5 shrink-0 rounded p-0.5 text-zinc-400 transition-colors hover:bg-white/8 hover:text-zinc-200"
            >
                <X className="size-3.5" aria-hidden="true" />
            </button>
        </output>
    );
}
