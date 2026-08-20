import HeaderOptions from "./headerOptions";
import CacheSettings from "./cacheSettings";
import ToasterSettings from "./toasterSettings";
import QualityMenu from "./qualityMenu";
import useOptions from "@hooks/useOptions";
import Divider from "./divider";
import { OptionsFooter } from "./optionsFooter";
import ResolutionsOptions from "./resolutionsOptions";

export default function Options() {
    const { query } = useOptions();

    const { data: optionsState, isPending, isError } = query;
    if (isPending) return <div>Loading...</div>;
    if (isError) return <div>Error loading options.</div>;

    return (
        <div className="w-72.5">
            <HeaderOptions />

            <ResolutionsOptions optionsState={optionsState} />

            <Divider />
            <CacheSettings optionsState={optionsState} />

            <Divider />
            <ToasterSettings optionsState={optionsState} />

            <Divider />
            <QualityMenu optionsState={optionsState} />

            <Divider />
            <OptionsFooter />
        </div>
    );
}
