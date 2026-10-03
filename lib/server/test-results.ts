import { responseDistribution } from "@/components/kit/lib/response-distribution";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jsPDF } from "jspdf";
import { db, document, fail, resultIsReleased } from "./store";
import { submissionRoutes } from "./assessment-route";
import { defaultPreparationLevel, schoolTarget } from "@/components/kit/data/school-training";
import { technicalCatalogSource } from "@/components/kit/data/technical-figures";
import { calculateTest } from "@/components/kit/lib/test-engine";
import { answerText } from "@/components/kit/lib/test-answer-text";
export async function testPdf(user: any, id: string) {
  const row = (await db
    .prepare(
      "SELECT s.*,u.name,u.institutionId,u.groupName FROM submissions s JOIN users u ON u.id=s.user_id WHERE s.id=?",
    )
    .get(id)) as any;
  if (
    !row ||
    (user.role === "student" && row.user_id !== user.id) ||
    (user.role !== "student" &&
      (!["admin","orientador"].includes(user.role) || row.institutionId !== user.institutionId || (user.role === "orientador" && row.groupName !== user.group)))
  )
    fail("Informe no disponible.", 403);
  if (user.role === "student" && !(await resultIsReleased(row)))
    fail("El resultado aún no está publicado.", 403);
  const saved = (await db
    .prepare(
      "SELECT result,revision FROM assessment_results WHERE submission_id=? ORDER BY revision DESC LIMIT 1",
    )
    .get(id)) as any;
  const t = JSON.parse(row.snapshot), answers = JSON.parse(row.answers);
  const result = saved ? JSON.parse(saved.result) : calculateTest({...t,scoring:t.scoring||(t.id==='valores'?'manual':'dimensions'),aggregation:t.aggregation||'sum'},answers);
  const profile=await document(row.user_id,'rv360:profile',{});
  const routeOf=await submissionRoutes({id:row.user_id},defaultPreparationLevel(profile));
  const school=routeOf(row)==='bachillerato';
  const related=(result.careers||[]).filter((career:any)=>schoolTarget(career.careerId)===school);
  const pdf = new jsPDF();
  let y = 40;
  const header = () => {
    pdf.setFillColor(244, 242, 253);
    pdf.rect(0, 0, 210, 30, "F");
    try {
      pdf.addImage(
        readFileSync(
          join(process.cwd(), "public/media/brain-book-icon.png"),
        ).toString("base64"),
        "PNG",
        16,
        6,
        18,
        18,
      );
    } catch {}
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.setTextColor(24, 43, 72);
    pdf.text("Ruta Vocacional 360°", 40, 15);
    pdf.setFontSize(9);
    pdf.text(school?"RESULTADOS DE BACHILLERATO":"RESULTADOS DE UNIVERSIDAD", 40, 22);
  };
  const line = (text: string, size = 11, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(24, 43, 72);
    const lines = pdf.splitTextToSize(String(text), 174);
    if (bold && y + lines.length * (size * 0.45 + 2) + 18 > 273) {
      pdf.addPage();
      header();
      y = 42;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(size);
    }
    for (const l of lines) {
      if (y > 273) {
        pdf.addPage();
        header();
        y = 42;
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);
      }
      pdf.text(l, 18, y);
      y += size * 0.45 + 2;
    }
    y += 4;
  };
  header();
  line(t.title, 20, true);
  line(row.name, 13, true);
  line(
    "Versión " +
      row.version +
      " · Revisión del resultado " +
      (saved?.revision || 1) +
      " · " +
      new Date(row.created_at).toLocaleDateString("es-EC"),
  );
  line(
    "Estado: " +
      (result.state === "complete"
        ? "Completo"
        : result.state === "pending-review"
          ? "Pendiente de revisión"
          : "Cobertura insuficiente"),
  );
  line(
    `${result.coverage.responded} de ${result.coverage.applicable} respuestas aplicables · ${result.coverage.omitted} omitidas · ${result.coverage.pending} pendientes`,
  );
  for (const s of result.scores) {
    line(
      t.dimensions?.find((d: any) => d.id === s.dimension)?.name || s.dimension,
      14,
      true,
    );
    line(
      "Puntuación: " +
        s.value.toLocaleString("es-EC", { maximumFractionDigits: 2 }) +
        " · Recorrido aplicable: " +
        s.min +
        " a " +
        s.max,
    );
    if (s.normalized !== undefined)
      line(
        "Posición en el recorrido: " +
          s.normalized.toFixed(2) +
          " / 100. No es un porcentaje de aptitud.",
      );
    if (s.band) line(s.band);
  }
  if (!result.scores.length)
    line(
      result.state === "pending-review"
        ? "La rúbrica requiere revisión. No se asigna cero a una respuesta pendiente."
        : "Instrumento descriptivo: consulta las respuestas conservadas.",
    );
  for (const group of responseDistribution(t, answers, result.trace)) {
    line(group.title, 13, true);
    line("Frecuencia de respuestas (no es una puntuación de aptitud)", 9);
    for (const item of group.items)
      line(item.label + ": " + item.count + " de " + group.answered, 10);
  }
  if (related.length) {
    line(school?"Figuras profesionales para explorar":"Carreras para explorar", 15, true);
    for (const c of related) {
      line(c.careerName, 12, true);
      line(c.reason);
      line("Criterio: " + c.min + " a " + c.max + "; resultado: " + c.evidence);
      line("Fuente: " + c.source, 9);
      if(school)line("Catálogo oficial: "+(c.sourceUrl||technicalCatalogSource.url),9);
      for (const offer of school?[]:c.offers || [])
        line(
          offer.institution +
            " · " +
            offer.title +
            " · " +
            offer.location +
            " · " +
            offer.modality,
          9,
        );
    }
  }
  line("Respuestas guardadas", 15, true);
  const visible = new Set(result.trace.map((r: any) => r.questionId));
  for (const q of t.questions.filter((q: any) => visible.has(q.id))) {
    line(q.text, 11, true);
    line(answerText(t, q, answers[q.id]));
  }
  line("Cómo interpretar este documento", 14, true);
  line(
    "Las respuestas omitidas y ocultas se excluyen del cálculo y del recorrido. No compares puntuaciones con bases diferentes.",
  );
  line(
    "Este resultado conserva las reglas de la versión respondida. Los intereses, preferencias y conocimientos no son intercambiables. Este test por sí solo no determina una carrera ni garantiza éxito académico.",
  );
  if (t.source) line("Fuente declarada del instrumento: " + t.source);
  line("Motor " + result.engineVersion + " · Registro " + row.id, 8);
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(97, 112, 138);
    pdf.text("Ruta Vocacional 360° · " + i + " / " + pages, 18, 289);
  }
  return pdf.output("arraybuffer");
}
