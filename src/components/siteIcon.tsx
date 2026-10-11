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
