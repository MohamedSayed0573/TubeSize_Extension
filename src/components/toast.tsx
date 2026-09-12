import { perHourDisplay, totalSizeVideoDisplay } from "@lib/formatting";
import { useTranslation } from "react-i18next";
import "../i18n/i18n";
import "@styles/toast.css";

export default function Toast({
    currentQuality,
    sizePerSecondBytes,
    sizeBytes,
    isLive,
    okOnClick,
    dontShowAgainOnClick,
}: {
    currentQuality: number;
    sizePerSecondBytes: number;
    sizeBytes?: number;
    isLive: boolean;
    okOnClick: () => void;
    dontShowAgainOnClick: () => void;
}) {
    const { t } = useTranslation();
    return (
        <div className="container">
            <div className="title">{t("toast.title")}</div>
            <div className="toast">
                {t("toast.body", { quality: currentQuality })}
                <div>
                    <span className="current-quality">
                        {t("toast.currentQuality", { quality: currentQuality })}
                    </span>
                    <div className="toast-inner">
                        {!isLive && sizeBytes && (
                            <span>
                                {t("toast.totalUsage", { usage: totalSizeVideoDisplay(sizeBytes) })}
                            </span>
                        )}
                        <span>
                            {t("toast.perHourUsage", { usage: perHourDisplay(sizePerSecondBytes) })}
                        </span>
                    </div>
                </div>
            </div>
            <div className="actions">
                <button className="firstBtn" onClick={okOnClick}>
                    {t("toast.ok")}
                </button>
                <button onClick={dontShowAgainOnClick}>{t("toast.dontShowAgain")}</button>
            </div>
        </div>
    );
}
