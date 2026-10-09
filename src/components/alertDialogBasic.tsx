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
                    <AlertDialogTitle>
                        {chrome.i18n.getMessage("common_areYouSure")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>{descriptionText}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>{chrome.i18n.getMessage("common_cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>
                        {chrome.i18n.getMessage("common_continue")}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
