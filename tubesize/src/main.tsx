import { createRoot } from "react-dom/client";
import Popup from "./components/popup.tsx";

const domRoot = document.getElementById("root") as HTMLElement;

const root = createRoot(domRoot);

root.render(<Popup />);
