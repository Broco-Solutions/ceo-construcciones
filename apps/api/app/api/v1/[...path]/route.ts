import { dispatch } from '../../../../src/router';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handler(request:Request,context:{params:Promise<{path:string[]}>}){return dispatch(request,(await context.params).path);}
export {handler as GET,handler as POST,handler as PATCH,handler as PUT,handler as DELETE};
