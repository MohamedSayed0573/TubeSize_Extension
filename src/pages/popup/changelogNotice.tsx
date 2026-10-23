import { lastSeenVersion } from "@lib/storage";
import { ExternalLink, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import { t } from "@/i18n/t";

const RELEASES_URL = "https://github.com/MohamedSayed0573/TubeSize_Extension/releases/latest";

/**
 * Banner pointing users at the release notes for a version they just updated
 * to. It renders only when the stored version differs from the running one, so
 * a fresh install (or an unchanged version) stays quiet.
 */
export default function ChangelogNotice() {
    const version = chrome.runtime.getManifest().version;
    const [isNewRelease, setIsNewRelease] = useState(false);

    useEffect(() => {
        let active = true;

        async function checkVersion() {
            try {
                const seenVersion = await lastSeenVersion.getValue();
                if (!active) return;

                if (seenVersion === null) {
                    // First run with changelog tracking: seed the stored version
                    // instead of announcing a fresh install as an update.
                    await lastSeenVersion.setValue(version);
                    return;
                }

                setIsNewRelease(seenVersion !== version);
            } catch (err) {
                console.error("Failed to check the last seen version", err);
            }
        }

        void checkVersion();

        return () => {
            active = false;
        };
    }, [version]);

    if (!isNewRelease) return null;

    function dismiss() {
        setIsNewRelease(false);
        void lastSeenVersion
            .setValue(version)
            .catch((err: unknown) => console.error("Failed to save the last seen version", err));
    }

    return (
        <div
            role="status"
            className="flex items-start gap-2 border-b-2 border-white/8 bg-blue-400/12 px-3 py-2 text-xs"
        >
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
                className="ms-auto -me-0.5 shrink-0 rounded p-0.5 text-zinc-400 transition-colors hover:bg-white/8 hover:text-zinc-200"
            >
                <X className="size-3.5" aria-hidden="true" />
            </button>
        </div>
    );
}
