import CONFIG from "@lib/constants";
import OptionItem from "@pages/options/optionItem";
import type { OptionsMap } from "@app-types/types";
import { FieldLegend } from "@components/ui/field";

export default function ResolutionsOptions({ optionsState }: { optionsState: OptionsMap }) {
    return (
        <div className="p-3">
            <FieldLegend className="m-0 p-0">Resolutions</FieldLegend>
            <div className="mb-2 text-sm text-zinc-400">
                Select which resolutions to display when you click on the extension icon:
            </div>
            <div className="grid grid-cols-3 gap-2.5">
                {CONFIG.optionIDs.map((option) => {
                    return <OptionItem key={option} option={option} optionsState={optionsState} />;
                })}
            </div>
        </div>
    );
}
