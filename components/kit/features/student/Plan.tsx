import { flush } from '../../lib/session';
import { Tasks } from "./Tasks";
import { useState } from "react";
import { Check, Download, ArrowRight, Lightbulb } from "lucide-react";
import { stations } from "../../data/course";
import {
  downloadText,
  isStringArray,
  isStringRecord,
  useLocalState,
} from "../../lib/storage";
import {
  Badge,
  Button,
  Card,
  Notice,
  PageHeader,
  Progress,
  TextareaField,
} from "../../components/ui/primitives";
import { useToast } from "../../components/ui/Toast";
export function StationNavigation({
  active,
  completed,
  onChange,
}: {
  active: number;
  completed: string[];
  onChange: (index: number) => void;
}) {
  return (
    <nav className="station-list" aria-label="Estaciones de mi plan">
      {stations.map((s, i) => (
        <button
          key={s.title}
          className={"station-button " + (active === i ? "active" : "")}
          onClick={() => onChange(i)}
          aria-current={active === i ? "step" : undefined}
        >
          <span
            className={
              "station-number " + (completed.includes(String(i)) ? "done" : "")
            }
          >
            {completed.includes(String(i)) ? <Check size={14} /> : i + 1}
          </span>
          <span>{s.title}</span>
        </button>
      ))}
    </nav>
  );
}
export function Plan() {
  const [active, setActive] = useState(0);
  const [notes, setNotes, saved] = useLocalState<Record<string, string>>(
    "rv360:course-notes",
    {},
    isStringRecord,
  );
  const [done, setDone] = useLocalState<string[]>(
    "rv360:course-done",
    [],
    isStringArray,
  );
  const toast = useToast();
  const station = stations[active];
  async function complete() {
    if (!(notes[active] || "").trim()) return;
    try { await setDone((prev) =>
      prev.includes(String(active)) ? prev : [...prev, String(active)],
    );
    await flush(); toast("Reflexión guardada y estación completada");
    if (active < stations.length - 1) setActive(active + 1); } catch(e) { toast((e as Error).message); }
  }
  return (
    <>
      <PageHeader
        eyebrow="DE LAS IDEAS A LA ACCIÓN"
        title="Mi plan de orientación"
        description="Ocho estaciones para conocerte y construir una decisión provisional."
        actions={
          <Button
            variant="secondary"
            icon={<Download size={17} />}
            onClick={() =>
              downloadText(
                "mi-plan-vocacional.txt",
                [
                  "MI PLAN — RUTA VOCACIONAL 360°",
                  ...stations.map(
                    (s, i) =>
                      "\n" +
                      (i + 1) +
                      ". " +
                      s.title +
                      "\n" +
                      s.prompt +
                      "\n" +
                      (notes[i] || "Pendiente"),
                  ),
                ].join("\n"),
              )
            }
          >
            Descargar mi plan
          </Button>
        }
      />
      <div className="course-layout align-start">
        <Card>
          <Progress
            value={done.length}
            total={8}
            label="Estaciones completadas"
          />
          <div style={{ marginTop: 24 }}>
            <StationNavigation
              active={active}
              completed={done}
              onChange={setActive}
            />
          </div>
        </Card>
        <div className="stack"><Card className="stack">
          <div className="row between">
            <Badge tone="primary">Estación {active + 1} de 8</Badge>
            {done.includes(String(active)) && (
              <Badge tone="success">Completada</Badge>
            )}
          </div>
          <h2 style={{ fontSize: 28 }}>{station.title}</h2>
          <p>{station.prompt}</p>
          <Notice>
            <div className="row">
              <Lightbulb size={17} />
              {station.tip}
            </div>
          </Notice>
          <TextareaField maxLength={10000}
            label="Mi reflexión"
            placeholder="Escribe tus ideas. Puedes comenzar con una frase..."
            rows={7}
            value={notes[active] || ""}
            onChange={(e) => {
              setNotes((prev) => ({ ...prev, [active]: e.target.value }));
              if (!e.target.value.trim())
                setDone((prev) => prev.filter((id) => id !== String(active)));
            }}
            hint={
              saved
                ? "Se guarda automáticamente en tu cuenta."
                : "Guardado pendiente: revisa el indicador antes de salir."
            }
          />
          <div className="row between">
            <Button
              variant="secondary"
              onClick={() => setActive((v) => v - 1)}
              disabled={active === 0}
            >
              Anterior
            </Button>
            <Button
              onClick={complete}
              disabled={!(notes[active] || "").trim()}
              icon={<ArrowRight size={17} />}
            >
              {active === 7 ? "Completar mi plan" : "Completar y continuar"}
            </Button>
          </div>
          {done.length === 8 && (
            <Notice tone="success">
              Completaste las ocho estaciones. Tu plan puede seguir cambiando
              con lo que descubras.
            </Notice>
          )}
        </Card><Tasks/></div>
      </div>
    </>
  );
}
