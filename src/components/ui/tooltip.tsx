import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
    className,
    sideOffset = 4,
    ...props
}: TooltipPrimitive.Popup.Props & { sideOffset?: number }) {
    return (
        <TooltipPrimitive.Portal>
            <TooltipPrimitive.Positioner sideOffset={sideOffset} className="z-50">
                <TooltipPrimitive.Popup
                    className={cn(
                        "max-w-[220px] rounded-lg border border-teal-950 bg-stone-900 px-2.5 py-2 text-xs text-zinc-300 shadow-lg outline-none",
                        className,
                    )}
                    {...props}
                />
            </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
    );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
