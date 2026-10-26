import { getDomain, getDomainWithoutSuffix } from "tldts-icann";

import { capitalize } from "./utils";

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

/**
 * Site name for an origin: the domain name without its suffix
 * (`https://www.example.com` -> `Example`).
 *
 * Google is the exception. It serves many products from subdomains of one
 * registrable domain and they share its favicon, so `maps.google.com` and
 * `gemini.google.com` would both become `Google`. Google subdomains keep their
 * full hostname as the site name instead.
 */
export function getSiteName(origin: string) {
    const host = stripWww(getHostname(origin));
    const domain = getDomain(host);

    if (domain && domain !== host && getDomainWithoutSuffix(domain) === "google") return host;

    return getOriginWithoutSuffix(origin);
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
