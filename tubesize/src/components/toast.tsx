import "@styles/toast.css";

function format(sizePerMinuteMB: number, durationMinutes: string) {
    const minutes = parseInt(durationMinutes);
    const totalMB = sizePerMinuteMB * minutes;
    if (minutes < 60) {
        if (totalMB > 1000) {
            return (totalMB / 1000).toFixed(2) + " GB";
        }
        return totalMB.toFixed(2) + " MB";
    } else {
        if (totalMB > 1000) {
            return (totalMB / 1000).toFixed(2) + " GB/hour";
        }
        return totalMB.toFixed(2) + " MB/hour";
    }
}

export default function Toast({
    currentQuality,
    sizePerMinuteMB,
    durationMinutes,
    okOnClick,
    dontShowAgainOnClick,
}: {
    currentQuality: number;
    sizePerMinuteMB: number;
    durationMinutes: string;
    okOnClick: () => void;
    dontShowAgainOnClick: () => void;
}) {
    return (
        <div className="container">
            <div className="title">TubeSize | Warning: High Data Usage</div>
            <div className="toast">
                Current Quality ({currentQuality}p) uses: {format(sizePerMinuteMB, durationMinutes)}
                . Consider switching to a lower quality to save data.
            </div>
            <div className="actions">
                <button onClick={okOnClick}>OK</button>
                <button onClick={dontShowAgainOnClick}>Don't show again for this video</button>
            </div>
        </div>
    );
}
