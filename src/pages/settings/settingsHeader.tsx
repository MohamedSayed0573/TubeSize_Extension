import { t } from "@/i18n/t";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

export default function SettingsHeader() {
    return (
        <div className="flex items-center justify-between border-b border-b-white/8 bg-neutral-900 p-3">
            <h3 className="text-base font-semibold">{t("settings_header_title")}</h3>
            <Link
                className="flex cursor-pointer items-center justify-center gap-1 rounded-md border border-white/12 bg-white/5 px-3 py-2 text-xs text-zinc-100 no-underline transition-all hover:-translate-y-px hover:border-white/25 hover:bg-white/15"
                to="/"
            >
                {t("settings_header_back")}
                <ArrowRight size={16} className="rtl:rotate-180" />
            </Link>
        </div>
    );
}
