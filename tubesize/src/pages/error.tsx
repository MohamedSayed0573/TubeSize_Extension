import { useState } from "react";
import Options from "@pages/options";
import Header from "@components/header";

interface Props {
    errorMessage: string;
}

function ErrorPage({ errorMessage }: Props) {
    const [useOptionsPage, setUseOptionsPage] = useState(false);
    if (useOptionsPage) return <Options />;
    return (
        <>
            <Header setUseOptionsPage={setUseOptionsPage} />
            <div className="error-page">
                <div className="error-page-icon">⚠</div>
                <div className="error-page-title">Something went wrong</div>
                <div className="error">{errorMessage}</div>
            </div>
        </>
    );
}

export default ErrorPage;
