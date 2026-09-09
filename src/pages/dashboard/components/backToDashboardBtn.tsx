import { ArrowLeft } from "lucide-react";
import ButtonLink from "./buttonLink";

export default function BackToDashBoardBtn() {
    return (
        <ButtonLink to="/dashboard" variant={"outline"} size={"lg"} className="font-mono">
            <ArrowLeft className="size-4" />
            Back to Dashboard
        </ButtonLink>
    );
}
