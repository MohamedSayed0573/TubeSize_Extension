import DashboardBanner from "@pages/dashboard/overview/dashboardBanner";
import { ArrowLeft } from "lucide-react";
import ButtonLink from "@components/buttonLink";
import { useTranslation } from "react-i18next";

export default function DashboardNotFound() {
    const { t } = useTranslation();
    return (
        <>
            <DashboardBanner />
            <div className="flex flex-1 items-center justify-center bg-neutral-950 p-8">
                <div className="flex flex-col items-center gap-3 font-mono">
                    <span className="text-5xl font-bold text-teal-400">404</span>
                    <span className="text-sm text-stone-200">{t("dashboard.pageNotFound")}</span>
                    <ButtonLink
                        to="/dashboard"
                        variant={"outline"}
                        size={"lg"}
                        className="font-mono"
                    >
                        <ArrowLeft className="size-4" />
                        {t("common.backToDashboard")}
                    </ButtonLink>
                </div>
            </div>
        </>
    );
}
