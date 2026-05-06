import { perHourDisplay, totalSizeVideoDisplay } from "@lib/formatting";
import "@styles/toast.css";

export default function Toast({
    currentQuality,
    sizePerSecondBytes,
    sizeBytes,
    isLive,
    okOnClick,
    dontShowAgainOnClick,
}: {
    currentQuality: number;
    sizePerSecondBytes: number;
    sizeBytes?: number;
    isLive: boolean;
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
                        {!isLive && sizeBytes && (
                            <span>Total Usage: {totalSizeVideoDisplay(sizeBytes)}</span>
                        )}
                        <span>Per Hour Usage: {perHourDisplay(sizePerSecondBytes)}</span>
                    </div>
                </div>
            </div>
            <div className="actions">
                <button className="firstBtn" onClick={okOnClick}>
                    OK
                </button>
                <button onClick={dontShowAgainOnClick}>
                    Don&apos;t show again for this session
                </button>
            </div>
        </div>
    );
}
