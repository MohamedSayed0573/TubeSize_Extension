import Header from "../../header";
import InfoCard from "@components/infoCard";
import Spinner from "@components/spinner";
import { useTwitchData } from "@/hooks/useTwitchData";
import TwitchFormats from "./twitchFormats";

export function TwitchView({ tabUrl }: { tabUrl: string }) {
    const { data, error, message, isLoading, createdAt } = useTwitchData(tabUrl);

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
