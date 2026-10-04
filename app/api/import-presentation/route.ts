import { readJsonObject } from "@/lib/server/request-body";
import { NextRequest, NextResponse } from "next/server";
import { requireUser, fail, rateLimit } from "@/lib/server/store";
import { trustedMutationOrigin } from "@/lib/server/request-origin";
import { summarizeInstrument } from "@/lib/server/import-presentation";
import { suggestSimulatorFields, suggestStudyOptions } from "@/lib/server/simulator-autofill";
import { assessmentImportLevel } from '@/lib/server/assessment-import';
import { schoolTrainingTargets, schoolTarget } from '@/components/kit/data/school-training';
import { ecuadorCareers } from '@/lib/server/ecuador-catalog';
import { completeAssessmentDraft } from '@/lib/server/test-autofill';
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(true);
    if (!trustedMutationOrigin(req)) fail("Origen no permitido.", 403);
    await rateLimit("ai-editor:" + user.id);
    const body = await readJsonObject(req, 300000);
    if (body.operation !== undefined && !['study-options', 'simulator', 'test-draft'].includes(body.operation))
      fail('Operación de IA no válida. Actualiza la aplicación y vuelve a intentar.');
    if(body.operation==='test-draft')return NextResponse.json(await completeAssessmentDraft(user,body),{headers:{'Cache-Control':'no-store'}});
    if(body.operation === 'study-options') {
      const educationLevel = assessmentImportLevel(body.educationLevel);
      if(typeof body.title !== 'string' || body.title.length > 500 || typeof body.description !== 'string' || body.description.length > 40000)
        fail('Contenido del documento no válido.');
      const catalog = educationLevel === 'bachillerato' ? schoolTrainingTargets : ecuadorCareers;
      const careers = catalog.map(({id,name})=>({id,name}));
      const careerIds = await suggestStudyOptions({title:body.title,description:body.description,educationLevel,careers});
      return NextResponse.json({careerIds},{headers:{'Cache-Control':'no-store'}});
    }
    if (body?.operation === "simulator") {
      if (
        !Array.isArray(body.questions) ||
        !body.questions.length ||
        body.questions.length > 20 ||
        !Array.isArray(body.careers) ||
        body.careers.length > 2500 ||
        typeof body.title !== "string" ||
        body.title.length > 500
      )
        fail("Contenido del simulador no válido.");
      const educationLevel = assessmentImportLevel(body.educationLevel);
      const catalog = educationLevel === 'bachillerato' ? schoolTrainingTargets : ecuadorCareers;
      const allowed = new Set(body.careers.map((c: any) => c?.id));
      const careers = catalog.filter(c => allowed.has(c.id)).map(({id,name}) => ({id,name}));
      const suggestions = await suggestSimulatorFields({...body, educationLevel, careers});
      suggestions.careerIds = (Array.isArray(suggestions.careerIds) ? suggestions.careerIds : [])
        .filter((id: unknown) => careers.some(c => c.id === id) && schoolTarget(id) === (educationLevel === 'bachillerato'));
      return NextResponse.json(
        { suggestions },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (
      !body ||
      typeof body.title !== "string" ||
      typeof body.description !== "string" ||
      body.title.length > 500 ||
      body.description.length > 12000
    )
      fail("Contenido no válido.");
    return NextResponse.json(
      {
        presentation: await summarizeInstrument({
          title: body.title,
          description: body.description,
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        error: e.status
          ? e.message
          : "No se pudo generar la sugerencia. Vuelve a intentar.",
        ...(typeof e.code==='string'&&/^AI_/.test(e.code) ? {code: e.code} : {}),
      },
      { status: e.status || 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
