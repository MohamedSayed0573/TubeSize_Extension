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
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>{descriptionText}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onConfirm}>Continue</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
