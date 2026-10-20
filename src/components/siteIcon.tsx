import { faviconURL, isFirefox, originFaviconURL } from "@lib/utils";
import { Globe } from "lucide-react";
import { useState } from "react";

interface SiteIconProps {
    origin?: string;
    className?: string;
    alt?: string;
}

/**
 * Website icon: Chromium `/_favicon/`, else `<origin>/favicon.ico` (a direct
 * website request), else a `Globe` placeholder. No third-party service.
 */
export default function SiteIcon({ origin, className, alt = "" }: SiteIconProps) {
    const isFirefoxBrowser = isFirefox();
    const primary = isFirefoxBrowser ? originFaviconURL(origin) : faviconURL(origin);
    const fallback = isFirefoxBrowser ? undefined : originFaviconURL(origin);

    const [failedOrigin, setFailedOrigin] = useState<string | undefined>();
    const [fallbackOrigin, setFallbackOrigin] = useState<string | undefined>();

    const isBroken = failedOrigin === origin;
    const isUsingFallback = fallbackOrigin !== undefined && fallbackOrigin === origin;
    const src = isUsingFallback && !isBroken ? fallback : primary;

    if (!src || isBroken) {
        return <Globe className={className} />;
    }

    return (
        <img
            src={src}
            className={className}
            alt={alt}
            onError={() => {
                if (!isUsingFallback && fallback && src !== fallback) {
                    setFallbackOrigin(origin);
                } else {
                    setFailedOrigin(origin);
                }
            }}
        />
    );
}
