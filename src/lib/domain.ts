import type { Origin, SiteKey } from "@app-types/types";
import { typedEntries } from "@lib/utils";
import { getDomain, getDomainWithoutSuffix, getSubdomain } from "tldts-icann";

function capitalize(str: string): string {
    if (str.length === 0) return str;
    return `${str[0]?.toUpperCase() ?? ""}${str.slice(1)}`;
}

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

function getHostname(value: string) {
    try {
        return new URL(value).hostname.toLowerCase();
    } catch {
        const host = value.toLowerCase();
        return getDomain(host) ? host : undefined;
    }
}

function stripWww(host: string) {
    return host.startsWith("www.") ? host.slice(4) : host;
}

function getOriginDomain(origin: string) {
    return getDomain(origin) ?? origin;
}

function getOriginWithoutSuffix(origin: string) {
    const websiteName = getDomainWithoutSuffix(origin);
    return websiteName ? capitalize(websiteName) : origin;
}

function getGoogleSubdomainHost(url: string) {
    const hostname = getHostname(url);
    if (!hostname) return;

    const host = stripWww(hostname);
    if (!getSubdomain(host) || getDomainWithoutSuffix(host) !== "google") return;

    return host;
}

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

export function getSiteKey(url: Origin | string): SiteKey {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded SiteKey constructor
    return (getGoogleSubdomainHost(url) ?? getOriginDomain(url)) as SiteKey;
}

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

export function sumBySite(origins: Readonly<Record<Origin, number>>): Map<SiteKey, SiteUsageTotal> {
    const totals = new Map<SiteKey, SiteUsageTotal>();

    for (const [origin, bytes] of typedEntries(origins)) {
        const site = getSiteKey(origin);
        const existing = totals.get(site);

        if (existing) existing.bytes += bytes;
        else totals.set(site, { site, bytes, origin });
    }

    return totals;
}
