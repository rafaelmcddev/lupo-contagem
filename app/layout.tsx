import './globals.css';
import { Nav } from '@/components/ui/Nav';

export const metadata = { title: 'Lupo Contagem' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
