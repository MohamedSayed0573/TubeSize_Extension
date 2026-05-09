import Header from "@components/header";

interface Props {
    errorMessage: string;
}

function ErrorPage({ errorMessage }: Props) {
    return (
        <>
            <Header />
            <div className="error-page">
                <div className="error-page-icon">⚠</div>
                <div className="error-page-title">Something went wrong</div>
                <div className="error">{errorMessage}</div>
            </div>
        </>
    );
}

export default ErrorPage;
