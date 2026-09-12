import { useTranslation } from "react-i18next";

export function SettingsFooter() {
    const { t } = useTranslation();
    return (
        <div className="flex items-center justify-around p-3">
            <div>
                <a
                    href="https://github.com/MohamedSayed0573/TubeSize_Extension"
                    target="_blank"
                    rel="noreferrer"
                    className="flex gap-2 text-xs text-zinc-500 no-underline transition-colors hover:text-zinc-400"
                >
                    <img
                        src="icons/github.svg"
                        width={14}
                        height={14}
                        alt={t("settings.footer.githubAlt")}
                    />
                    @Mohamed Sayed
                </a>
            </div>
            <div>
                <a
                    href="https://ko-fi.com/mohamedsayed253"
                    target="_blank"
                    rel="noreferrer"
                    className="flex gap-2 text-xs text-zinc-500 no-underline transition-colors hover:text-zinc-400"
                >
                    <img
                        src="icons/support.svg"
                        width={14}
                        height={14}
                        alt={t("settings.footer.supportAlt")}
                    />
                    {t("settings.footer.support")}
                </a>
            </div>
        </div>
    );
}
