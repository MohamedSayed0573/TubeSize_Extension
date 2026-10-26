import { getDomainWithoutSuffix, getSubdomain } from "tldts-icann";

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

/** Hostname of an origin, tolerating bare hosts ("maps.google.com"). */
function getHostname(value: string) {
    try {
        return new URL(value).hostname.toLowerCase();
    } catch {
        return value.toLowerCase();
    }
}

/** `www.` never changes which site an origin belongs to. */
function stripWww(host: string) {
    return host.startsWith("www.") ? host.slice(4) : host;
}

function getOriginWithoutSuffix(origin: string) {
    const websiteName = getDomainWithoutSuffix(origin) ?? origin;
    return capitalize(websiteName);
}

/** Google subdomain host (`console.cloud.google.com`), else undefined. */
function getGoogleSubdomainHost(url: string) {
    const host = stripWww(getHostname(url));
    if (!getSubdomain(host) || getDomainWithoutSuffix(host) !== "google") return;

    return host;
}

/** Last label before the Google domain: `console.cloud.google.com` -> `cloud`. */
function getGoogleProduct(host: string) {
    return getSubdomain(host)?.split(".").filter(Boolean).at(-1) ?? "";
}

/**
 * Site name for an origin: the domain name without its suffix
 * (`https://www.example.com` -> `Example`).
 *
 * Google is the exception. It serves many products from subdomains of one
 * registrable domain and they share its favicon, so `maps.google.com` and
 * `gemini.google.com` would both become `Google`. Google subdomains keep their
 * full hostname as the site name instead.
 */
export function getSiteName(url: string) {
    return getGoogleSubdomainHost(url) ?? getOriginWithoutSuffix(url);
}

/** Display name for the popup: `Google Drive` instead of `drive.google.com`. */
export function getSiteLabel(url: string) {
    const host = getGoogleSubdomainHost(url);
    if (!host) return getSiteName(url);

    return GOOGLE_PRODUCT_NAMES[getGoogleProduct(host)] ?? "Google";
}

export interface DomainUsage {
    domain: string;
    bytes: number;
    origin: string;
}

/*
 * Merges origin-keyed bytes (e.g. https://accounts.google.com and
 * https://www.google.com) into totals keyed by getSiteName(), so Google
 * subdomains stay separate while everything else merges by site name.
 */
export function sumByDomain(origins: Record<string, number>): Map<string, DomainUsage> {
    const totals = new Map<string, DomainUsage>();

    for (const [origin, bytes] of Object.entries(origins)) {
        const domain = getSiteName(origin);
        const existing = totals.get(domain);

        if (existing) existing.bytes += bytes;
        else totals.set(domain, { domain, bytes, origin });
    }

    return totals;
}
