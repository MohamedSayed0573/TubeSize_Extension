import { useState } from "react";
import { Globe } from "lucide-react";
import { faviconURL, isFirefox, originFaviconURL } from "@lib/utils";

interface SiteIconProps {
    origin?: string;
    className?: string;
    alt?: string;
}

/**
 * Cross-browser website icon with fallbacks.
 *
 * - Chromium: `/_favicon/` endpoint (fast path, needs `favicon` permission),
 *   then `<origin>/favicon.ico`.
 * - Firefox (no `/_favicon/` endpoint): `<origin>/favicon.ico` directly. The
 *   popup only shows the open site, whose icon the browser has typically
 *   cached already.
 * - `Globe` placeholder when everything fails or no origin is given.
 *
 * No third-party icon service is used. Note the `/favicon.ico` fallback is a
 * direct website request, not a local lookup, so the contacted site can
 * observe it. Callers showing icons for closed-tab history (like the
 * dashboard on Firefox) should render `Globe` instead of using this.
 */
export default function SiteIcon({ origin, className, alt = "" }: SiteIconProps) {
    // Skip the Chromium-only endpoint on Firefox where it cannot resolve.
    const primary = isFirefox() ? originFaviconURL(origin) : faviconURL(origin);
    const fallback = isFirefox() ? undefined : originFaviconURL(origin);
    const [prevOrigin, setPrevOrigin] = useState(origin);
    const [useFallback, setUseFallback] = useState(false);
    const [broken, setBroken] = useState(false);

    if (prevOrigin !== origin) {
        setPrevOrigin(origin);
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
