import "@styles/toast.css";

function perHourFormat(sizePerMinuteMB: number) {
    const perHourMB = sizePerMinuteMB * 60;
    if (perHourMB > 1000) {
        return (perHourMB / 1000).toFixed(1) + " GB/hour";
    }
    return perHourMB.toFixed(1) + " MB/hour";
}

export default function Toast({
    currentQuality,
    sizePerMinuteMB,
    sizeMB,
    okOnClick,
    dontShowAgainOnClick,
}: {
    currentQuality: number;
    sizePerMinuteMB: number;
    sizeMB: string;
    okOnClick: () => void;
    dontShowAgainOnClick: () => void;
}) {
    return (
        <div className="container">
            <div className="title">TubeSize | Warning: High Data Usage</div>
            <div className="toast">
                High Data Usage Detected for {currentQuality}p. It crosses the threshold specified
                in your settings.
                <div>
                    <span className="current-quality">Current Quality: {currentQuality}p</span>
                    <div className="toast-inner">
                        <span>Total Usage: {sizeMB}</span>
                        <span>Per Hour Usage: {perHourFormat(sizePerMinuteMB)}</span>
                    </div>
                </div>
            </div>
            <div className="actions">
                <button className="firstBtn" onClick={okOnClick}>
                    OK
                </button>
                <button onClick={dontShowAgainOnClick}>Don't show again for this session</button>
            </div>
        </div>
    );
}
