import type { BackgroundResponse } from "@app-types/types";

interface Props {
    videoData: BackgroundResponse | null;
    setUseOptionsPage: (useOptionsPage: boolean) => void;
}

export default function Header({ videoData, setUseOptionsPage }: Props) {
    return (
        <div className="header">
            <div className="title" title={videoData?.data?.title}>
                {videoData?.data?.title ?? "TubeSize"}
            </div>
            <span className="duration" id="duration-display">
                {videoData?.data?.duration}
            </span>
            <button id="optionsBtn" onClick={() => setUseOptionsPage(true)}>
                Options
            </button>
        </div>
    );
}
