'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const router = useRouter();
  const workId = useSearchParams().get('workId') ?? undefined;
  return <ComputationForm defaultWorkId={workId} onSaved={(id) => router.push(`/computos/${id}`)} onCancel={() => router.push('/computos')} />;
}
