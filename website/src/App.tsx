import { useEffect, useState } from "react";

import { DashboardPreview } from "./components/DashboardPreview";
import { PopupPreview } from "./components/PopupPreview";
import { BROWSERS, COPY, detectBrowser, LINKS, STATS, type BrowserId, type Lang } from "./i18n";

const ALL_BROWSERS: readonly BrowserId[] = ["chrome", "firefox", "edge"];

export default function App() {
    const [lang, setLang] = useState<Lang>("en");
    const [primaryBrowser] = useState<BrowserId>(() => detectBrowser());

    const copy = COPY[lang];
    const primary = BROWSERS[primaryBrowser];
    const secondaryBrowsers = ALL_BROWSERS.filter((id) => id !== primaryBrowser).map(
        (id) => BROWSERS[id],
    );

    useEffect(() => {
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
        document.title = copy.pageTitle;
    }, [lang, copy.pageTitle]);

    return (
        <div className="min-h-screen bg-[#f7f8fa] text-[#14181f]">
            {/* Header */}
            <header className="border-b border-[#e2e7ee] bg-white">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
                    <a
                        href="#top"
                        className="flex items-center gap-2.5 text-base font-bold tracking-tight text-[#14181f]"
                    >
                        <img
                            src="/icons/icon-128.png"
                            alt="TubeSize logo"
                            className="size-7 rounded-md"
                        />
                        <span>TubeSize</span>
                    </a>

                    <div className="flex items-center gap-3">
                        <a
                            href={LINKS.githubRepo}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-[#e2e7ee] bg-white px-2.5 py-1.5 text-[13px] font-semibold text-[#14181f] transition-colors hover:border-slate-300 hover:bg-slate-50"
                        >
                            <img src="/icons/github.svg" alt="" className="size-3.5" />
                            <span>GitHub</span>
                            <span className="inline-flex items-center gap-1 border-s border-[#e2e7ee] ps-2 text-[#526071] tabular-nums">
                                <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="#d97706"
                                    aria-hidden="true"
                                >
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                </svg>
                                {STATS.stars}
                            </span>
                        </a>

                        <button
                            type="button"
                            onClick={() => setLang((prev) => (prev === "en" ? "ar" : "en"))}
                            className="cursor-pointer rounded-md border border-[#d7dfe9] bg-[#f1f4f8] px-3 py-1.5 text-xs font-semibold text-[#14181f] transition-colors hover:bg-[#e8edf4]"
                        >
                            {copy.langToggle}
                        </button>
                    </div>
                </div>
            </header>

            <main id="top">
                {/* Hero */}
                <section className="border-b border-[#e2e7ee] bg-white">
                    <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1fr_320px] md:py-16">
                        <div>
                            <h1 className="mb-3.5 max-w-[18ch] text-3xl leading-[1.14] font-extrabold tracking-tight text-[#14181f] sm:text-4xl lg:text-[42px]">
                                {copy.heroTitle}
                            </h1>
                            <p className="mb-6 max-w-[44ch] text-[15.5px] leading-relaxed text-[#526071]">
                                {copy.heroSub}
                            </p>

                            <div className="mb-4 flex flex-wrap items-center gap-3">
                                <a
                                    href={primary.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2.5 rounded-lg bg-[#c81e1e] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#ad1818]"
                                >
                                    <img
                                        src={primary.icon}
                                        alt=""
                                        className="size-5 rounded-full bg-white p-0.5"
                                    />
                                    <span>{primary.cta[lang]}</span>
                                </a>
                            </div>

                            <div className="mb-6 flex flex-wrap items-center gap-2.5 text-[13px] text-[#526071]">
                                <span>{copy.alsoOn}</span>
                                {secondaryBrowsers.map((browser) => (
                                    <a
                                        key={browser.id}
                                        href={browser.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 rounded-md border border-[#e2e7ee] bg-[#f7f8fa] px-2.5 py-1 font-semibold text-[#14181f] transition-colors hover:border-slate-300 hover:bg-[#f1f4f8]"
                                    >
                                        <img src={browser.icon} alt="" className="size-4" />
                                        <span>{browser.label[lang]}</span>
                                    </a>
                                ))}
                            </div>

                            <div className="flex flex-wrap items-center gap-5 border-t border-[#edf1f6] pt-4 text-[13px]">
                                <span className="inline-flex items-center gap-1.5 font-semibold text-[#14181f] tabular-nums">
                                    <svg
                                        width="15"
                                        height="15"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="#0f766e"
                                        strokeWidth="2.2"
                                        aria-hidden="true"
                                    >
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                        <circle cx="9" cy="7" r="4" />
                                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                    </svg>
                                    <strong dir="ltr">{STATS.users}</strong>
                                    <span className="font-medium text-[#526071]">
                                        {copy.usersLabel}
                                    </span>
                                </span>

                                <a
                                    href={LINKS.githubRepo}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 font-semibold text-[#14181f] tabular-nums hover:underline"
                                >
                                    <svg
                                        width="15"
                                        height="15"
                                        viewBox="0 0 24 24"
                                        fill="#d97706"
                                        aria-hidden="true"
                                    >
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                    </svg>
                                    <strong dir="ltr">{STATS.stars}</strong>
                                    <span className="font-medium text-[#526071]">
                                        {copy.starsLabel}
                                    </span>
                                </a>
                            </div>
                        </div>

                        <PopupPreview copy={copy} />
                    </div>
                </section>

                {/* After you browse */}
                <section className="border-b border-[#e2e7ee] bg-[#f7f8fa]">
                    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
                        <div className="mb-5">
                            <h2 className="mb-1.5 text-2xl font-extrabold tracking-tight text-[#14181f]">
                                {copy.afterTitle}
                            </h2>
                            <p className="max-w-[60ch] text-sm leading-relaxed text-[#526071]">
                                {copy.afterDesc}
                            </p>
                        </div>

                        <DashboardPreview copy={copy} />
                    </div>
                </section>

                {/* Compact Trust Strip */}
                <section className="border-b border-[#e2e7ee] bg-white">
                    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-5 py-9 sm:grid-cols-3 sm:px-8">
                        <div>
                            <h3 className="mb-1 text-sm font-bold text-[#14181f]">
                                {copy.trust1Title}
                            </h3>
                            <p className="text-[13px] leading-relaxed text-[#526071]">
                                {copy.trust1Body}
                            </p>
                        </div>
                        <div>
                            <h3 className="mb-1 text-sm font-bold text-[#14181f]">
                                {copy.trust2Title}
                            </h3>
                            <p className="text-[13px] leading-relaxed text-[#526071]">
                                {copy.trust2Body}
                            </p>
                        </div>
                        <div>
                            <h3 className="mb-1 text-sm font-bold text-[#14181f]">
                                {copy.trust3Title}
                            </h3>
                            <p className="text-[13px] leading-relaxed text-[#526071]">
                                {copy.trust3Body}
                            </p>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="bg-[#f7f8fa]">
                <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-[13px] text-[#526071] sm:px-8">
                    <span>
                        {copy.builtBy}{" "}
                        <a
                            href={LINKS.githubProfile}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-[#14181f] underline decoration-slate-300 underline-offset-3 hover:decoration-[#14181f]"
                        >
                            {copy.authorName}
                        </a>
                    </span>

                    <div className="flex flex-wrap items-center gap-4">
                        {ALL_BROWSERS.map((id) => {
                            const b = BROWSERS[id];
                            return (
                                <a
                                    key={b.id}
                                    href={b.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 font-medium text-[#14181f] hover:underline"
                                >
                                    <img src={b.icon} alt="" className="size-3.5" />
                                    <span>{b.label[lang]}</span>
                                </a>
                            );
                        })}

                        <a
                            href={LINKS.githubRepo}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 font-medium text-[#14181f] hover:underline"
                        >
                            <img src="/icons/github.svg" alt="" className="size-3.5" />
                            <span>GitHub</span>
                        </a>

                        <a
                            href={LINKS.kofi}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 font-medium text-[#14181f] hover:underline"
                        >
                            <img src="/icons/kofi.svg" alt="" className="size-4" />
                            <span>{copy.supportKofi}</span>
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
