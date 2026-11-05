'use client';
import type { Schemas } from '@/lib/api';
import { EntityPicker } from '@/components/EntityPicker';
export type PickedMaterial = Omit<Schemas['Material'], 'unit'> & { unit: Schemas['Unit'] | null };
/** All material entry points share the remote, paginated, keyboard picker. */
export function MaterialPicker({value,onChange,categoryId,label='Material',error,disabled,includeInactive=false}:{value:string|null|undefined;onChange:(material:PickedMaterial|null)=>void;categoryId?:string|null;label?:string;error?:string;disabled?:boolean;includeInactive?:boolean}) {
 return <EntityPicker<PickedMaterial> resource="materials" label={label} value={value} onChange={onChange} error={error} disabled={disabled} query={{categoryId:categoryId||undefined,active:includeInactive?undefined:true}} />;
}
export default MaterialPicker;
