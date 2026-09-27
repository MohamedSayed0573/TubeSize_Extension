import { getDomain, getDomainWithoutSuffix } from "tldts";
import { capitalize } from "./utils";

export function getDomainName(origin: string) {
    return getDomain(origin) ?? origin;
}

export function getOriginWithoutSuffix(origin: string) {
    const websiteName = getDomainWithoutSuffix(origin) ?? origin;
    return capitalize(websiteName);
}
