'use client';
import { useAppRouter } from '@/lib/navigation';
import Link from 'next/link';
import { Page, RequirePerm } from '@/components/shell';
import { useSession } from '@/lib/session';
import { ApuForm } from '@/components/presupuesto/ApuForm';

export default function NewApuPage() {
  const { can } = useSession();
  const router = useAppRouter();
  return (
    <RequirePerm ok={can('editBudget')}>
      <Page
        title="Nueva actividad de obra"
        crumb={<Link href="/apu">Actividades de obra</Link>}
      >
        <ApuForm
          onSaved={(a) => router.push(`/apu/${a.id}`)}
          onCancel={() => router.push('/apu')}
        />
      </Page>
    </RequirePerm>
  );
}
