import useOptions from "@/hooks/useOptions";
import type { OptionsMap } from "@app-types/types";

export default function OptionItem({
    option,
    optionsState,
}: {
    option: string;
    optionsState: OptionsMap;
}) {
    const { updateOptions } = useOptions();

    return (
        <div className="flex cursor-pointer items-center justify-between rounded-lg border border-transparent bg-white/3 px-3 py-2.5 pl-3 transition-all hover:border-white/20 hover:bg-white/8">
            <label className="cursor-pointer text-xs font-medium text-white" htmlFor={option}>
                {option.slice(1) + "p"}
            </label>
            <input
                id={option}
                type="checkbox"
                checked={optionsState["qualityIds"]?.[option] ?? true}
                onChange={(event) => {
                    const { checked } = event.target;
                    void updateOptions({
                        qualityIds: {
                            ...optionsState["qualityIds"],
                            [option]: checked,
                        },
                    });
                }}
            ></input>
        </div>
    );
}
