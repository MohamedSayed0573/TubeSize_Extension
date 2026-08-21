import HeaderOptions from "@pages/options/headerOptions";
import CacheSettings from "@pages/options/cacheSettings";
import ToasterSettings from "@pages/options/toasterSettings";
import QualityMenu from "@pages/options/qualityMenu";
import useOptions from "@hooks/useOptions";
import Divider from "@pages/options/divider";
import { OptionsFooter } from "@pages/options/optionsFooter";
import ResolutionsOptions from "@pages/options/resolutionsOptions";
import Spinner from "@components/spinner";

export default function Options() {
    const { query } = useOptions();

    const { data: optionsState, error, isPending, isError } = query;
    if (isError) throw error;
    if (isPending)
        return (
            <div className="flex w-72.5 items-center justify-center p-4">
                <Spinner />
            </div>
        );

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
