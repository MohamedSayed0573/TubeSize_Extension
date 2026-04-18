import { setToSyncCache } from "@lib/cache";

export default function OptionItem({
    option,
    optionsState,
    setOptionsState,
}: {
    option: string;
    // eslint-disable-next-line
    optionsState: Record<any, any> | undefined;
    // eslint-disable-next-line
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
                checked={optionsState?.[option] ?? true}
                onChange={async (event) => {
                    const isChecked = event.target.checked;
                    await setToSyncCache({
                        [option]: isChecked,
                    });
                    setOptionsState({ ...optionsState, [option]: isChecked });
                }}
            ></input>
        </div>
    );
}
