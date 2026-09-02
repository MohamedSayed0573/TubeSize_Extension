import { useTotalUsage } from "@hooks/useTotalUsage";
import { useOriginUsage } from "@hooks/useOriginUsage";
import useTab from "@hooks/useTab";
import PopupUsage from "./popupUsage";

function getTabOrigin(tabUrl: string | undefined) {
    if (!tabUrl) return;

    try {
        return new URL(tabUrl).origin;
    } catch {
        return;
    }
}

export function PopupViewContainer({ children }: { children: React.ReactNode }) {
    const { data: tab } = useTab();
    const origin = getTabOrigin(tab?.tabUrl);

    const totalUsage = useTotalUsage();
    const originUsage = useOriginUsage(origin);

    return (
        <div className="flex flex-col gap-2 px-3 py-1.5 text-xs text-zinc-400">
            <>
                <PopupUsage text="Total Usage Today:" usage={totalUsage} />
                {originUsage && origin ? (
                    <PopupUsage
                        text={`${getOriginText(origin)} Usage Today:`}
                        usage={originUsage}
                    />
                ) : null}
                {children}
            </>
        </div>
    );
}

function getOriginText(origin: string) {
    const websiteName = new URL(origin).hostname.replace(/^www\./, "").split(".")[0]!;
    return websiteName[0]?.toUpperCase() + websiteName.slice(1);
}
