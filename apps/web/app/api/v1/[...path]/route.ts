import { proxyRequest } from '@/lib/proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ path: string[] }> };
const handle = async (request: Request, ctx: Ctx) => proxyRequest(request, (await ctx.params).path);

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
