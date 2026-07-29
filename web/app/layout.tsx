import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HELIOS // Mission Design · Launch Planning',
  description:
    'Professional preliminary mission-design workstation: Lambert trajectories, launch windows, Need/Capability/Margin, DE440s-class offline ephemeris. Not flight-certified software.',
  applicationName: 'HELIOS',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'HELIOS Mission Design',
    description:
      'Browser-first interplanetary launch planning — preliminary analysis, not flight-certified OD.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;500;600&family=Share+Tech+Mono&display=swap"
          rel="stylesheet"
        />
        {/* HELIOS base chrome (tokens + panels) extracted from index.html */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/helios-base.css" />
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/css/app.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
