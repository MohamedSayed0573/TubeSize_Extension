import DashboardBanner from "@pages/dashboard/overview/dashboardBanner";
import { ArrowLeft } from "lucide-react";
import ButtonLink from "@components/buttonLink";

export default function DashboardNotFound() {
    return (
        <>
            <DashboardBanner />
            <div className="flex flex-1 items-center justify-center bg-neutral-950 p-8">
                <div className="flex flex-col items-center gap-3 font-mono">
                    <span className="text-5xl font-bold text-teal-400">404</span>
                    <span className="text-sm text-stone-200">
                        {chrome.i18n.getMessage("dashboard_pageNotFound")}
                    </span>
                    <ButtonLink to="/daily" variant={"outline"} size={"lg"} className="font-mono">
                        <ArrowLeft className="size-4 rtl:rotate-180" />
                        {chrome.i18n.getMessage("common_backToDashboard")}
                    </ButtonLink>
                </div>
            </div>
        </>
    );
}
