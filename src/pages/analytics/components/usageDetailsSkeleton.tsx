import { Skeleton } from "@components/ui/skeleton";
import VideoTableRowSkeleton from "@pages/analytics/components/videoTableRowSkeleton";

function HeaderStatSkeleton() {
    return (
        <div className="flex flex-col items-center gap-2.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-7 w-20" />
        </div>
    );
}

export default function UsageDetailsSkeleton({ rows = 8 }: { rows?: number }) {
    return (
        <>
            <div className="flex items-center justify-between gap-5 border-b border-neutral-800 bg-neutral-900 p-2.5">
                <Skeleton className="h-10 w-40 rounded-lg" />
                <Skeleton className="h-7 w-1/2" />
                <div className="flex flex-1 items-center justify-evenly">
                    <HeaderStatSkeleton />
                    <HeaderStatSkeleton />
                </div>
            </div>

            <div className="flex flex-1 bg-neutral-950 p-8">
                <div className="flex flex-1 flex-col rounded-2xl border border-neutral-800 bg-neutral-900">
                    <table className="border-collapse border-spacing-0">
                        <thead className="border-b border-neutral-800 font-mono text-sm uppercase">
                            <tr>
                                <th className="w-15 px-3.5 py-3.5 text-center">#</th>
                                <th className="px-3.5 py-3.5 text-left">VIDEO</th>
                                <th className="px-3.5 py-3.5 text-left">DATA USED</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from({ length: rows }, (_, index) => (
                                <VideoTableRowSkeleton key={index} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}
