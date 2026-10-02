import { settingsProblem } from "@/lib/validation";
import { AuditLog } from "./Publication";
import { flush } from "../../lib/session";
import { useState } from "react";
import { Save, Building2, ShieldCheck } from "lucide-react";
import { isStringRecord, useLocalState } from "../../lib/storage";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  Notice,
  PageHeader,
  SelectField,
  SectionTitle,
} from "../../components/ui/primitives";
import { useToast } from "../../components/ui/Toast";
export function Settings() {
  const [stored, setStored] = useLocalState<Record<string, string>>(
    "rv360:admin-settings",
    {
      name: "",
      code: "",
      email: "",
      year: "2026–2027",
      timezone: "America/Guayaquil",
      selfRegistration: "yes",
      reviewRequired: "yes",
    },
    isStringRecord,
  );
  const [form, setForm] = useState(stored);
  const [error, setError] = useState("");
  const toast = useToast();
  return (
    <>
      <PageHeader
        eyebrow="ADMINISTRACIÓN"
        title="Configuración de la plataforma"
        description="Administra los datos de soporte y las preferencias de Ruta Vocacional 360°."
      />
      <form
        className="stack"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const problem = settingsProblem(form);
          if (problem) { setError(problem); return; }
          try {await setStored(form);await flush();setError("");toast("Configuración guardada");} catch(e){setError((e as Error).message);}
        }}
      >
        <div className="grid grid-2 align-start">
          <Card className="stack">
            <SectionTitle
              title="Datos de la plataforma"
              action={<Building2 size={22} />}
            />
            <Field
              label="Nombre"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <Field
              label="Correo de orientación"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Field
              label="Periodo académico"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
            />
            <SelectField
              label="Zona horaria"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            >
              <option value="America/Guayaquil">
                Ecuador continental · America/Guayaquil
              </option>
              <option value="Pacific/Galapagos">
                Galápagos · Pacific/Galapagos
              </option>
            </SelectField>
          </Card>
          <div className="stack">
            <Card className="stack">
              <SectionTitle title="Preferencias del flujo" />
              <Checkbox
                label="Permitir nuevos registros de estudiantes."
                checked={form.selfRegistration === "yes"}
                onChange={(e) =>
                  setForm({
                    ...form,
                    selfRegistration: e.target.checked ? "yes" : "no",
                  })
                }
              />
              <Checkbox
                label="Conservar las versiones publicadas sin modificaciones."
                disabled
                checked={form.reviewRequired === "yes"}
                onChange={(e) =>
                  setForm({
                    ...form,
                    reviewRequired: e.target.checked ? "yes" : "no",
                  })
                }
              />
              <Notice tone="neutral">
                Revisa los borradores antes de publicar cambios para la plataforma.
              </Notice>
            </Card>
            <Card className="stack">
              <div className="row">
                <span className="icon-tile teal">
                  <ShieldCheck />
                </span>
                <h3>Roles y acceso</h3>
              </div>
              <p className="muted small">
                {'El servidor comprueba la sesión y los permisos en cada operación. Cada estudiante accede a su propia información.'}
              </p>
              <div className="row">
                <Badge>Estudiante</Badge>
                <Badge>Orientador</Badge>
                <Badge tone="primary">Administrador</Badge>
              </div>
            </Card>
          </div>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="row">
          <Button type="submit" icon={<Save size={17} />}>
            Guardar configuración
          </Button>
          <small className="muted">Los cambios se aplican al guardar.</small>
        </div>
      </form>
      <div className="stack" style={{marginTop:24}}><AuditLog/></div>
    </>
  );
}
