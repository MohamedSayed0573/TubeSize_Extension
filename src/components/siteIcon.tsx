import { useState } from "react";
import { Globe } from "lucide-react";
import { faviconURL, originFaviconURL } from "@lib/utils";

interface SiteIconProps {
    origin?: string;
    className?: string;
    alt?: string;
}

/**
 * Cross-browser website icon with local-only fallbacks.
 *
 * 1. Chromium `/_favicon/` endpoint (fast path, needs `favicon` permission).
 * 2. `<origin>/favicon.ico` (works on Firefox, covered by `<all_urls>`).
 * 3. `Globe` placeholder when both fail or no origin is given.
 *
 * No third-party icon service is used, so no visited domains leak.
 */
export default function SiteIcon({ origin, className, alt = "" }: SiteIconProps) {
    const primary = faviconURL(origin);
    const fallback = originFaviconURL(origin);
    const [prevOrigin, setPrevOrigin] = useState(origin);
    const [useFallback, setUseFallback] = useState(false);
    const [broken, setBroken] = useState(false);

    if (prevOrigin !== origin) {
        setPrevOrigin(origin);
        setUseFallback(false);
        setBroken(false);
    }

    const src = useFallback ? fallback : (primary ?? fallback);

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
