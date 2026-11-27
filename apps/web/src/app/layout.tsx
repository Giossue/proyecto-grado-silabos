import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/AppProviders";

export const metadata: Metadata = {
  description: "Sistema de gestión de sílabos de la Universidad Estatal de Bolívar: elaboración, revisión y aprobación de los sílabos de cada carrera.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#122c41",
};

const preferencesScript = `(function(){var r=document.documentElement;var d=null;try{d=localStorage.getItem("appearance")}catch(e){}if(d==="dark")r.classList.add("dark");var m=false;try{m=window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){}var a={};try{var v=JSON.parse(localStorage.getItem("silabos:accesibilidad")||"null");if(v&&typeof v==="object")a=v}catch(e){}var t=["100","115","130","150"].indexOf(a.textSize)>=0?a.textSize:"100";r.dataset.contrast=a.highContrast===true?"high":"normal";r.dataset.textSize=t;r.dataset.motion=(typeof a.noMotion==="boolean"?a.noMotion:m)?"none":"normal";r.dataset.dyslexia=a.dyslexia===true?"on":"off"})()`

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <title>Sílabos UEB</title>
        <script dangerouslySetInnerHTML={{ __html: preferencesScript }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
