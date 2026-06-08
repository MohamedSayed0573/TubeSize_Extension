import {
    formatBytes,
    getNumVideosWatched,
    getUsageByDay,
    type UsageByDay,
} from "@lib/analyticsUtils";
import { useEffect, useState } from "react";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";

function getLifeTimeDateRange(usageByDay: UsageByDay) {
    const dates = Object.keys(usageByDay);
    if (dates.length === 0) {
        return "No data";
    }

    const startDate = new Date(dates[0]!);
    const endDate = new Date(dates.at(-1)!);

    return `${startDate.toDateString().split(" ").slice(1).join(" ")} -> ${endDate.toDateString().split(" ").slice(1).join(" ")}`;
}

function getTotalUsage(lifeTimeUsage: UsageByDay) {
    let total = 0;
    for (const day in lifeTimeUsage) {
        for (const videoTag in lifeTimeUsage[day]) {
            const videoUsage = lifeTimeUsage[day][videoTag] ?? { usage: 0 };
            total += videoUsage.usage;
        }
    }
    return total;
}

export default function LifetimeUsage() {
    const [lifeTimeUsage, setLifeTimeUsage] = useState<UsageByDay>({});

    useEffect(() => {
        void (async () => {
            const usage = await getUsageByDay();
            setLifeTimeUsage(usage);
        })();
    }, []);

    return (
        <>
            <div className="usage-details">
                <AnalyticsHeader
                    title={getLifeTimeDateRange(lifeTimeUsage)}
                    totalDataUsage={formatBytes(getTotalUsage(lifeTimeUsage))}
                    numVideosWatched={getNumVideosWatched(lifeTimeUsage)}
                />
                <AnalyticsBody usage={lifeTimeUsage} />
            </div>
        </>
    );
}
