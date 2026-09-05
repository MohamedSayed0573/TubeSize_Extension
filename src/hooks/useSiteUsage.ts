import { getAllSiteUsage } from "@/db";
import { useQuery } from "@tanstack/react-query";

export function useSiteUsage() {
    return useQuery({
        queryKey: ["siteUsage"],
        queryFn: async () => {
            return (await getAllSiteUsage()) ?? null;
        },
    });
}
