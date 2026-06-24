export default function StatsCard({ title, value }: { title: string; value: string }) {
    return (
        <div className="flex flex-col justify-center gap-2.5 rounded-lg border border-amber-950 bg-neutral-900 py-4 pr-2.5 pl-5.5 hover:cursor-pointer hover:bg-neutral-800">
            <div className="font-mono text-sm font-semibold text-teal-400 uppercase">{title}</div>
            <div className="flex justify-between font-mono text-2xl font-bold text-stone-200">
                {value}
                <div className="flex items-end font-mono text-xs text-red-600 underline">
                    View Details
                </div>
            </div>
        </div>
    );
}
