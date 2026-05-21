import type { KickData, TwitchData, YoutubeData } from "@app-types/types";

export type PopupData =
    | {
          platform: "youtube";
          data: YoutubeData;
          cacheCreatedAt?: string;
      }
    | { platform: "twitch"; data: TwitchData; cacheCreatedAt?: string }
    | { platform: "kick"; data: KickData; cacheCreatedAt?: string };
