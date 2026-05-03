import "@styles/popup.css";
import "@styles/global.css";
import type { KickData, OptionsMap, TwitchData, YoutubeData } from "@app-types/types";
import { sendMessageToBackground, sendMessageToContentScript } from "@/runtime";
import { useEffect, useState } from "react";
import {
    extractVideoTag,
    isYoutubePage,
    isShortsVideo,
    isTwitchPage,
    extractTwitchChannelName,
    isTwitchVod,
    isKickPage,
    extractTwitchVodId,
    humanizeDuration,
    isKickStream,
} from "@lib/utils";
import Options from "@pages/options";
import CONFIG from "@lib/constants";
import Header from "@components/header";
import YoutubeFormat from "@components/youtubeFormat";
import TwitchFormat from "@components/twitchFormat";
import useTab from "@hooks/useTab";
import useCurrentQuality from "@hooks/useCurrentQuality";
import useOptions from "@hooks/useOptions";
import KickFormat from "@components/kickFormat";

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
    const [pageType, setPageType] = useState<"youtube" | "twitch" | "kick" | "default">("default");
    const [youtubeData, setYoutubeData] = useState<YoutubeData | undefined>();
    const [twitchData, setTwitchData] = useState<TwitchData | undefined>();
    const [kickData, setKickData] = useState<KickData | undefined>();
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
                if (!response.success) throw new Error(response?.message);
                if (response.data.formats?.length === 0) {
                    setError(new Error("No video formats found for this video"));
                    setIsLoading(false);
                    return;
                }
                if (response.data.type === "video" && isShortsVideo(tabUrl)) {
                    response.data.isShorts = true;
                }
                setYoutubeData(response.data);
                setIsLive(response.data.type === "live");
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
                    setTwitchData(response.data);
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
                        fromPopup: true,
                    });
                    if (!response.success) throw new Error(response.message);
                    setTwitchData(response.data);
                    setIsLive(true);
                    setIsLoading(false);
                }
            } else if (isKickPage(tabUrl)) {
                if (!tabId) return;
                if (!isKickStream(tabUrl)) {
                    setMessage("Open a Kick stream");
                    setIsLoading(false);
                    return;
                }

                console.log("Sending message to content script to get Kick data...");
                const response = await sendMessageToContentScript(tabId, {
                    type: "getKick",
                    fromPopup: true,
                });
                console.log("Response from content script for Kick data:", response);
                if (!response?.success) {
                    throw new Error(response?.message || "Failed to retrieve Kick data");
                }
                setKickData(response.data);
                setIsLive(true);
                setPageType("kick");
                setIsLoading(false);
            } else {
                setMessage("TubeSize works on YouTube, Twitch and Kick.");
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
                kickData={kickData}
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
                {youtubeData?.type === "video" &&
                    youtubeData.formats
                        ?.filter((item) => {
                            return enabledOptions.includes("p" + item.height);
                        })
                        ?.map((item) => {
                            return (
                                <YoutubeFormat
                                    key={item.formatId}
                                    item={item}
                                    isLive={isLive}
                                    isShorts={youtubeData.type === "video" && youtubeData.isShorts}
                                    currentQuality={currentQuality}
                                />
                            );
                        })
                        // eslint-disable-next-line unicorn/no-array-reverse
                        .reverse()}
                {youtubeData?.type === "live" &&
                    youtubeData.formats
                        ?.filter((item) => {
                            return enabledOptions.includes("p" + item.resolution);
                        })
                        ?.map((item) => {
                            return (
                                <YoutubeFormat
                                    key={item.resolution}
                                    item={item}
                                    isLive={isLive}
                                    currentQuality={currentQuality}
                                />
                            );
                        })}
                {twitchData?.data &&
                    twitchData?.data.map((item) => {
                        return (
                            <TwitchFormat
                                key={item.resolution}
                                item={item}
                                currentQuality={currentQuality}
                                isLive={isLive}
                                durationSeconds={
                                    twitchData?.type === "vod"
                                        ? twitchData.durationSeconds
                                        : undefined
                                }
                            />
                        );
                    })}
                {kickData?.data &&
                    kickData.data.map((item) => {
                        return (
                            <KickFormat
                                key={item.resolution}
                                item={item}
                                currentQuality={currentQuality}
                                isLive={isLive}
                            />
                        );
                    })}
            </div>
        </div>
    );
}
