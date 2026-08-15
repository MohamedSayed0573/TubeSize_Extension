import Header from "../header";
import InfoCard from "../infoCard";
import Spinner from "../spinner";
import { useTwitchData } from "@/hooks/useTwitchData";
import TwitchFormats from "../twitchFormats";

export function TwitchView({ tabUrl, tabId }: { tabUrl: string; tabId: number }) {
    const { data, error, message, isLoading, createdAt } = useTwitchData(tabUrl, tabId);

    if (isLoading) return <Spinner />;
    if (error) throw error;

    return (
        <>
            <Header
                data={data ? { platform: "twitch", data, cacheCreatedAt: createdAt } : undefined}
            />

            <div className="flex flex-col gap-2 px-3 py-1.5 text-xs text-zinc-400">
                {message && <InfoCard message={message} />}
                {data && <TwitchFormats data={data} />}
            </div>
        </>
    );
}
