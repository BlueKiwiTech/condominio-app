import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";

// "Financiero y serio" direction (feat/new-design): IBM Plex Sans for
// heading/body/label -- a technical, precise sans that reads as
// fintech-serious rather than generic-SaaS -- and IBM Plex Mono for
// numeric/tabular data (amounts, dates) via --font-code, applied with
// font-variant-numeric: tabular-nums at call sites that show money.
const heading = IBM_Plex_Sans({ weight: ["500", "600", "700"], variable: "--font-heading", subsets: ["latin"], display: "swap" });
const body = IBM_Plex_Sans({ weight: ["400", "500"], variable: "--font-body", subsets: ["latin"], display: "swap" });
const label = IBM_Plex_Sans({ weight: ["500", "600"], variable: "--font-label", subsets: ["latin"], display: "swap" });
const code = IBM_Plex_Mono({ weight: ["500", "600"], variable: "--font-code", subsets: ["latin"], display: "swap" });

export const fonts = { heading, body, label, code };

export const style = {
  theme: "light",
  brand: "indigo",
  accent: "indigo",
  neutral: "slate",
  solid: "color",
  solidStyle: "flat",
  border: "conservative",
  surface: "filled",
  transition: "all",
  scaling: "100",
} as const;

export const dataStyle = {
  variant: "gradient",
  mode: "categorical",
  height: 24,
  axis: { stroke: "var(--neutral-alpha-weak)" },
  tick: { fill: "var(--neutral-on-background-weak)", fontSize: 11, line: false },
} as const;
