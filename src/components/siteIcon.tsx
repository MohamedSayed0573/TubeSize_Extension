import { useEffect, useState } from "react";
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
    const firefox = isFirefox();
    const primary = firefox ? originFaviconURL(origin) : faviconURL(origin);
    const fallback = firefox ? undefined : originFaviconURL(origin);

    const [useFallback, setUseFallback] = useState(false);
    const [broken, setBroken] = useState(false);

    useEffect(() => {
        setUseFallback(false);
        setBroken(false);
    }, [origin]);

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
