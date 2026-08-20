import { removeFromLocalCache } from "@/lib/cache";
import { getUsageByDay } from "@lib/analyticsUtils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

async function clearAllUsageData() {
    await removeFromLocalCache("usageByDay");
}

export default function useUsage() {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ["usage"],
        queryFn: async () => (await getUsageByDay()) ?? null,
    });

    const clearUsageMutation = useMutation({
        mutationFn: clearAllUsageData,

        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["usage"] });
        },
    });

    /*
        I'm returning query itself here because I've faced issues with TS type narrowing when I returned specific properties.
        Specifically, TS couldn't realize usage is not possibly undefined after checking againt isPending and isError.
    */
    return {
        query,
        clearUsageMutation,
    };
}
