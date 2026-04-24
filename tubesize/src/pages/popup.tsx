import "@styles/popup.css";
import "@styles/global.css";
import type {
    OptionsMap,
    TwitchBackgroundResponse,
    YoutubeBackgroundResponse,
} from "@app-types/types";
import { sendMessageToBackground } from "@/runtime";
import { useEffect, useState } from "react";
import {
    extractVideoTag,
    isYoutubePage,
    isShortsVideo,
    isTwitchPage,
    extractTwitchChannelName,
    isTwitchVod,
    extractTwitchVodId,
    humanizeDuration,
} from "@lib/utils";
import Options from "@pages/options";
import CONFIG from "@lib/constants";
import Header from "@components/header";
import YoutubeFormat from "@/components/youtubeFormat";
import TwitchFormat from "@/components/twitchFormat";
import useTab from "@/hooks/useTab";
import useCurrentQuality from "@/hooks/useCurrentQuality";
import useOptions from "@/hooks/useOptions";

function getCachedAgo(createdAt: string | undefined) {
    if (!createdAt) return;
    const timeInMs = Date.now() - new Date(createdAt).getTime();
    if (timeInMs < CONFIG.CACHE_JUST_NOW_THRESHOLD) {
        return "Cached just now";
    } else {
        const timeAgo = humanizeDuration(timeInMs);
        return `Cached ${timeAgo} ago`;
    }
}

function getEnabledOptions(optionsState: OptionsMap | null) {
    const qualityIds = optionsState?.["qualityIds"] ?? {};
    return CONFIG.optionIDs.filter((option) => qualityIds[option] ?? true);
}

export default function Popup() {
    const [message, setMessage] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);

    const { tabId, tabUrl, error: tabError } = useTab();
    const [pageType, setPageType] = useState<"youtube" | "twitch" | "default">("default");
    const [youtubeData, setYoutubeData] = useState<YoutubeBackgroundResponse | undefined>();
    const [twitchData, setTwitchData] = useState<TwitchBackgroundResponse | undefined>();
    const [cache, setCache] = useState<string | undefined>();
    const [useOptionsPage, setUseOptionsPage] = useState(false);
    const [error, setError] = useState<Error | undefined>();
    const [isLive, setIsLive] = useState<boolean>(false);
    const { currentQuality } = useCurrentQuality(tabId, tabUrl);
    const { optionsState, error: optionsError } = useOptions();
    const enabledOptions = getEnabledOptions(optionsState);

    useEffect(() => {
        (async () => {
            if (!tabUrl) return;

            setIsLoading(true);

            if (isYoutubePage(tabUrl)) {
                setPageType("youtube");
                const videoTag = extractVideoTag(tabUrl);
                if (!videoTag) {
                    setMessage("Open a Youtube video");
                    setIsLoading(false);
                    return;
                }

                const response = await sendMessageToBackground({
                    type: "youtubeVideo",
                    videoTag,
                    tabId,
                });
                if (!response.success) throw new Error(response.message);
                if (response.data?.videoFormats.length === 0) {
                    setError(new Error("No video formats found for this video"));
                    return;
                }
                if (isShortsVideo(tabUrl)) response.isShorts = true;
                setYoutubeData(response);
                setIsLive(response.data?.isLive || false);
                setCache(
                    response.cached
                        ? getCachedAgo(response.createdAt) || "Cached just now"
                        : undefined,
                );
                setIsLoading(false);
            } else if (isTwitchPage(tabUrl)) {
                setPageType("twitch");
                if (isTwitchVod(tabUrl)) {
                    const vodId = extractTwitchVodId(tabUrl);
                    if (!vodId) {
                        setMessage("Open a Twitch stream or VOD");
                        setIsLoading(false);
                        return;
                    }

                    const response = await sendMessageToBackground({
                        type: "twitchVod",
                        vodId: vodId,
                    });
                    if (!response.success) throw new Error(response.message);
                    setTwitchData(response);
                    setCache(
                        response.cached
                            ? getCachedAgo(response.createdAt) || "Cached just now"
                            : undefined,
                    );
                    setIsLive(false);
                    setIsLoading(false);
                } else {
                    const channelName = extractTwitchChannelName(tabUrl);
                    if (!channelName) {
                        setMessage("Open a Twitch stream");
                        setIsLoading(false);
                        return;
                    }

                    const response = await sendMessageToBackground({
                        type: "twitchLive",
                        channelName: channelName,
                    });
                    if (!response.success) throw new Error(response.message);
                    setTwitchData(response);
                    setIsLive(true);
                    setIsLoading(false);
                }
            } else {
                setMessage("TubeSize works on YouTube and Twitch only.");
                setIsLoading(false);
            }
        })().catch((err) => {
            console.error("[Popup Error]:", err);
            setIsLoading(false);
            setError(err as Error);
        });
    }, [tabId, tabUrl]);

    const pageError = error || tabError || optionsError;
    if (pageError) {
        throw pageError;
    }

    if (useOptionsPage) {
        return <Options />;
    }

    return (
        <div className="popup-page">
            <Header
                pageType={pageType}
                youtubeData={youtubeData}
                twitchData={twitchData}
                setUseOptionsPage={setUseOptionsPage}
            />
            <div id="container">
                {cache && <div className="cached-note">{cache}</div>}
                {!youtubeData && !twitchData && isLoading && (
                    <div className="loading-state">
                        <span className="spinner" />
                    </div>
                )}
                {!youtubeData && !twitchData && !isLoading && message && (
                    <span className="info">{message}</span>
                )}
                {youtubeData && enabledOptions.length === 0 && (
                    <span className="error">All Resolutions Disabled. Enable in options</span>
                )}
                {youtubeData?.data?.videoFormats &&
                    youtubeData?.data?.videoFormats
                        ?.filter((item) => {
                            return enabledOptions.includes("p" + item.height);
                        })
                        ?.map((item) => {
                            return (
                                <YoutubeFormat
                                    key={item.formatId}
                                    item={item}
                                    isLive={isLive}
                                    isShorts={youtubeData.isShorts}
                                    currentQuality={currentQuality}
                                />
                            );
                        })
                        .toReversed()}
                {twitchData?.twitchData?.data &&
                    twitchData?.twitchData?.data
                        .toSorted((a, b) => b.bandwidth - a.bandwidth)
                        .map((item) => {
                            return (
                                <TwitchFormat
                                    key={item.resolution}
                                    item={item}
                                    currentQuality={currentQuality}
                                    isLive={isLive}
                                    durationSeconds={
                                        twitchData.twitchData?.type === "vod"
                                            ? twitchData.twitchData.durationSeconds
                                            : undefined
                                    }
                                />
                            );
                        })}
            </div>
        </div>
    );
}
