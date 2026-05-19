import "@styles/options.css";
import { Link } from "react-router";

export default function HeaderOptions() {
    return (
        <div className="optionsHeader">
            <Link id="backBtn" to="/">
                &larr; Back
            </Link>
            <h3>Options</h3>
        </div>
    );
}
