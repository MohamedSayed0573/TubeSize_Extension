import InfoCard from "@components/infoCard";

import { t } from "@/i18n/t";

import Header from "./header";
import { PopupViewContainer } from "./popupViewContainer";

export default function UnsupportedPage() {
    return (
        <>
            <Header />
            <PopupViewContainer>
                <InfoCard tone="success" message={t("popup_usageTrackingEnabled")} />
                <InfoCard message={t("popup_unsupportedPage")} />
            </PopupViewContainer>
        </>
    );
}
