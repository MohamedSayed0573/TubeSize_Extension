import { getAllFromSyncCache } from "@/lib/cache";
import { useEffect, useState } from "react";

export default function useOptions() {
    const [optionsState, setOptionsState] = useState<Record<any, any>>({});
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        void (async () => {
            try {
                const options = await getAllFromSyncCache();
                setOptionsState(options ?? {});
            } catch (err) {
                console.error("Failed to load options from cache:", err);
                setError(err as Error);
            }
        })();
    }, []);

    return { optionsState, setOptionsState, error };
}
