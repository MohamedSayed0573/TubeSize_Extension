import InfoCard from "@components/infoCard";
import { formatSupportedPlatforms } from "@lib/platformUrl";

import { getLanguage } from "@/i18n/language";
import { t } from "@/i18n/t";

import Header from "./header";
import { PopupViewContainer } from "./popupViewContainer";

export default function UnsupportedPage() {
    const supportedPlatforms = formatSupportedPlatforms(getLanguage());

    return (
        <>
            <Header />
            <PopupViewContainer>
                <InfoCard tone="success" message={t("popup_usageTrackingEnabled")} />
                <InfoCard message={t("popup_unsupportedPage", [supportedPlatforms])} />
            </PopupViewContainer>
        </>
    );
}
