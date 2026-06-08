import { useNavigate } from "react-router";

export default function AnalyticsHeader({
    title,
    totalDataUsage,
    numVideosWatched,
}: {
    title: string;
    totalDataUsage: string;
    numVideosWatched: number;
}) {
    const navigate = useNavigate();

    return (
        <div className="flex items-center justify-between gap-5 border-b border-neutral-800 bg-neutral-900 p-2.5 text-lg font-bold">
            <button
                className="flex cursor-pointer items-center justify-center rounded-lg border border-teal-900 bg-teal-950 p-2.5 font-mono text-sm font-bold text-teal-400 hover:border-teal-800 hover:bg-teal-900"
                onClick={() => {
                    void navigate("/analytics");
                }}
            >
                ← Back to Analytics
            </button>
            <div className="w-1/2 font-mono text-lg text-teal-400">{title}</div>
            <div className="flex flex-1 items-center justify-evenly">
                <div className="flex flex-col gap-2.5">
                    <div className="font-mono text-xs text-teal-400 uppercase">
                        {"Total Data Used"}
                    </div>
                    <div className="flex items-center justify-center font-mono text-lg font-bold">
                        {totalDataUsage}
                    </div>
                </div>
                <div className="flex flex-col gap-2.5">
                    <div className="font-mono text-xs text-teal-400 uppercase">
                        {"Videos Watched"}
                    </div>
                    <div className="flex items-center justify-center font-mono text-lg font-bold">
                        {numVideosWatched}
                    </div>
                </div>
            </div>
        </div>
    );
}
