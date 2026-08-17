import { useKickData } from "@/hooks/useKickData";
import Header from "../../header";
import InfoCard from "@components/infoCard";
import KickFormats from "./kickFormats";
import Spinner from "@components/spinner";

export function KickView({ tabUrl, tabId }: { tabUrl: string; tabId: number }) {
    const { data, error, message, isLoading, createdAt } = useKickData(tabUrl, tabId);

    if (isLoading) return <Spinner />;
    if (error) throw error;

    return (
        <>
            <Header
                data={data ? { platform: "kick", data, cacheCreatedAt: createdAt } : undefined}
            />

            <div className="flex flex-col gap-2 px-3 py-1.5 text-xs text-zinc-400">
                {message && <InfoCard message={message} />}
                {data && <KickFormats data={data} />}
            </div>
        </>
    );
}
