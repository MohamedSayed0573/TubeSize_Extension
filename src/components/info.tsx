export default function InfoCard({ message }: { message: string }) {
    return (
        <span className="rounded-lg border-l-4 border-blue-500 bg-blue-400/12 p-3 text-sm text-sky-300">
            {message}
        </span>
    );
}
