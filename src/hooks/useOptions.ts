import { getAllFromSyncCache, setToSyncCache } from "@lib/cache";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function useOptions() {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: ["options"],
        queryFn: async () => (await getAllFromSyncCache()) ?? {},
    });

    const mutation = useMutation({
        mutationFn: setToSyncCache,

        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["options"] });
        },
    });

    return {
        query,
        updateOptions: mutation.mutate,
        updateIsPending: mutation.isPending,
        updateIsError: mutation.isError,
    };
}
