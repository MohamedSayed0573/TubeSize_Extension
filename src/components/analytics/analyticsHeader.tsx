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
        <div className="usage-details-header">
            <button
                className="return-btn"
                onClick={() => {
                    void navigate("/analytics");
                }}
            >
                ← Back to Analytics
            </button>
            <div className="usage-details-title">{title}</div>
            <div className="usage-details-summary">
                <div className="summary-item">
                    <div className="summary-item-header">{"Total Data Used"}</div>
                    <div className="number">{totalDataUsage}</div>
                </div>
                <div className="summary-item">
                    <div className="summary-item-header">{"Videos Watched"}</div>
                    <div className="number">{numVideosWatched}</div>
                </div>
            </div>
        </div>
    );
}
