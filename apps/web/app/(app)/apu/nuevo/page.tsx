'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Page, RequirePerm } from '@/components/shell';
import { useSession } from '@/lib/session';
import { ApuForm } from '@/components/presupuesto/ApuForm';

export default function NewApuPage() {
  const { can } = useSession();
  const router = useRouter();
  return (
    <RequirePerm ok={can('editBudget')}>
      <Page title="Nuevo APU" crumb={<Link href="/apu">APU</Link>}>
        <ApuForm onSaved={(a) => router.push(`/apu/${a.id}`)} onCancel={() => router.push('/apu')} />
      </Page>
    </RequirePerm>
  );
}
