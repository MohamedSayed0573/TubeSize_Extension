import { t } from "@/i18n/t";
import { Field, FieldDescription, FieldLegend } from "@/components/ui/field";

export function LanguageSettings() {
    const isArabic = chrome.i18n.getUILanguage().toLowerCase().startsWith("ar");
    const currentLabel = t(isArabic ? "settings_language_arabic" : "settings_language_english");

    return (
        <Field>
            <FieldLegend>{t("settings_language_label")}</FieldLegend>
            <FieldDescription>{t("settings_language_description")}</FieldDescription>
            <p className="text-sm font-medium">{currentLabel}</p>
        </Field>
    );
}
