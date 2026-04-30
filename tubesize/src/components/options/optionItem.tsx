import type { OptionsMap } from "@app-types/types";
import { setToSyncCache } from "@lib/cache";

export default function OptionItem({
    option,
    optionsState,
    setOptionsState,
}: {
    option: string;
    optionsState: OptionsMap;
    setOptionsState: (optionsState: OptionsMap) => void;
}) {
    return (
        <div className="option-item">
            <label className="option-label" htmlFor={option}>
                {option.slice(1) + "p"}
            </label>
            <input
                id={option}
                type="checkbox"
                checked={optionsState?.["qualityIds"]?.[option] ?? true}
                onChange={(event) => {
                    const { checked } = event.target;
                    void handleOptionChange(option, checked, optionsState, setOptionsState);
                }}
            ></input>
        </div>
    );
}

async function handleOptionChange(
    option: string,
    isChecked: boolean,
    optionsState: OptionsMap,
    setOptionsState: (optionsState: OptionsMap) => void,
) {
    await setToSyncCache({
        qualityIds: {
            ...optionsState?.["qualityIds"],
            [option]: isChecked,
        },
    });
    setOptionsState({
        ...optionsState,
        qualityIds: {
            ...optionsState?.["qualityIds"],
            [option]: isChecked,
        },
    });
}
