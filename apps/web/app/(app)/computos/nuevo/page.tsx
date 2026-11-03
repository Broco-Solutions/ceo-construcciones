'use client';
import { useAppRouter } from '@/lib/navigation';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Page, RequirePerm } from '@/components/shell';
import { Loading } from '@/components/ui';
import { useSession } from '@/lib/session';
import { ComputationForm } from '@/components/presupuesto/ComputationForm';

export default function NewComputationPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('editBudget')}>
      <Page title="Nuevo cómputo" crumb={<Link href="/computos">Cómputos</Link>}>
        <Suspense fallback={<Loading />}>
          <Inner />
        </Suspense>
      </Page>
    </RequirePerm>
  );
}
function Inner() {
  const router = useAppRouter();
  const workId = useSearchParams().get('workId') ?? undefined;
  return <ComputationForm defaultWorkId={workId} onSaved={(id) => router.push(`/computos/${id}`)} onCancel={() => router.push('/computos')} />;
}
