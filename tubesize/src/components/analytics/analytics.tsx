import "@styles/analytics.css";

export default function Analytics() {
    return (
        <div className="analytics-page">
            <div className="analytics-header">TubeSize Usage Analytics for YouTube</div>
            <div className="analytics-body">
                <div className="stats-row">
                    <div className="stats-card">
                        <div className="stat-label">Today: </div>
                        <div className="stat-value">1,234 MB</div>
                    </div>
                    <div className="stats-card">
                        <div className="stat-label">This Week: </div>
                        <div className="stat-value">1,234 MB</div>
                    </div>
                    <div className="stats-card">
                        <div className="stat-label">This Month: </div>
                        <div className="stat-value">1,234 MB</div>
                    </div>
                    <div className="stats-card">
                        <div className="stat-label">Total Lifetime: </div>
                        <div className="stat-value">1,234 MB</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
