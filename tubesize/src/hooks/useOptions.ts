import { getAllFromSyncCache } from "@lib/cache";
import { useEffect, useState } from "react";
import type { OptionsMap } from "@app-types/types";

export default function useOptions() {
    const [optionsState, setOptionsState] = useState<OptionsMap>({});
    const [error, setError] = useState<Error | undefined>();

    useEffect(() => {
        void (async () => {
            try {
                const options = await getAllFromSyncCache();
                setOptionsState(options);
            } catch (err) {
                console.error("Failed to load options from cache:", err);
                setError(err as Error);
            }
        })();
    }, []);

    return { optionsState, setOptionsState, error };
}
