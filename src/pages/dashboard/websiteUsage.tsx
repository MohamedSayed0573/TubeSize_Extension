import DashboardHeader from "@pages/dashboard/components/dashboardHeader";
import NoUsageData from "@pages/dashboard/components/noUsageData";
import { Link, useParams } from "react-router";
import { useSiteUsage } from "@hooks/useSiteUsage";
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from "@components/ui/table";
import { formatBytes, getOriginWithoutSuffix } from "@lib/dashboardUtils";

export function WebsiteUsage() {
    const { siteName } = useParams();
    const { data, isPending, isError, error } = useSiteUsage();

    if (!siteName) return;
    if (isPending) return;
    if (isError) throw error;
    if (!data) return <NoUsageData />;

    const dayToBytes: Map<string, number> = new Map();
    data.forEach(({ day, usage }) => {
        const bytes = Object.entries(usage)
            .filter(([origin]) => getOriginWithoutSuffix(origin) === siteName)
            .map(([, bytes]) => bytes)
            .reduce((sum, current) => sum + current, 0);

        dayToBytes.set(day, bytes);
    });

    const totolUsage = [...dayToBytes].reduce((sum, [, bytes]) => sum + bytes, 0);

    const sortedUsage = Array.from(dayToBytes)
        .filter(([, bytes]) => bytes > 0)
        .toSorted(([, a], [, b]) => b - a)
        .map(([day, bytes]) => {
            return { day, bytes };
        });

    return (
        <>
            <DashboardHeader title={siteName} totalDataUsage={totolUsage} />
            <div className="flex flex-1 flex-col gap-1 bg-neutral-950/70 pt-1">
                <SiteTable usage={sortedUsage} totalUsage={totolUsage} />
            </div>
        </>
    );
}

function SiteTable({
    usage,
    totalUsage,
}: {
    usage: { day: string; bytes: number }[];
    totalUsage: number;
}) {
    return (
        <section className="flex-1 px-4 pt-4">
            <div className="mx-auto flex max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
                <Table className="font-mono text-sm">
                    <TableHeader className="bg-neutral-800/60 text-xs tracking-wider text-neutral-400 uppercase">
                        <TableRow className="border-neutral-800 hover:bg-transparent">
                            <TableHead className="w-14 px-3 py-3 text-center">#</TableHead>
                            <TableHead className="px-4 py-3">Date</TableHead>
                            <TableHead className="w-24 px-4 py-3 text-right">Share</TableHead>
                            <TableHead className="w-32 px-4 py-3 text-right">Data used</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {usage.map(({ bytes, day }, index) => {
                            return (
                                <TableRow
                                    key={day}
                                    className="border-neutral-800/80 transition-colors hover:bg-neutral-800/50"
                                >
                                    <TableCell className="px-3 py-3 text-center text-neutral-500">
                                        {index + 1}
                                    </TableCell>
                                    <TableCell className="px-4 py-3">
                                        <div className="group flex min-w-0 items-center gap-2.5">
                                            <Link to={`/dashboard/${day}`}>
                                                <span className="block truncate text-stone-200 underline-offset-2 transition-colors hover:text-teal-200 hover:underline">
                                                    {day}
                                                </span>
                                            </Link>
                                        </div>
                                    </TableCell>
                                    <TableCell className="truncate px-4 py-3 text-right text-neutral-400">
                                        {((bytes / totalUsage) * 100).toFixed(1)}%
                                    </TableCell>
                                    <TableCell className="px-4 py-3 text-right font-medium whitespace-nowrap text-stone-200">
                                        {formatBytes(bytes)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                    <TableFooter className="border-neutral-800 bg-neutral-800/40">
                        <TableRow className="border-0 hover:bg-transparent">
                            <TableHead
                                colSpan={2}
                                className="px-8 py-3 text-left text-sm text-stone-200"
                            >
                                Total
                            </TableHead>
                            <TableCell className="px-4 py-3" />
                            <TableCell className="px-4 py-3 text-right whitespace-nowrap text-stone-100">
                                {formatBytes(totalUsage)}
                            </TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </div>
        </section>
    );
}
