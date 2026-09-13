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
import { useTranslation } from "react-i18next";

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
    const { t } = useTranslation();
    return (
        <section className="flex-1 px-4 pt-4">
            <div className="mx-auto flex max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
                <Table className="font-mono text-sm">
                    <TableHeader className="bg-neutral-800/60 text-xs tracking-wider text-neutral-400 uppercase">
                        <TableRow className="border-neutral-800 hover:bg-transparent">
                            <TableHead className="text-center">#</TableHead>
                            <TableHead>{t("common.date")}</TableHead>
                            <TableHead className="w-20/100">{t("common.share")}</TableHead>
                            <TableHead className="w-30/100">{t("common.dataUsed")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {usage.map(({ bytes, day }, index) => {
                            return (
                                <TableRow
                                    key={day}
                                    className="border-neutral-800/80 text-stone-200 transition-colors hover:bg-neutral-800/50"
                                >
                                    <TableCell className="text-center text-neutral-500">
                                        {index + 1}
                                    </TableCell>
                                    <TableCell className="hover:underline">
                                        <Link to={`/dashboard/${day}`}>{day}</Link>
                                    </TableCell>
                                    <TableCell className="text-neutral-400">
                                        {((bytes / totalUsage) * 100).toFixed(1)}%
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {formatBytes(bytes)}
                                    </TableCell>
                                </TableRow>
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
