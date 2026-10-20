import type { PlatformId } from "@app-types/types";
import kickLogo from "@assets/kick.svg";
import twitchLogo from "@assets/twitch.svg";
import youtubeLogo from "@assets/youtube.svg";

export type PlatformTheme = {
    // Logo shown on the platform card and the platform page header.
    logo: string;
    // Tailwind ring + shadow classes for the logo tile.
    ring: string;
    // Tailwind border + hover classes for the platform card.
    card: string;
    // Fallback thumbnail for videos without one.
    placeholderImage: string;
};

const PLACEHOLDER_IMAGE = "/thumbnail-placeholder.svg";

export const PLATFORM_THEME: Record<PlatformId, PlatformTheme> = {
    youtube: {
        logo: youtubeLogo,
        ring: "ring-red-900/60 shadow-red-950/50",
        card: "border-l-red-500 hover:shadow-red-950/40",
        placeholderImage: PLACEHOLDER_IMAGE,
    },
    twitch: {
        logo: twitchLogo,
        ring: "ring-violet-900/60 shadow-violet-950/50",
        card: "border-l-violet-500 hover:shadow-violet-950/40",
        placeholderImage: "/thumbnail-placeholder-twitch.svg",
    },
    kick: {
        logo: kickLogo,
        ring: "ring-lime-900/60 shadow-lime-950/50",
        card: "border-l-lime-500 hover:shadow-lime-950/40",
        placeholderImage: PLACEHOLDER_IMAGE,
    },
};
