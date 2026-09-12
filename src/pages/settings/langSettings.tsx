import { Field, FieldLabel } from "@/components/ui/field";
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
        await i18n.changeLanguage(value);
        await chrome.storage.sync.set({ language: value });
    };

    return (
        <Field className="w-full max-w-xs">
            <FieldLabel>{t("settings.language.label")}</FieldLabel>
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
