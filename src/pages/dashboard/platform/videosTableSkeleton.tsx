import { Skeleton } from "@components/ui/skeleton";
import VideoTableRowSkeleton from "./videoTableRowSkeleton";

function HeaderStatSkeleton() {
    return (
        <div className="flex flex-col items-end gap-1.5">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-5 w-16" />
        </div>
    );
}

export default function VideosTableSkeleton({ rows = 8 }: { rows?: number }) {
    return (
        <>
            <div className="flex items-center justify-between gap-5 border-b border-neutral-800 bg-neutral-900 px-4 py-3">
                <div className="flex flex-1 justify-start">
                    <Skeleton className="h-9 w-40 rounded-lg" />
                </div>
                <div className="flex flex-1 justify-center">
                    <Skeleton className="h-6 w-32" />
                </div>
                <div className="flex flex-1 justify-end">
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
