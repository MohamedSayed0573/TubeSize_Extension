import { Link } from "react-router";
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from "@components/ui/table";
import { formatBytes } from "@lib/dashboardUtils";

export interface DailyUsage {
    day: string;
    bytes: number;
}

export default function DailyUsageTable({
    usage,
    totalUsage,
}: {
    usage: DailyUsage[];
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
