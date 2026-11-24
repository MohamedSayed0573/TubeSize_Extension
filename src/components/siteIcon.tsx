import { faviconURL, isFirefox, originFaviconURL } from "@lib/browser";
import { Globe } from "lucide-react";
import { useState } from "react";

interface SiteIconProps {
    origin?: string;
    className?: string;
    alt?: string;
}

export default function SiteIcon({ origin, className, alt = "" }: SiteIconProps) {
    // `/_favicon/` is Chromium-only, so Firefox goes straight to the site favicon.
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
