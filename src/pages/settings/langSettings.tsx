import { Field, FieldDescription, FieldLegend } from "@/components/ui/field";
import { getAppLanguage, useTranslation } from "@/i18n/i18n";

export function LanguageSettings() {
    const { t } = useTranslation();
    const language = getAppLanguage();
    const currentLabel = t(
        language === "ar" ? "settings.language.arabic" : "settings.language.english",
    );

    return (
        <Field>
            <FieldLegend>{t("settings.language.label")}</FieldLegend>
            <FieldDescription>{t("settings.language.description")}</FieldDescription>
            <p className="text-sm font-medium">{currentLabel}</p>
        </Field>
    );
}
