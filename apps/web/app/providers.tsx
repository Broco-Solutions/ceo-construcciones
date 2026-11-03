'use client';
import { NavigationProvider } from '@/lib/navigation';
import { SessionProvider } from '@/lib/session';
import { ToastProvider } from '@/components/ui';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <NavigationProvider>
        <SessionProvider>{children}</SessionProvider>
      </NavigationProvider>
    </ToastProvider>
  );
}
