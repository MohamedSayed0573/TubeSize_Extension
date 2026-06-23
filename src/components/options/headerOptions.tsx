import { Link } from "react-router";

export default function HeaderOptions() {
    return (
        <div className="flex items-center justify-between border-b border-b-white/8 bg-neutral-900 p-3 pr-5">
            <Link
                className="flex cursor-pointer items-center justify-center rounded-md border border-white/12 bg-white/5 px-3 py-2 text-xs text-zinc-100 no-underline transition-all hover:-translate-y-px hover:border-white/25 hover:bg-white/15"
                to="/"
            >
                &larr; Back
            </Link>
            <h3 className="text-sm font-semibold">Options</h3>
        </div>
    );
}
