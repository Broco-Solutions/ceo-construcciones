import { Providers } from '../providers';
import { AppShell } from '@/components/shell';

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
