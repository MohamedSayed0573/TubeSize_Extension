import "@styles/toast.css";

function mbPerMinuteToPerHour(mbPerMinute: number) {
    return mbPerMinute * 60 > 1000
        ? ((mbPerMinute * 60) / 1000).toFixed(2) + " GB/hour"
        : (mbPerMinute * 60).toFixed(2) + " MB/hour";
}

export default function Toast({
    currentQuality,
    sizePerMinuteMB,
    okOnClick,
    dontShowAgainOnClick,
}: {
    currentQuality: number;
    sizePerMinuteMB: number;
    okOnClick: () => void;
    dontShowAgainOnClick: () => void;
}) {
    return (
        <div className="container">
            <div className="title">TubeSize | Warning: High Data Usage</div>
            <div className="toast">
                Current Quality ({currentQuality}p) uses: {mbPerMinuteToPerHour(sizePerMinuteMB)}.
                Consider switching to a lower quality to save data.
            </div>
            <div className="actions">
                <button onClick={okOnClick}>OK</button>
                <button onClick={dontShowAgainOnClick}>Don't show again for this video</button>
            </div>
        </div>
    );
}
