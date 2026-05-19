import type { KickData, TwitchData, YoutubeData } from "./types";

export type PopupData =
    | {
          platform: "youtube";
          data: YoutubeData;
          cacheCreatedAt?: string;
      }
    | { platform: "twitch"; data: TwitchData; cacheCreatedAt?: string }
    | { platform: "kick"; data: KickData; cacheCreatedAt?: string };
