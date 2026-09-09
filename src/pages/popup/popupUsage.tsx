import { totalSizeVideoDisplay } from "@lib/formatting";
import { chromeNavigate } from "@lib/utils";
import { Button } from "@components/ui/button";

export default function PopupUsage({
    text,
    usage,
    navigateTo,
}: {
    text: string;
    usage: number | undefined;
    navigateTo?: string;
}) {
    if (usage === undefined) return null;

    return (
        <div className="w-full">
            <Button
                variant="outline"
                className="w-full justify-between gap-2 overflow-hidden"
                onClick={navigateTo ? () => chromeNavigate(navigateTo) : undefined}
            >
                <span className="truncate">{text}</span>
                <span className="shrink-0">{totalSizeVideoDisplay(usage)}</span>
            </Button>
        </div>
    );
}
