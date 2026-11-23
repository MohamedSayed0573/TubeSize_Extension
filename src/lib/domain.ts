import type { Origin, SiteKey } from "@app-types/types";
import { getDomain, getDomainWithoutSuffix, getSubdomain } from "tldts-icann";

function capitalize(str: string): string {
    if (str.length === 0) return str;
    return `${str[0]?.toUpperCase() ?? ""}${str.slice(1)}`;
}

// Google products share one registrable domain and favicon; keys keep the
// hostname, but labels show the product name.
const GOOGLE_PRODUCT_NAMES: Record<string, string> = {
    accounts: "Google Account",
    ads: "Google Ads",
    analytics: "Google Analytics",
    books: "Google Books",
    calendar: "Google Calendar",
    chat: "Google Chat",
    classroom: "Google Classroom",
    cloud: "Google Cloud",
    contacts: "Google Contacts",
    docs: "Google Docs",
    drive: "Google Drive",
    earth: "Google Earth",
    forms: "Google Forms",
    gemini: "Google Gemini",
    groups: "Google Groups",
    keep: "Google Keep",
    mail: "Gmail",
    maps: "Google Maps",
    meet: "Google Meet",
    news: "Google News",
    notebooklm: "NotebookLM",
    photos: "Google Photos",
    play: "Google Play",
    scholar: "Google Scholar",
    sheets: "Google Sheets",
    sites: "Google Sites",
    slides: "Google Slides",
    store: "Google Store",
    translate: "Google Translate",
    voice: "Google Voice",
    workspace: "Google Workspace",
};

/** Hostname of a URL or a bare site key, or undefined when it has no domain name. */
function getHostname(value: string) {
    try {
        return new URL(value).hostname.toLowerCase();
    } catch {
        const host = value.toLowerCase();
        return getDomain(host) ? host : undefined;
    }
}

/** `www.` never changes which site an origin belongs to. */
function stripWww(host: string) {
    return host.startsWith("www.") ? host.slice(4) : host;
}

/** `example.com` for any origin on that domain, the origin itself otherwise. */
function getOriginDomain(origin: string) {
    return getDomain(origin) ?? origin;
}

/** `Example` for example.com, the origin itself when it has no domain name. */
function getOriginWithoutSuffix(origin: string) {
    const websiteName = getDomainWithoutSuffix(origin);
    return websiteName ? capitalize(websiteName) : origin;
}

/** Google subdomain host (`console.cloud.google.com`), else undefined. */
function getGoogleSubdomainHost(url: string) {
    const hostname = getHostname(url);
    if (!hostname) return;

    const host = stripWww(hostname);
    if (!getSubdomain(host) || getDomainWithoutSuffix(host) !== "google") return;

    return host;
}

/** Last label before the Google domain: `console.cloud.google.com` -> `cloud`. */
function getGoogleProduct(host: string) {
    return getSubdomain(host)?.split(".").filter(Boolean).at(-1) ?? "";
}

export function isOrigin(value: unknown): value is Origin {
    if (typeof value !== "string" || value.length === 0) return false;
    if (value === "null") return true;
    try {
        return new URL(value).origin === value;
    } catch {
        return false;
    }
}

export function toOrigin(url: string): Origin | undefined {
    try {
        const origin = new URL(url).origin;
        return isOrigin(origin) ? origin : undefined;
    } catch {
        return undefined;
    }
}

// Site key: the registrable domain (`https://www.example.com` -> `example.com`),
// or the origin itself without one. Google subdomains keep their full hostname.
export function getSiteKey(url: Origin | string): SiteKey {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded SiteKey constructor
    return (getGoogleSubdomainHost(url) ?? getOriginDomain(url)) as SiteKey;
}

/** Display name for the popup: `Google Drive` instead of `drive.google.com`. */
export function getSiteLabel(url: Origin | SiteKey | string) {
    const host = getGoogleSubdomainHost(url);
    if (!host) return getOriginWithoutSuffix(url);

    return GOOGLE_PRODUCT_NAMES[getGoogleProduct(host)] ?? "Google";
}

export interface SiteUsageTotal {
    site: SiteKey;
    bytes: number;
    origin: Origin;
}

// Merges origin-keyed bytes into totals keyed by getSiteKey(), so Google
// subdomains stay separate while everything else merges by registrable domain.
export function sumBySite(origins: Readonly<Record<Origin, number>>): Map<SiteKey, SiteUsageTotal> {
    const totals = new Map<SiteKey, SiteUsageTotal>();

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Record<Origin, number> keys are branded Origins
    for (const [origin, bytes] of Object.entries(origins) as Array<[Origin, number]>) {
        const site = getSiteKey(origin);
        const existing = totals.get(site);

        if (existing) existing.bytes += bytes;
        else totals.set(site, { site, bytes, origin });
    }

    return totals;
}
