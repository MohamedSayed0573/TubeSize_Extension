import { useTranslation } from "@/i18n/i18n";

export function PopupFooter() {
    const { t } = useTranslation();
    return (
        <div className="flex items-center justify-around border-t border-white/8 px-3 pt-2 pb-1">
            <a
                href="https://github.com/MohamedSayed0573/TubeSize_Extension"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-xs text-zinc-500 no-underline transition-colors hover:text-zinc-400"
            >
                <img src="icons/github.svg" width={14} height={14} alt={t("common.githubAlt")} />
                GitHub
            </a>
            <a
                href="https://ko-fi.com/mohamedsayed253"
                target="_blank"
                rel="noreferrer"
                className="flex gap-2 text-xs text-zinc-500 no-underline transition-colors hover:text-zinc-400"
            >
                <img src="icons/support.svg" width={14} height={14} alt={t("common.supportAlt")} />
                {t("common.support")}
            </a>
        </div>
    );
}
