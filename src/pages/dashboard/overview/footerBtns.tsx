import ClearUsageButton from "./clearUsageButton";
import { ExportToJsonBtn } from "./exportToJsonBtn";
import { ImportJson } from "./importJson";

export function FooterBtns() {
    return (
        <div className="mt-2.5 flex items-center gap-1">
            <div className="flex-3">
                <ClearUsageButton />
            </div>
            <div className="flex-1">
                <ExportToJsonBtn />
            </div>
            <div className="flex-1">
                <ImportJson />
            </div>
        </div>
    );
}
