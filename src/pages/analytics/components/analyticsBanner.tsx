export default function AnalyticsBanner() {
    return (
        <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-900 px-5 py-3.5 text-gray-300">
            <img className="h-6 w-6" src="/icons/icon-32.png" alt="Analytics Icon" />
            <span className="font-mono text-sm font-bold tracking-wider uppercase">
                Usage Analytics for YouTube
            </span>
        </div>
    );
}
