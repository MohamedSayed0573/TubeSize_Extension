import Header from "@components/header";

interface Props {
    errorMessage: string;
}

function ErrorPage({ errorMessage }: Props) {
    return (
        <>
            <Header />
            <div className="flex flex-col items-center gap-2 p-2">
                <div className="text-2xl text-red-400">⚠</div>
                <div className="text-xs font-semibold">Something went wrong</div>
                <div className="rounded border-l-3 border-red-400 bg-red-400/12 p-3 text-xs text-rose-400">
                    {errorMessage}
                </div>
            </div>
        </>
    );
}

export default ErrorPage;
