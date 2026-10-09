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
import { formatBytes } from "@lib/format";
import { sumByDomain, type DomainUsage } from "@lib/domain";
import { faviconURL } from "@lib/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export default function AllSitesTable({ usage }: { usage: SiteUsage[] }) {
    const { t } = useTranslation();
    const usageByOrigin: Record<string, number> = {};

    for (const { usage: originUsage } of usage) {
        for (const [origin, bytes] of Object.entries(originUsage)) {
            usageByOrigin[origin] = (usageByOrigin[origin] ?? 0) + bytes;
        }
    }

    const rows = Array.from(sumByDomain(usageByOrigin).values()).toSorted(
        (a, b) => b.bytes - a.bytes,
    );
    const totalUsage = rows.reduce((total, { bytes }) => total + bytes, 0);

    return (
        <section className="flex-1 px-4 py-4">
            <div className="mx-auto flex max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
                <Table className="font-mono text-sm">
                    <TableHeader className="bg-neutral-800/60 text-xs tracking-wider text-neutral-400 uppercase">
                        <TableRow className="border-neutral-800 hover:bg-transparent">
                            <TableHead className="text-center">#</TableHead>
                            <TableHead>{t("common.website")}</TableHead>
                            <TableHead className="w-10/100">{t("common.share")}</TableHead>
                            <TableHead className="w-20/100">{t("common.dataUsed")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((row, index) => {
                            const share = totalUsage ? (row.bytes / totalUsage) * 100 : 0;
                            return (
                                <SiteRow key={row.domain} index={index} row={row} share={share} />
                            );
                        })}
                    </TableBody>
                    <TableFooter className="border-neutral-800 bg-neutral-800/40">
                        <TableRow className="border-0 hover:bg-transparent">
                            <TableHead colSpan={2} className="text-center text-sm text-stone-200">
                                {t("common.total")}
                            </TableHead>
                            <TableCell className="text-center text-stone-100" colSpan={2}>
                                {formatBytes(totalUsage)}
                            </TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </div>
        </section>
    );
}

function SiteRow({ index, row, share }: { index: number; row: DomainUsage; share: number }) {
    const { t } = useTranslation();

    return (
        <TableRow
            key={index}
            className="border-neutral-800/80 transition-colors hover:bg-neutral-800/50"
        >
            <TableCell className="text-center text-neutral-500">{index + 1}</TableCell>
            <TableCell>
                <div className="flex items-center gap-2.5">
                    <SiteIcon key={row.origin} origin={row.origin} label={t("common.website")} />
                    <span className="block truncate text-stone-200">{row.domain}</span>
                </div>
            </TableCell>
            <TableCell className="">{share.toFixed(1)}%</TableCell>
            <TableCell className="font-medium whitespace-nowrap text-stone-200">
                {formatBytes(row.bytes)}
            </TableCell>
        </TableRow>
    );
}

function SiteIcon({ origin, label }: { origin: string; label: string }) {
    const [failed, setFailed] = useState(false);
    const iconUrl = faviconURL(origin);
    if (!iconUrl || failed) return null;

    return (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 p-1">
            <img
                src={iconUrl}
                onError={() => setFailed(true)}
                className="h-full w-full rounded-sm"
                alt={label}
            />
        </span>
    );
}
