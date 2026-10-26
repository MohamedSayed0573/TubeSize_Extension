import { getDomain, getDomainWithoutSuffix, getSubdomain } from "tldts-icann";

import { capitalize } from "./utils";

/*
 * Google serves its products from subdomains of one registrable domain and
 * they share its favicon. The dashboard keeps the hostname (`drive.google.com`)
 * as the site name, but the popup shows the product name instead.
 */
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

/** Hostname of a URL, or undefined when the value is not a URL. */
function getHostname(url: string) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return undefined;
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

/**
 * Stable key for the site a URL belongs to: the registrable domain
 * (`https://www.example.com` -> `example.com`), or the origin itself when it
 * has no domain name (`http://127.0.0.1:8080`). Domains that share a name but
 * not a suffix (`example.com` and `example.org`) stay separate.
 *
 * Google is the exception. It serves many products from subdomains of one
 * registrable domain and they share its favicon, so `maps.google.com` and
 * `gemini.google.com` would both become `google.com`. Google subdomains keep
 * their full hostname as the site key instead.
 */
export function getSiteKey(url: string) {
    return getGoogleSubdomainHost(url) ?? getOriginDomain(url);
}

/** Display name for the popup: `Google Drive` instead of `drive.google.com`. */
export function getSiteLabel(url: string) {
    const host = getGoogleSubdomainHost(url);
    if (!host) return getOriginWithoutSuffix(url);

    return GOOGLE_PRODUCT_NAMES[getGoogleProduct(host)] ?? "Google";
}

/**
 * Display name for dashboard rows: Google subdomains keep their hostname
 * (`maps.google.com`), everything else drops the suffix (`Example`).
 */
export function getSiteDisplayName(url: string) {
    return getGoogleSubdomainHost(url) ?? getOriginWithoutSuffix(url);
}

export interface SiteUsageTotal {
    site: string;
    bytes: number;
    origin: string;
}

/*
 * Merges origin-keyed bytes (e.g. https://accounts.google.com and
 * https://www.google.com) into totals keyed by getSiteKey(), so Google
 * subdomains stay separate while everything else merges by registrable domain.
 */
export function sumBySite(origins: Record<string, number>): Map<string, SiteUsageTotal> {
    const totals = new Map<string, SiteUsageTotal>();

    for (const [origin, bytes] of Object.entries(origins)) {
        const site = getSiteKey(origin);
        const existing = totals.get(site);

        if (existing) existing.bytes += bytes;
        else totals.set(site, { site, bytes, origin });
    }

    return totals;
}
