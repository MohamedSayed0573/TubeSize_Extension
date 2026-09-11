import type { InvalidImportJson } from "@lib/errors";
import ClearUsageButton from "./clearUsageButton";
import { ExportToJsonBtn } from "./exportToJsonBtn";
import { ImportJson } from "./importJson";

export function FooterBtns({
    setError,
}: {
    setError: React.Dispatch<React.SetStateAction<InvalidImportJson | undefined>>;
}) {
    return (
        <div className="mt-2.5 flex items-center gap-1">
            <div className="flex-3">
                <ClearUsageButton />
            </div>
            <div className="flex-1">
                <ExportToJsonBtn setError={setError} />
            </div>
            <div className="flex-1">
                <ImportJson setError={setError} />
            </div>
        </div>
    );
}
