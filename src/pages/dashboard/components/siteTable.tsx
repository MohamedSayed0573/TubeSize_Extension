import type { SiteUsage } from "@/db";
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from "@components/ui/table";
import { formatBytes, getOriginDisplayName } from "@lib/dashboardUtils";

function getSiteIconUrl(origin: string) {
    try {
        const domain = new URL(origin).hostname;
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch {
        return null;
    }
}

export default function SiteTable({ usage }: { usage: SiteUsage[] }) {
    const usageByOrigin = new Map<string, number>();

    for (const { usage: originUsage } of usage) {
        for (const [origin, bytes] of Object.entries(originUsage)) {
            usageByOrigin.set(origin, (usageByOrigin.get(origin) ?? 0) + bytes);
        }
    }

    const rows = Array.from(usageByOrigin).toSorted(([, a], [, b]) => b - a);
    const totalUsage = rows.reduce((total, [, bytes]) => total + bytes, 0);

    return (
        <section className="flex-1 px-4 pb-4">
            <div className="mx-auto flex max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
                <Table className="font-mono text-sm">
                    <TableHeader className="bg-neutral-800/60 text-xs tracking-wider text-neutral-400 uppercase">
                        <TableRow className="border-neutral-800 hover:bg-transparent">
                            <TableHead className="w-14 px-3 py-3 text-center">#</TableHead>
                            <TableHead className="px-4 py-3">Website</TableHead>
                            <TableHead className="w-32 px-4 py-3 text-right">Data used</TableHead>
                            <TableHead className="w-40 px-4 py-3 text-right">Share</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map(([origin, bytes], index) => {
                            const share = totalUsage ? (bytes / totalUsage) * 100 : 0;
                            const iconUrl = getSiteIconUrl(origin);

                            return (
                                <TableRow
                                    key={origin}
                                    className="border-neutral-800/80 transition-colors hover:bg-neutral-800/50"
                                >
                                    <TableCell className="px-3 py-3 text-center text-neutral-500 tabular-nums">
                                        {index + 1}
                                    </TableCell>
                                    <TableCell className="px-4 py-3">
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            {iconUrl && (
                                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 p-1">
                                                    <img
                                                        src={iconUrl}
                                                        alt=""
                                                        className="h-full w-full rounded-sm"
                                                    />
                                                </span>
                                            )}
                                            <span className="block truncate text-stone-200">
                                                {getOriginDisplayName(origin)}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="px-4 py-3 text-right font-medium whitespace-nowrap text-stone-200 tabular-nums">
                                        {formatBytes(bytes)}
                                    </TableCell>
                                    <TableCell className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-2">
                                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-800">
                                                <div
                                                    className="h-full rounded-full bg-teal-500"
                                                    style={{ width: `${Math.max(share, 2)}%` }}
                                                />
                                            </div>
                                            <span className="w-12 text-right text-teal-400 tabular-nums">
                                                {share.toFixed(1)}%
                                            </span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                    <TableFooter className="border-neutral-800 bg-neutral-800/40">
                        <TableRow className="border-0 hover:bg-transparent">
                            <TableHead
                                colSpan={2}
                                className="px-4 py-3 text-left text-sm text-stone-200"
                            >
                                Total
                            </TableHead>
                            <TableCell className="px-4 py-3 text-right whitespace-nowrap text-stone-100 tabular-nums">
                                {formatBytes(totalUsage)}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right text-teal-400 tabular-nums">
                                100.0%
                            </TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </div>
        </section>
    );
}
