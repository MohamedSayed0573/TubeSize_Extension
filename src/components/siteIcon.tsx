import { useState } from "react";
import { Globe } from "lucide-react";
import { faviconURL, originFaviconURL } from "@lib/utils";

interface SiteIconProps {
    origin?: string;
    /**
     * Browser-known icon URL (e.g. the active tab's `favIconUrl`). Takes
     * precedence over the generated endpoints and costs zero requests.
     */
    iconUrl?: string;
    className?: string;
    alt?: string;
}

/**
 * Cross-browser website icon with fallbacks.
 *
 * 1. Explicit `iconUrl` when given (e.g. Firefox popup: the browser already
 *    resolved the open tab's icon, so this costs no requests).
 * 2. Chromium `/_favicon/` endpoint (fast path, needs `favicon` permission).
 * 3. `<origin>/favicon.ico` (covered by `<all_urls>`).
 * 4. `Globe` placeholder when everything fails or no origin is given.
 *
 * No third-party icon service is used. Note fallbacks 2 (outside Chromium)
 * and 3 are direct website requests, not local lookups, so the contacted
 * site can observe them.
 */
export default function SiteIcon({ origin, iconUrl, className, alt = "" }: SiteIconProps) {
    const primary = iconUrl ?? faviconURL(origin);
    const fallback = originFaviconURL(origin);
    const [prevKey, setPrevKey] = useState(() => `${origin ?? ""} ${iconUrl ?? ""}`);
    const [useFallback, setUseFallback] = useState(false);
    const [broken, setBroken] = useState(false);

    const key = `${origin ?? ""} ${iconUrl ?? ""}`;
    if (prevKey !== key) {
        setPrevKey(key);
        setUseFallback(false);
        setBroken(false);
    }

    const src = useFallback ? fallback : primary;

    if (!src || broken) {
        return <Globe className={className} />;
    }

    return (
        <img
            src={src}
            className={className}
            alt={alt}
            onError={() => {
                if (!useFallback && fallback && src !== fallback) {
                    setUseFallback(true);
                } else {
                    setBroken(true);
                }
            }}
        />
    );
}
