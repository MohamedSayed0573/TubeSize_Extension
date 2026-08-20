import HeaderOptions from "@pages/options/headerOptions";
import CacheSettings from "@pages/options/cacheSettings";
import ToasterSettings from "@pages/options/toasterSettings";
import QualityMenu from "@pages/options/qualityMenu";
import useOptions from "@hooks/useOptions";
import Divider from "@pages/options/divider";
import { OptionsFooter } from "@pages/options/optionsFooter";
import ResolutionsOptions from "@pages/options/resolutionsOptions";

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
