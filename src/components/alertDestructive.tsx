import { AlertCircleIcon, X } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "./ui/button";

export function AlertDestructive({
    title,
    description,
    onClose,
}: {
    title: string;
    description?: string;
    onClose?: () => void;
}) {
    return (
        <div className="fixed top-1/20 right-1/20 z-50 flex items-center justify-center px-4">
            <Alert variant="destructive" className="w-full/2">
                <AlertCircleIcon />
                <AlertTitle className="text-base">{title}</AlertTitle>
                <AlertAction>
                    <Button variant="link" onClick={onClose} size="icon-xs">
                        <X />
                    </Button>
                </AlertAction>
                {description && <AlertDescription>{description}</AlertDescription>}
            </Alert>
        </div>
    );
}
