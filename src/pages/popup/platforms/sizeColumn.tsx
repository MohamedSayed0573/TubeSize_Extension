interface Props {
    primary: string | undefined;
    secondary: string | undefined;
}

/** The right-hand size column shared by every format row in the popup. */
export default function SizeColumn({ primary, secondary }: Props) {
    return (
        <div className="flex shrink-0 flex-col items-end text-right text-sm font-semibold whitespace-nowrap text-teal-200">
            <span>{primary}</span>
            {secondary && (
                <span className="mt-0.5 text-xs font-normal text-cyan-500">{secondary}</span>
            )}
        </div>
    );
}
