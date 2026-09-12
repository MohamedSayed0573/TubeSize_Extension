import { useTranslation } from "react-i18next";

export default function NoUsageData() {
    const { t } = useTranslation();
    return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-white/8 bg-[#1d1d1d] p-8">
            <div className="flex w-full max-w-lg flex-col items-center gap-3 rounded-lg border border-dashed border-neutral-700 bg-neutral-900 px-10 py-8 font-mono text-teal-400">
                <img
                    className="h-10 w-10 opacity-60"
                    src="/icons/icon-32.png"
                    alt="Dashboard Icon"
                />
                <span className="text-base">{t("dashboard.noUsage")}</span>
                <span className="text-xs text-neutral-500">{t("dashboard.startVisiting")}</span>
            </div>
        </div>
    );
}
