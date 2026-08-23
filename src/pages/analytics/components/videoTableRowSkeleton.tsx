import { Skeleton } from "@components/ui/skeleton";

export default function VideoTableRowSkeleton() {
    return (
        <tr>
            <td className="border-b border-neutral-800 px-3 py-3 text-center">
                <Skeleton className="mx-auto h-4 w-4" />
            </td>

            <td className="flex items-center gap-5 border-b border-neutral-800 px-3 py-3 text-left">
                <Skeleton className="aspect-video h-17.5 rounded-lg" />

                <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-2/5" />
                    <Skeleton className="h-3 w-1/3" />
                </div>
            </td>

            <td className="border-b border-neutral-800 px-3 py-3 text-left">
                <Skeleton className="h-4 w-12" />
            </td>
        </tr>
    );
}
