import type React from "react";

export default function PageLayout({ children }: { children: React.ReactNode }) {
    return <div className="flex h-screen w-full flex-col">{children}</div>;
}
