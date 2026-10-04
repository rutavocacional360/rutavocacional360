import { requireUser } from '@/lib/server/store';
import { activityFileResponse } from '@/lib/server/training-media';
export const runtime = 'nodejs';
async function handle(request: Request, context: {params: Promise<{id: string}>}) {
  try { return await activityFileResponse(await requireUser(), (await context.params).id, request); }
  catch (error: any) {
    return Response.json({error: error.status ? error.message : 'No se pudo abrir el material. Reintenta.'}, {status: error.status || 503, headers: {'Cache-Control': 'private, no-store'}});
  }
}
export const GET = handle;
export const HEAD = handle;
