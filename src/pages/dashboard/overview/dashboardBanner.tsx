export default function DashboardBanner() {
    return (
        <div className="flex items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-900 px-4 py-1 text-gray-300">
            <div className="flex items-center gap-1">
                <img className="h-6 w-6" src="/icons/icon-32.png" alt="Dashboard Icon" />
                <span className="font-mono text-sm font-bold tracking-wider uppercase">
                    {chrome.i18n.getMessage("dashboard_title")}
                </span>
            </div>
            <div className="flex items-center justify-center gap-3 p-3">
                <div>
                    <a
                        href="https://github.com/MohamedSayed0573/TubeSize_Extension"
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-xs text-zinc-500 no-underline transition-colors hover:text-zinc-400"
                    >
                        <img
                            src="icons/github.svg"
                            width={14}
                            height={14}
                            alt={chrome.i18n.getMessage("common_githubAlt")}
                        />
                        GitHub
                    </a>
                </div>
                <div>
                    <a
                        href="https://ko-fi.com/mohamedsayed253"
                        target="_blank"
                        rel="noreferrer"
                        className="flex gap-2 text-xs text-zinc-500 no-underline transition-colors hover:text-zinc-400"
                    >
                        <img
                            src="icons/support.svg"
                            width={14}
                            height={14}
                            alt={chrome.i18n.getMessage("common_supportAlt")}
                        />
                        {chrome.i18n.getMessage("common_support")}
                    </a>
                </div>
            </div>
        </div>
    );
}
