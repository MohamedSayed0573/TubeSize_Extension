import CONFIG from "@lib/constants";
import HeaderOptions from "./headerOptions";
import OptionItem from "./optionItem";
import CacheSettings from "./cacheSettings";
import ToasterSettings from "./toasterSettings";
import QualityMenu from "./qualityMenu";
import useOptions from "@hooks/useOptions";
import Divider from "./divider";
import { OptionsFooter } from "./optionsFooter";

export default function Options() {
    const { optionsState, setOptionsState } = useOptions();
    return (
        <div className="w-72.5">
            <HeaderOptions />
            <div className="p-3">
                <div className="mb-2 text-sm text-zinc-400">
                    Select which resolutions to display:
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                    {CONFIG.optionIDs.map((option) => {
                        return (
                            <OptionItem
                                key={option}
                                option={option}
                                optionsState={optionsState}
                                setOptionsState={setOptionsState}
                            />
                        );
                    })}
                </div>
            </div>

            <Divider />
            <CacheSettings />

            <Divider />
            <ToasterSettings />

            <Divider />
            <QualityMenu />

            <Divider />
            <OptionsFooter />
        </div>
    );
}
