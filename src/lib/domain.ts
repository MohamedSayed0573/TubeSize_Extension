import { getDomain, getDomainWithoutSuffix } from "tldts-icann";
import { capitalize } from "./utils";

function getDomainName(origin: string) {
    return getDomain(origin) ?? origin;
}

export function getOriginWithoutSuffix(origin: string) {
    const websiteName = getDomainWithoutSuffix(origin) ?? origin;
    return capitalize(websiteName);
}

export interface DomainUsage {
    domain: string;
    bytes: number;
    origin: string;
}

/*
 * Merges origin-keyed bytes (e.g. https://accounts.google.com and
 * https://www.google.com) into totals keyed by registrable domain.
 */
export function sumByDomain(origins: Record<string, number>): Map<string, DomainUsage> {
    const totals = new Map<string, DomainUsage>();

    for (const [origin, bytes] of Object.entries(origins)) {
        const domain = getDomainName(origin);
        const existing = totals.get(domain);

        if (existing) existing.bytes += bytes;
        else totals.set(domain, { domain, bytes, origin });
    }

    return totals;
}
