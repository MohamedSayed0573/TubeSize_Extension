export type Lang = "en" | "ar";
export type BrowserId = "chrome" | "firefox" | "edge";

export interface BrowserMeta {
    id: BrowserId;
    url: string;
    icon: string;
    label: Record<Lang, string>;
    cta: Record<Lang, string>;
}

export const LINKS = {
    githubRepo: "https://github.com/MohamedSayed0573/TubeSize_Extension",
    githubProfile: "https://github.com/MohamedSayed0573",
    kofi: "https://ko-fi.com/mohamedsayed253",
} as const;

export const STATS = {
    users: "2,000+",
    stars: 285,
} as const;

export const BROWSERS: Record<BrowserId, BrowserMeta> = {
    chrome: {
        id: "chrome",
        url: "https://chromewebstore.google.com/detail/tubesize/bdpkcpbkonollfbgcnkknkjdbfpacnoi",
        icon: "/icons/chrome.svg",
        label: { en: "Chrome", ar: "كروم" },
        cta: { en: "Add to Chrome — Free", ar: "أضف إلى كروم — مجاناً" },
    },
    firefox: {
        id: "firefox",
        url: "https://addons.mozilla.org/en-US/firefox/addon/tubesize/",
        icon: "/icons/firefox.svg",
        label: { en: "Firefox", ar: "فايرفوكس" },
        cta: { en: "Add to Firefox — Free", ar: "أضف إلى فايرفوكس — مجاناً" },
    },
    edge: {
        id: "edge",
        url: "https://microsoftedge.microsoft.com/addons/detail/tubesize/mljmdmlkjajlklcaipidodlkfkcippka",
        icon: "/icons/edge.svg",
        label: { en: "Edge", ar: "إيدج" },
        cta: { en: "Add to Edge — Free", ar: "أضف إلى إيدج — مجاناً" },
    },
};

export function detectBrowser(): BrowserId {
    if (typeof navigator === "undefined") return "chrome";
    const ua = navigator.userAgent;
    if (/Firefox\//i.test(ua)) return "firefox";
    if (/Edg\//i.test(ua)) return "edge";
    return "chrome";
}

export interface Copy {
    pageTitle: string;
    langToggle: string;
    heroTitle: string;
    heroSub: string;
    alsoOn: string;
    usersLabel: string;
    starsLabel: string;
    popupSettings: string;
    popupDashboard: string;
    popupTodayUsage: string;
    popupCurrent: string;
    afterTitle: string;
    afterDesc: string;
    statToday: string;
    statWeek: string;
    statMonth: string;
    statLifetime: string;
    viewDetails: string;
    chartDailyTitle: string;
    chartSitesTitle: string;
    byDay: string;
    bySite: string;
    daysWord: string;
    allSites: string;
    trust1Title: string;
    trust1Body: string;
    trust2Title: string;
    trust2Body: string;
    trust3Title: string;
    trust3Body: string;
    builtBy: string;
    authorName: string;
    supportKofi: string;
}

export const COPY: Record<Lang, Copy> = {
    en: {
        pageTitle: "TubeSize — Know where your internet data goes, before and after.",
        langToggle: "العربية",
        heroTitle: "Know where your internet data goes, before and after.",
        heroSub:
            "See what a YouTube, Twitch, or Kick video will cost before you press play, and track every website's data usage.",
        alsoOn: "Also available on",
        usersLabel: "active users",
        starsLabel: "stars on GitHub",
        popupSettings: "Settings",
        popupDashboard: "Dashboard",
        popupTodayUsage: "Today's Usage",
        popupCurrent: "Current",
        afterTitle: "After you browse",
        afterDesc: "See which websites and YouTube videos use the most data over time.",
        statToday: "Today",
        statWeek: "Last 7 Days",
        statMonth: "Last 30 Days",
        statLifetime: "Lifetime",
        viewDetails: "View details",
        chartDailyTitle: "Data Usage Per Day",
        chartSitesTitle: "Data Usage Per Site",
        byDay: "By Day",
        bySite: "By Site",
        daysWord: "days",
        allSites: "All Sites",
        trust1Title: "100% on your device",
        trust1Body: "Usage totals and watch history stay locally in your browser.",
        trust2Title: "Works inside YouTube, Twitch & Kick",
        trust2Body:
            "Injects file sizes into YouTube's quality menu and warns you when a stream crosses your bitrate limit.",
        trust3Title: "MIT open source",
        trust3Body: "Full source code on GitHub for Chromium and Firefox.",
        builtBy: "Built by",
        authorName: "Mohamed Sayed",
        supportKofi: "Support on Ko-fi",
    },
    ar: {
        pageTitle: "TubeSize — اعرف باقة الإنترنت بتروح فين، قبل وبعد المشاهدة.",
        langToggle: "English",
        heroTitle: "اعرف باقة الإنترنت بتروح فين، قبل وبعد المشاهدة.",
        heroSub: "اعرف حجم فيديو يوتيوب وتويتش وكيك قبل ما تشغله، وتابع استهلاك كل موقع.",
        alsoOn: "متاح أيضاً على",
        usersLabel: "مستخدم نشط",
        starsLabel: "نجمة على GitHub",
        popupSettings: "الإعدادات",
        popupDashboard: "لوحة التحكم",
        popupTodayUsage: "استهلاك اليوم",
        popupCurrent: "الحالية",
        afterTitle: "بعد التصفح",
        afterDesc: "شوف أكتر المواقع وفيديوهات يوتيوب استهلاكاً لبياناتك على مدار الوقت.",
        statToday: "اليوم",
        statWeek: "آخر 7 أيام",
        statMonth: "آخر 30 يوماً",
        statLifetime: "الإجمالي",
        viewDetails: "التفاصيل",
        chartDailyTitle: "استهلاك البيانات يومياً",
        chartSitesTitle: "استهلاك البيانات لكل موقع",
        byDay: "حسب اليوم",
        bySite: "حسب الموقع",
        daysWord: "يوماً",
        allSites: "جميع المواقع",
        trust1Title: "100% على جهازك",
        trust1Body: "بيانات الاستهلاك وسجل المشاهدة محفوظة محلياً في المتصفح فقط.",
        trust2Title: "مدمج في يوتيوب وتويتش وكيك",
        trust2Body:
            "يعرض الأحجام مباشرة داخل قائمة الجودة في يوتيوب وينبهك عند تجاوز حد استهلاك البث.",
        trust3Title: "مفتوح المصدر (MIT)",
        trust3Body: "الكود المصدري كامل على GitHub لمتصفحات كروميوم وفايرفوكس.",
        builtBy: "تطوير",
        authorName: "محمد سيد",
        supportKofi: "ادعم المشروع على Ko-fi",
    },
};
