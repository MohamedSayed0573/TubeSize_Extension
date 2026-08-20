import type { OptionsMap } from "@app-types/types";
import useOptions from "@hooks/useOptions";
import CONFIG from "@lib/constants";

export default function QualityMenu({ optionsState }: { optionsState: OptionsMap }) {
    const isQualityMenuEnabled = optionsState.qualityMenu ?? CONFIG.DEFAULT_QUALITY_MENU_ENABLED;
    const { updateOptionsMutation } = useOptions();
    const { mutate: updateOptions } = updateOptionsMutation;

    return (
        <div className="p-3.5">
            <div className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Quality Menu
            </div>
            <div className="flex items-center justify-between rounded-md border border-transparent bg-white/4 px-4 py-2 transition-all duration-300 hover:border-white/15 hover:bg-white/8">
                <label
                    className="cursor-pointer text-xs font-medium text-white"
                    htmlFor="qualityMenuToggle"
                >
                    Enable Quality Menu
                </label>
                <input
                    id="qualityMenuToggle"
                    type="checkbox"
                    checked={isQualityMenuEnabled}
                    onChange={(event) => {
                        updateOptions({
                            qualityMenu: event.target.checked,
                        });
                    }}
                ></input>
            </div>
        </div>
    );
}
