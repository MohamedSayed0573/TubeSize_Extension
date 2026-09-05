import type { SiteUsage } from "@/db";
import { formatBytes } from "@lib/dashboardUtils";

function getOriginDisplayName(origin: string) {
    try {
        return new URL(origin).hostname.replace(/^www\./, "");
    } catch {
        return origin;
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

    return (
        <>
            {/* All websites besides Youtube, Twitch, Kick */}
            <table className="border-collapse border-spacing-0">
                <thead className="border-b border-neutral-800 font-mono text-sm uppercase">
                    <tr>
                        <th className="w-15 px-3.5 py-3.5 text-center">#</th>
                        <th className="px-3.5 py-3.5 text-left">WEBSITE</th>
                        <th className="px-3.5 py-3.5 text-left">DATA USED</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(([origin, bytes], index) => (
                        <tr key={origin} className="hover:bg-neutral-800">
                            <td className="border-b border-neutral-800 px-3 py-3 text-center font-mono text-sm text-stone-200">
                                {index + 1}
                            </td>
                            <td className="border-b border-neutral-800 px-3 py-3 text-left font-mono text-sm text-stone-200">
                                {getOriginDisplayName(origin)}
                            </td>
                            <td className="border-b border-neutral-800 px-3 py-3 text-left font-mono text-base text-stone-200">
                                {formatBytes(bytes)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}
