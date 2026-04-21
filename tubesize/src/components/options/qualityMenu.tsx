import { setToSyncCache } from "@/lib/cache";
import { useState } from "react";

export default function QualityMenu() {
    const [qualityMenuState, setQualityMenuState] = useState<boolean>();
    return (
        <div className="container">
            <div className="section-title">Quality Menu</div>
            <label className="option-label" htmlFor="qualityMenuToggle">
                Enable Quality Menu
            </label>
            <input
                id="qualityMenuToggle"
                type="checkbox"
                checked={qualityMenuState ?? true}
                onChange={async (event) => {
                    const { checked } = event.target as HTMLInputElement;
                    setQualityMenuState(checked);
                    await setToSyncCache({
                        qualityMenu: checked,
                    });
                }}
            ></input>
        </div>
    );
}
