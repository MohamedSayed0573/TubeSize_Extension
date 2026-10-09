export function SettingsFooter() {
    return (
        <div className="flex items-center justify-around p-3">
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
    );
}
