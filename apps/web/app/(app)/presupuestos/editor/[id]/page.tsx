'use client';
import { useParams } from 'next/navigation';
import { BudgetEditor } from '@/components/presupuesto/BudgetEditor';
import { RequirePerm } from '@/components/shell';
import { useSession } from '@/lib/session';
export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readEconomic')}>
      <BudgetEditor id={id} />
    </RequirePerm>
  );
}
