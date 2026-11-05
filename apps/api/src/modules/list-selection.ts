import {z} from 'zod';
import {id} from './shared';
/** An additional intersection, never a replacement for the authorized predicate. */
export function listIds(query:URLSearchParams){const raw=query.get('ids');return raw===null?undefined:z.array(id).max(2000).parse(raw?raw.split(','):[]);}
export function listSelection(query:URLSearchParams){const ids=listIds(query);return ids===undefined?{}:{AND:[{id:{in:ids}}]};}
