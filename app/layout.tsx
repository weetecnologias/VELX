import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "VELX | Taekwondo & Martial Arts Academy, Hyderabad", template: "%s | VELX Academy" },
  description: "Build strength, discipline and confidence at VELX Taekwondo & Martial Arts Academy in Masjid Banda, Kondapur, Hyderabad. Training enquiries: 8179190909.",
  metadataBase: new URL("https://velx-taekwondo-academy.amulya-bhogi.chatgpt.site"),
  openGraph: { title: "VELX | Your next level starts here", description: "Taekwondo & Martial Arts Academy. Kondapur, Hyderabad.", images: ["/training-hero.png"] },
  icons: {
    icon: "/velx-logo.png",
    shortcut: "/velx-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
