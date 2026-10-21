import type { Metadata, Viewport } from 'next';
import { Manrope, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });
const plex = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex', display: 'swap' });

export const metadata: Metadata = { title: 'CEO Construcciones', description: 'Obras, presupuestos, compras e inventario' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#16285A' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${manrope.variable} ${plex.variable}`}>
      <body>{children}</body>
    </html>
  );
}
