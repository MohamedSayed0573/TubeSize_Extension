import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";

export default function HeaderSettings() {
    const { t } = useTranslation();
    return (
        <div className="flex items-center justify-between border-b border-b-white/8 bg-neutral-900 p-3 pr-5">
            <Link
                className="flex cursor-pointer items-center justify-center gap-1 rounded-md border border-white/12 bg-white/5 px-3 py-2 text-xs text-zinc-100 no-underline transition-all hover:-translate-y-px hover:border-white/25 hover:bg-white/15"
                to="/"
            >
                <ArrowLeft size={16} />
                {t("settings.header.back")}
            </Link>
            <h3 className="text-sm font-semibold">{t("settings.header.title")}</h3>
        </div>
    );
}
