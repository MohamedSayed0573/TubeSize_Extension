import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { storage } from "@wxt-dev/storage";

const lastSeenVersion = storage.defineItem<string>("local:lastSeenVersion");

async function checkLastSeenVersion(version: string): Promise<boolean> {
    try {
        const seenVersion = await lastSeenVersion.getValue();
        if (seenVersion === null) {
            await lastSeenVersion.setValue(version);
            return false;
        }

        return seenVersion !== version;
    } catch (err) {
        console.error("Failed to check the last seen version", err);
        return false;
    }
}

export default function useChangelogNotice() {
    const version = chrome.runtime.getManifest().version;
    const queryClient = useQueryClient();
    const queryKey = ["changelogNotice", version] as const;

    const query = useQuery({
        queryKey,
        queryFn: () => checkLastSeenVersion(version),
    });

    const dismissMutation = useMutation({
        mutationFn: () => lastSeenVersion.setValue(version),
        onMutate: async () => {
            queryClient.setQueryData<boolean>(queryKey, false);
            await queryClient.cancelQueries({ queryKey });
        },
        onError: (err) => {
            console.error("Failed to save the last seen version", err);
        },
    });

    return {
        version,
        isNewRelease: query.data ?? false,
        dismiss: () => {
            dismissMutation.mutate();
        },
    };
}
