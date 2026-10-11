import { useState } from "react";
import { Globe } from "lucide-react";
import { faviconURL, isFirefox, originFaviconURL } from "@lib/utils";

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
    const [useFallback, setUseFallback] = useState(false);

    const isBroken = failedOrigin === origin;
    const src = useFallback && !isBroken ? fallback : primary;

    if (!src || isBroken) {
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
                    setFailedOrigin(origin);
                }
            }}
        />
    );
}
