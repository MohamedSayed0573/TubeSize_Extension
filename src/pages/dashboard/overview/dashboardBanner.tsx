export default function DashboardBanner() {
    return (
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-900 px-4 py-1 text-gray-300">
            <div className="flex items-center gap-1">
                <img className="h-6 w-6" src="/icons/icon-32.png" alt="Dashboard Icon" />
                <span className="font-mono text-sm font-bold tracking-wider uppercase">
                    Usage Dashboard for YouTube
                </span>
            </div>
            <div className="flex items-center justify-center gap-3 p-3">
                <div>
                    <a
                        href="https://github.com/MohamedSayed0573/TubeSize_Extension"
                        target="_blank"
                        rel="noreferrer"
                        className="flex gap-2 text-xs text-zinc-500 no-underline transition-colors hover:text-zinc-400"
                    >
                        <img src="icons/github.svg" width="14" height="14" />
                        @Mohamed Sayed
                    </a>
                </div>
                <div>
                    <a
                        href="https://ko-fi.com/mohamedsayed253"
                        target="_blank"
                        rel="noreferrer"
                        className="flex gap-2 text-xs text-zinc-500 no-underline transition-colors hover:text-zinc-400"
                    >
                        <img src="icons/support.svg" width="14" height="14" />
                        Support Me
                    </a>
                </div>
            </div>
        </div>
    );
}
