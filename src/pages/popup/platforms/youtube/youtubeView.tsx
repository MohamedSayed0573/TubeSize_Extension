import { useYoutubeData } from "@hooks/useYoutubeData";
import Header from "../../header";
import InfoCard from "@components/infoCard";
import YoutubeFormats from "./youtubeFormats";
import PopupUsage from "../../popupUsage";
import Spinner from "@components/spinner";

export function YoutubeView({ tabUrl, tabId }: { tabUrl: string; tabId: number }) {
    const { query, isYoutubeVideo } = useYoutubeData(tabUrl, tabId);
    const { isPending, isError, data, error } = query;

    if (!isYoutubeVideo) {
        return (
            <>
                <Header />
                <div className="flex flex-col gap-2 px-3 py-1.5 text-xs text-zinc-400">
                    <PopupUsage />
                    <InfoCard message="Open a Youtube video" />
                </div>
            </>
        );
    }

    if (isPending) return <Spinner />;
    if (isError) throw error;

    return (
        <>
            <Header
                data={{ platform: "youtube", data: data.data, cacheCreatedAt: data.createdAt }}
            />

            <div className="flex flex-col gap-2 px-3 py-1.5 text-xs text-zinc-400">
                <PopupUsage />
                <YoutubeFormats data={data.data} tabId={tabId} />
            </div>
        </>
    );
}
