import { getTab } from "@/runtime";
import { useQuery } from "@tanstack/react-query";

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
