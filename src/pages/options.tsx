import CONFIG from "@lib/constants";
import HeaderOptions from "@components/options/headerOptions";
import OptionItem from "@components/options/optionItem";
import CacheSettings from "@components/options/cacheSettings";
import ToasterSettings from "@components/options/toasterSettings";
import QualityMenu from "@components/options/qualityMenu";
import useOptions from "@hooks/useOptions";
import Divider from "@/components/options/divider";

function OptionsFooter() {
    return (
        <div className="flex items-center justify-around p-3">
            <div>
                <a
                    href="https://github.com/MohamedSayed0573/TubeSize_Extension"
                    target="_blank"
                    rel="noreferrer"
                    className="flex gap-2 text-xs text-zinc-500 no-underline transition-colors hover:text-zinc-400"
                >
                    <img src="icons/github.svg" alt="" width="14" height="14" />
                    @Mohamed Sayed
                </a>
            </div>
            <div>
                <a
                    href="https://ko-fi.com/mohamedsayed253"
                    target="_blank"
                    rel="noreferrer"
                    className="flex gap-2 text-xs text-zinc-500 no-underline transition-colors hover:text-zinc-400"
                >
                    <img src="icons/support.svg" alt="" width="14" height="14" />
                    Support Me
                </a>
            </div>
        </div>
    );
}

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
