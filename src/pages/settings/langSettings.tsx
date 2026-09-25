import { Field, FieldLegend } from "@/components/ui/field";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";

export function LanguageSettings() {
    const { i18n, t } = useTranslation();

    const items = [
        { label: t("settings.language.arabic"), value: "ar" },
        { label: t("settings.language.english"), value: "en" },
    ];

    const handleLanguageChange = async (value: string | null) => {
        if (value === null) return;
        await chrome.storage.sync.set({ language: value });
        await i18n.changeLanguage(value);
    };

    return (
        <Field>
            <FieldLegend>{t("settings.language.label")}</FieldLegend>
            <Select
                items={items}
                value={i18n.language}
                onValueChange={(value) => void handleLanguageChange(value)}
            >
                <SelectTrigger>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        {items.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                                {item.label}
                            </SelectItem>
                        ))}
                    </SelectGroup>
                </SelectContent>
            </Select>
        </Field>
    );
}
