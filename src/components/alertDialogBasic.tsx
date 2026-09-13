import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@components/ui/alertDialog";
import { Button } from "@components/ui/button";
import { useTranslation } from "react-i18next";

export function AlertDialogBasic({
    descriptionText,
    buttonText,
    disabled,
    variant = "outline",
    className,
    onConfirm,
}: {
    descriptionText: string;
    buttonText: string;
    disabled?: boolean;
    className?: string;
    variant?:
        "link" | "default" | "outline" | "secondary" | "ghost" | "destructive" | null | undefined;
    onConfirm: () => void;
}) {
    const { t } = useTranslation();
    return (
        <AlertDialog>
            <AlertDialogTrigger
                render={
                    <Button variant={variant} className={className} disabled={disabled}>
                        {buttonText}
                    </Button>
                }
            />
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("common.areYouSure")}</AlertDialogTitle>
                    <AlertDialogDescription>{descriptionText}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>
                        {t("common.continue")}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
