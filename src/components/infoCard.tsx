type InfoCardTone = "info" | "success";

const toneClasses: Record<InfoCardTone, string> = {
    info: "border-blue-500 bg-blue-400/12 text-sky-300",
    success: "border-emerald-500 bg-emerald-400/12 text-emerald-300",
};

export default function InfoCard({
    message,
    tone = "info",
}: {
    message: string;
    tone?: InfoCardTone;
}) {
    return (
        <span className={`rounded-lg border-l-4 p-3 text-sm ${toneClasses[tone]}`}>{message}</span>
    );
}
