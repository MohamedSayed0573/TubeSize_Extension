import CONFIG from "@lib/constants";
import OptionItem from "@pages/options/optionItem";
import type { OptionsMap } from "@app-types/types";

export default function ResolutionsOptions({ optionsState }: { optionsState: OptionsMap }) {
    return (
        <div className="p-3">
            <div className="mb-2 text-sm text-zinc-400">Select which resolutions to display:</div>
            <div className="grid grid-cols-3 gap-2.5">
                {CONFIG.optionIDs.map((option) => {
                    return <OptionItem key={option} option={option} optionsState={optionsState} />;
                })}
            </div>
        </div>
    );
}
