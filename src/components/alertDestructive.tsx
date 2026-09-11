import { AlertCircleIcon, X } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useState } from "react";
import { Button } from "./ui/button";

export function AlertDestructive({ title, description }: { title: string; description?: string }) {
    const [close, setClose] = useState(false);
    if (close) return;
    return (
        <Alert variant="destructive" className="max-w-sm">
            <AlertCircleIcon />
            <AlertTitle>{title}</AlertTitle>
            <AlertAction>
                <Button variant="link" onClick={() => setClose(true)}>
                    <X />
                </Button>
            </AlertAction>
            {description && <AlertDescription>{description}</AlertDescription>}
        </Alert>
    );
}
