import { Field, FieldDescription, FieldLegend } from "@/components/ui/field";

export function LanguageSettings() {
    const isArabic = chrome.i18n.getUILanguage().toLowerCase().startsWith("ar");
    const currentLabel = chrome.i18n.getMessage(
        isArabic ? "settings_language_arabic" : "settings_language_english",
    );

    return (
        <Field>
            <FieldLegend>{chrome.i18n.getMessage("settings_language_label")}</FieldLegend>
            <FieldDescription>
                {chrome.i18n.getMessage("settings_language_description")}
            </FieldDescription>
            <p className="text-sm font-medium">{currentLabel}</p>
        </Field>
    );
}
