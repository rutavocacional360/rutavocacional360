import { requireUser, fail } from '@/lib/server/store';
import { trustedMutationOrigin } from '@/lib/server/request-origin';
import { readBoundedBody } from '@/lib/server/request-body';
import { storeActivityFile } from '@/lib/server/training-media';
import { ACTIVITY_MEDIA_MAX_BYTES } from '@/components/kit/lib/activity-media';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const user = await requireUser(true);
    if (!trustedMutationOrigin(request)) fail('Origen no autorizado.', 403);
    if (!/^multipart\/form-data\s*;/i.test(request.headers.get('content-type') || '')) fail('Selecciona un archivo para subir.', 415);
    const bytes = await readBoundedBody(request, ACTIVITY_MEDIA_MAX_BYTES + 64 * 1024);
    let form: FormData;
    try { form = await new Response(new Uint8Array(bytes), {headers: {'Content-Type': request.headers.get('content-type')!}}).formData(); }
    catch { fail('No se pudo leer el archivo enviado. Reintenta la carga.'); }
    const files = form!.getAll('file');
    if (files.length !== 1 || !(files[0] instanceof File)) fail('Envía un archivo por carga.');
    return Response.json(await storeActivityFile(user, files[0] as File), {status: 201, headers: {'Cache-Control': 'private, no-store'}});
  } catch (error: any) {
    return Response.json({error: error.status ? error.message : 'No se pudo guardar el material. Reintenta la carga.'}, {status: error.status || 503, headers: {'Cache-Control': 'private, no-store'}});
  }
}
