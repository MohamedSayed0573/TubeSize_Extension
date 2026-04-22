import { setToSyncCache } from "@lib/cache";

export default function OptionItem({
    option,
    optionsState,
    setOptionsState,
}: {
    option: string;
    optionsState: Record<any, any> | undefined;
    setOptionsState: (optionsState: Record<any, any>) => void;
}) {
    return (
        <div className="option-item">
            <label className="option-label" htmlFor={option}>
                {option.substring(1) + "p"}
            </label>
            <input
                id={option}
                type="checkbox"
                checked={optionsState?.["qualityIds"]?.[option] ?? true}
                onChange={async (event) => {
                    const { checked } = event.target as HTMLInputElement;
                    await handleOptionChange(option, checked, optionsState, setOptionsState);
                }}
            ></input>
        </div>
    );
}

async function handleOptionChange(
    option: string,
    isChecked: boolean,
    optionsState: Record<any, any> | undefined,
    setOptionsState: (optionsState: Record<any, any>) => void,
) {
    await setToSyncCache({
        qualityIds: {
            ...(optionsState?.["qualityIds"] ?? {}),
            [option]: isChecked,
        },
    });
    setOptionsState({
        ...optionsState,
        qualityIds: {
            ...(optionsState?.["qualityIds"] ?? {}),
            [option]: isChecked,
        },
    });
}
