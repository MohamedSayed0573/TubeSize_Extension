import type { BackgroundResponse } from "@app-types/types";

interface Props {
    youtubeData?: BackgroundResponse | null;
    setUseOptionsPage: (useOptionsPage: boolean) => void;
}

export default function Header({ youtubeData, setUseOptionsPage }: Props) {
    return (
        <div className="header">
            <div className="title" title={youtubeData?.data?.title}>
                {youtubeData?.data?.title ?? "TubeSize"}
            </div>
            <span className="duration" id="duration-display">
                {youtubeData?.data?.isLive ? null : youtubeData?.data?.durationMinutes}
            </span>
            <button id="optionsBtn" onClick={() => setUseOptionsPage(true)}>
                Options
            </button>
        </div>
    );
}
