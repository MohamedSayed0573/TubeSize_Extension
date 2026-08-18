import { useYoutubeData } from "@hooks/useYoutubeData";
import Header from "../../header";
import InfoCard from "@components/infoCard";
import YoutubeFormats from "./youtubeFormats";
import PopupUsage from "../../popupUsage";
import Spinner from "@components/spinner";

export function YoutubeView({ tabUrl, tabId }: { tabUrl: string; tabId: number }) {
    const { data, error, message, createdAt, isLoading } = useYoutubeData(tabUrl, tabId);

    if (isLoading) return <Spinner />;
    if (error) throw error;

    return (
        <>
            <Header
                data={data ? { platform: "youtube", data, cacheCreatedAt: createdAt } : undefined}
            />

            <div className="flex flex-col gap-2 px-3 py-1.5 text-xs text-zinc-400">
                <PopupUsage />
                {message && <InfoCard message={message} />}
                {data && <YoutubeFormats data={data} tabId={tabId} />}
            </div>
        </>
    );
}
