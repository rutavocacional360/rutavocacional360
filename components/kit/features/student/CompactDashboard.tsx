import {reportEducationLevel} from './report-route';
import {defaultPreparationLevel} from '../../data/school-training';
import {SchoolRouteStart} from './SchoolRouteStart';
import { instrumentPresentation } from "../../lib/instrument-presentation";
import { PagedList } from "../../components/ui/PagedList";
import { TrainingSummary } from "../training/TrainingSummary";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  CheckCircle2,
  FileText,
  Compass,
  Heart,
  ScanFace,
  Search,
  ShieldCheck,
  BookOpen,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSession, previewAction } from "../../lib/session";
import { answerKey, completion, instruments } from "../../data/instruments";
import {
  Badge,
  Card,
  Progress,
  PageHeader,
  Field,
  SelectField,
} from "../../components/ui/primitives";
import type { Instrument } from "../../types";
export function testHref(t: Instrument) {
  return ["intereses", "valores", "autoconocimiento"].includes(t.id)
    ? "/evaluacion/" + t.id
    : "/evaluacion/personalizada?id=" + encodeURIComponent(t.id);
}
export function useAssignedTests() {
  const s = useSession();
  const battery = s.values["rv360:battery"];
  const tests = (battery?.instruments || instruments) as Instrument[];
  const custom = (s.values["rv360:custom-tests"] || []) as Instrument[];
  const activeIds = new Set(
    (s.values["rv360:attempts"] || [])
      .filter((a: any) => a.state === "in_progress")
      .map((a: any) => a.instrument_id),
  );
  const core = tests.filter(
    (t) =>
      ((
        s.values["rv360:available-originals"] || [
          "intereses",
          "valores",
          "autoconocimiento",
        ]
      ).includes(t.id) &&
        !custom.some((c) => (c.stableId || c.id) === t.id)) ||
      activeIds.has(t.id),
  );
  const all = [
    ...core,
    ...custom.filter(
      (t) => !core.some((b) => b.id === t.id && b.version === t.version),
    ),
  ];
  const rows = (list: Instrument[]) =>
    list.map((t) => ({
      test: t,
      count: completion(t, s.values[answerKey(t)] || {}),
      submission: (s.values["rv360:submissions"] || []).find(
        (r: any) => r.instrument_id === t.id && r.version === t.version,
      ),
    }));
  return { battery: rows(all), all: rows(all), frozen: !!battery?.frozen };
}
function availability(t: Instrument) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
  }).format(new Date());
  return t.availableFrom && today < t.availableFrom
    ? "Disponible desde " + t.availableFrom
    : t.due && today > t.due
      ? "Plazo terminado"
      : "";
}
function TestRows({
  rows,
}: {
  rows: ReturnType<typeof useAssignedTests>["all"];
}) {
  const profile=useSession().values["rv360:profile"];
  const level=defaultPreparationLevel(profile);
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("");
  const filtered = rows.filter(
    (r) =>
      (!r.test.educationLevel||r.test.educationLevel==='ambos'||r.test.educationLevel===level)&&
      (
        r.test.title +
        " " +
        instrumentPresentation(r.test).title +
        " " +
        instrumentPresentation(r.test).summary
      )
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()) &&
      (!status ||
        (status === "done"
          ? !!r.submission
          : status === "progress"
            ? !r.submission && r.count > 0
            : !r.submission && !r.count)),
  );
  return (
    <div className="sw-library"><p className="eyebrow">{level==='bachillerato'?'TUS TESTS DE BACHILLERATO':'TUS TESTS DE UNIVERSIDAD'}</p><p className="muted small">{level==='bachillerato'?'Para 8.º, 9.º y 10.º de EGB: conoce tus intereses y compara Ciencias y Técnico antes de entrar a BGU.':'Para tu paso de BGU a educación superior: intereses, carreras y opciones universitarias.'}</p>
      <div className="sw-library-filters">
        <Field
          label="Buscar evaluación"
          type="search"
          placeholder="¿Qué test estás buscando?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <SelectField
          label="Estado"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="progress">En curso</option>
          <option value="done">Completado</option>
        </SelectField>
      </div>
      <PagedList
        className="sw-test-grid"
        label="evaluaciones"
        resetKey={level + query + status}
      >
        {filtered.map(({ test, count, submission }) => {
          const presentation = instrumentPresentation(test),
            Icon =
              test.id === "intereses"
                ? Compass
                : test.id === "valores"
                  ? Heart
                  : test.id === "autoconocimiento"
                    ? ScanFace
                    : ClipboardCheck,
            available = availability(test);
          return (
            <article
              className={
                "sw-test-card " +
                (submission ? "is-complete" : count ? "is-progress" : "")
              }
              key={test.id + test.version}
            >
              <header>
                <span
                  className={
                    "sw-test-icon sw-test-icon--" +
                    (test.id === "valores"
                      ? "rose"
                      : test.id === "autoconocimiento"
                        ? "teal"
                        : "purple")
                  }
                >
                  <Icon size={25} />
                </span>
                <Badge
                  tone={submission ? "success" : count ? "primary" : "neutral"}
                >
                  {submission ? "Completado" : count ? "En curso" : "Pendiente"}
                </Badge>
              </header>
              <div className="sw-test-description">
                <small>
                  {test.id === "intereses"
                    ? "DESCUBRE LO QUE TE MUEVE"
                    : test.id === "valores"
                      ? "IDENTIFICA LO QUE IMPORTA"
                      : test.id === "autoconocimiento"
                        ? "RECONOCE TU FORMA DE SER"
                        : "EXPLORA UN NUEVO TEMA"}
                </small>
                <h2>{presentation.title}</h2>
                <p>{presentation.summary}</p>
              </div>
              <div className="sw-test-meta">
                <span>
                  <ClipboardCheck size={14} />
                  {test.questions.length} preguntas
                </span>
                <span>
                  {submission ? (
                    <>
                      <CheckCircle2 size={14} />
                      Entregado
                    </>
                  ) : count ? (
                    `${count} respuestas guardadas`
                  ) : (
                    "A tu ritmo"
                  )}
                </span>
              </div>
              {!submission && count > 0 && (
                <Progress
                  value={count}
                  total={test.questions.length}
                  label="Respuestas guardadas"
                />
              )}
              <footer>
                {!submission && available ? (
                  <p className="sw-availability">{available}</p>
                ) : (
                  <Link
                    className={
                      "button button--" + (submission ? "secondary" : "primary")
                    }
                    href={submission ? "/mi-ruta/resultados" : testHref(test)}
                  >
                    {submission
                      ? "Ver mi resultado"
                      : count
                        ? "Continuar mi test"
                        : "Comenzar test"}
                    <ArrowRight size={17} />
                  </Link>
                )}
              </footer>
            </article>
          );
        })}
      </PagedList>
      {!filtered.length && (
        <div className="sw-empty">
          <Search size={28} />
          <h2>
            {rows.length ? "No encontramos ese test" : "Tu espacio está listo"}
          </h2>
          <p>
            {rows.length
              ? "Prueba con otro nombre o cambia el estado seleccionado."
              : "Las evaluaciones que te asignen aparecerán aquí."}
          </p>
          {rows.length > 0 && (
            <button
              onClick={() => {
                setQuery("");
                setStatus("");
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export function CompactDashboard() {
  const s = useSession(),
    { battery: assignedBattery } = useAssignedTests(),
    [reports, setReports] = useState<any[]>([]);
  useEffect(() => {
    previewAction("reports/guidance")
      .then((r) => setReports(r.items))
      .catch(() => {});
  }, [s.values['rv360:profile'],s.values['rv360:submissions']]);
  const level=defaultPreparationLevel(s.values['rv360:profile']);
  const battery=assignedBattery.filter(r=>!r.test.educationLevel||r.test.educationLevel==='ambos'||r.test.educationLevel===level);
  const complete = battery.filter((r) => r.submission).length,
    next = battery.find((r) => !r.submission && !availability(r.test)),
    last = reports.find((r) => r.status === "available"&&reportEducationLevel(r,s.values['rv360:profile'])===level);
  return (
    <>
      <PageHeader
        title={"Hola, " + (s.user?.name.split(" ")[0] || "")}
        description="Un paso a la vez para comprender tus intereses."
      />
      {!last&&<SchoolRouteStart/>}
      <Card className="compact-next">
        <div>
          <span className="eyebrow">TU SIGUIENTE PASO</span>
          <h2>
            {last && !next
              ? "Tu reporte está disponible"
              : next
                ? next.count
                  ? "Retoma donde lo dejaste"
                  : "Empieza por conocerte"
                : "Ya entregaste tus tests"}
          </h2>
          <p>
            {next
              ? instrumentPresentation(next.test).title
              : "Consulta tus resultados y el estado de tu informe de orientación."}
          </p>
          <Link
            className="button button--primary button--md"
            href={next ? testHref(next.test) : "/mi-ruta/resultados"}
          >
            {next
              ? next.count
                ? "Continuar evaluación"
                : "Comenzar mis tests"
              : last
                ? "Ver mi reporte"
                : "Ver mis resultados"}
            <ArrowRight size={18} />
          </Link>
        </div>
        <div className="compact-progress">
          <ClipboardCheck size={28} />
          <strong>
            {complete} de {battery.length}
          </strong>
          <span>tests completados</span>
          <Progress
            value={complete}
            total={battery.length}
            label="Progreso de mi evaluación"
          />
        </div>
      </Card>
      <TrainingSummary />
      {last&&<Card className="stack"><span className="eyebrow">{level==='bachillerato'?'TU RUTA DE BACHILLERATO':'TU RUTA UNIVERSITARIA'}</span><h2>{level==='bachillerato'?last.analysis?.pathway?.title||'Tu orientación de bachillerato':'Tus carreras universitarias recomendadas'}</h2><p>{level==='bachillerato'?last.analysis?.pathway?.reason||'Compara Ciencias y las figuras profesionales técnicas relacionadas con tus respuestas.':last.analysis?.summary||'Explora las carreras relacionadas con tus intereses y habilidades.'}</p><Link className="button button--primary" href="/mi-ruta/resultados">Ver sugerencias y recomendaciones</Link></Card>}
      <section className="compact-section">
        <div className="section-title">
          <h2>Tu evaluación</h2>
          <span className="muted small">
            {battery.length - complete} pendientes · {complete} completados
          </span>
        </div>
        {battery.length ? (
          <TestRows rows={battery} />
        ) : (
          <Card>
            No tienes tests asignados. Tu institución los publicará aquí.
          </Card>
        )}
      </section>
      {last && (
        <Link className="compact-report-link" href="/mi-ruta/resultados">
          <FileText />
          <span>
            <b>Último reporte</b>
            <small>
              {new Date(last.createdAt).toLocaleDateString("es-EC")}
            </small>
          </span>
          <ArrowRight />
        </Link>
      )}
    </>
  );
}
export function CompactTests() {
  const { all: assigned, frozen } = useAssignedTests(),
    profile=useSession().values['rv360:profile'],
    level=defaultPreparationLevel(profile),
    all=assigned.filter(r=>!r.test.educationLevel||r.test.educationLevel==='ambos'||r.test.educationLevel===level),
    done = all.filter((r) => r.submission).length,
    progress = all.filter((r) => !r.submission && r.count > 0).length,
    percent = all.length ? Math.round((done / all.length) * 100) : 0;
  return (
    <div className="sw-tests-page">
      <header className="sw-page-heading">
        <div>
          <span className="sw-eyebrow">CONOCERTE ES EL PRIMER PASO</span>
          <h1>Mis tests</h1>
          <p>Responde a tu ritmo. Puedes guardar y continuar después.</p>
        </div>
        <span className="sw-heading-note">
          <ShieldCheck size={16} />
          Tu espacio de autoexploración
        </span>
      </header>
      <div className="sw-test-stats">
        <div>
          <span className="sw-stat-icon">
            <ClipboardCheck size={19} />
          </span>
          <span>
            <strong>{all.length}</strong>Tests asignados
          </span>
        </div>
        <div>
          <span className="sw-stat-icon teal">
            <CheckCircle2 size={19} />
          </span>
          <span>
            <strong>{done}</strong>Completados
          </span>
        </div>
        <div>
          <span className="sw-stat-icon amber">
            <BookOpen size={19} />
          </span>
          <span>
            <strong>{progress}</strong>En curso
          </span>
        </div>
      </div>
      <div className="sw-tests-layout">
        <section className="sw-tests-main" aria-label="Mis evaluaciones">
          <div className="sw-section-heading">
            <h2>Tu recorrido de autoconocimiento</h2>
            <span>{all.length - done} por completar</span>
          </div>
          <TestRows rows={all} />
        </section>
        <aside className="sw-test-aside">
          <section className="sw-journey-card">
            <span className="sw-eyebrow">ASÍ VAS AVANZANDO</span>
            <div
              className="sw-progress-ring"
              style={{
                background: `conic-gradient(#7760d8 ${percent}%,#e9e6f2 0)`,
              }}
              role="img"
              aria-label={`${done} de ${all.length} tests completados`}
            >
              <div>
                <strong>{percent}%</strong>
                <span>de tu recorrido</span>
              </div>
            </div>
            <h2>
              {all.length && done === all.length
                ? "¡Completaste tus tests!"
                : "Cada paso cuenta"}
            </h2>
            <p>
              {done
                ? `Ya completaste ${done} de ${all.length} tests. Continúa descubriendo lo que te hace único.`
                : "No tienes que decidirlo todo hoy. Empieza con una evaluación y avanza a tu ritmo."}
            </p>
            <Link href="/mi-ruta/resultados">
              Explorar mis resultados <ArrowRight size={16} />
            </Link>
          </section>
          <section className="sw-how-card">
            <h2>Antes de empezar</h2>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Busca un momento para ti</strong>
                  <p>Elige un lugar tranquilo donde puedas concentrarte.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Responde con sinceridad</strong>
                  <p>
                    En autoexploración no hay respuestas correctas o
                    incorrectas.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Continúa cuando quieras</strong>
                  <p>
                    Tus respuestas se guardan. Revisa las condiciones de cada
                    test.
                  </p>
                </div>
              </li>
            </ol>
          </section>
        </aside>
      </div>
      {frozen && (
        <p className="compact-footnote">
          Tu evaluación conserva las versiones con las que comenzaste.
        </p>
      )}
    </div>
  );
}
