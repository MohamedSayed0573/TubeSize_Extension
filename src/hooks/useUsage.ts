import { removeFromLocalCache } from "@/lib/cache";
import { getUsageByDay } from "@lib/analyticsUtils";
import { useMutation, useQuery } from "@tanstack/react-query";

async function clearAllUsageData() {
    await removeFromLocalCache("usageByDay");
}

export default function useUsage() {
    const query = useQuery({
        queryKey: ["usage"],
        queryFn: getUsageByDay,
    });

    const mutation = useMutation({
        mutationFn: clearAllUsageData,
    });

    /*
        I'm returning query itself here because I've faced issues with TS type narrowing when I returned specific properties.
        Specifically, TS couldn't realize usage is not possibly undefined after checking againt isPending and isError.
    */
    return {
        query,
        clearUsage: mutation.mutate,
        isClearing: mutation.isPending,
        isClearingError: mutation.isError,
        isClearingSuccess: mutation.isSuccess,
    };
}
