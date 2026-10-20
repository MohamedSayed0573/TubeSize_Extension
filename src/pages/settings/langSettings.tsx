import { Field, FieldDescription, FieldLegend } from "@/components/ui/field";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { t } from "@/i18n/t";
import useLanguage from "@hooks/useLanguage";
import { useMutation } from "@tanstack/react-query";

export function LanguageSettings() {
    const { language, changeLanguage } = useLanguage();
    const { mutate, isPending, isError } = useMutation({ mutationFn: changeLanguage });

    return (
        <Field>
            <FieldLegend>{t("settings_language_label")}</FieldLegend>
            <FieldDescription id="language-description">
                {t("settings_language_description")}
            </FieldDescription>
            <Select
                value={language}
                disabled={isPending}
                items={[
                    { value: "en", label: "English" },
                    { value: "ar", label: "العربية" },
                ]}
                onValueChange={(value) => {
                    if (value === "en" || value === "ar") mutate(value);
                }}
            >
                <SelectTrigger
                    id="language-select"
                    className="w-full"
                    aria-label={t("settings_language_label")}
                    aria-describedby="language-description"
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="en">
                        <span lang="en">English</span>
                    </SelectItem>
                    <SelectItem value="ar">
                        <span lang="ar">العربية</span>
                    </SelectItem>
                </SelectContent>
            </Select>
            {isError && (
                <FieldDescription role="alert">{t("settings_language_saveError")}</FieldDescription>
            )}
        </Field>
    );
}
