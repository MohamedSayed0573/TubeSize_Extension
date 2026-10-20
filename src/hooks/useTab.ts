import { useQuery } from "@tanstack/react-query";

import { getTab } from "@/runtime";

export default function useTab() {
    return useQuery({
        queryKey: ["tab"],
        queryFn: async () => {
            const activeTab = await getTab();
            return {
                tabId: activeTab?.id,
                tabUrl: activeTab?.url,
            };
        },
    });
}
