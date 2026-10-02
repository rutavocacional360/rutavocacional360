import { flush,refreshSession } from "../../lib/session";
import {nameProblem,emailProblem,textProblem} from '@/lib/validation';
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Download, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import type { User } from "../../types";
import { useUsers } from "../../lib/useUsers";
import { downloadCSV } from "../../lib/storage";
import {
  Button,
  Field,
  Notice,
  PageHeader,
  SelectField,
} from "../../components/ui/primitives";
import { Dialog } from "../../components/ui/Dialog";
import { UserTable } from "../../components/domain/UserTable";
import { useToast } from "../../components/ui/Toast";
export function UserForm({
  user,
  onSave,
  onCancel,
  existing = false,
}: {
  user: User;
  existing?: boolean;
  onSave: (user: User) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(user);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errors: Record<string, string> = {};
    if (nameProblem(form.name)) errors.name = nameProblem(form.name);
    if (emailProblem(form.email)) errors.email = emailProblem(form.email);
    if (textProblem(form.group,100,true)) errors.group = 'Escribe un grupo de hasta 100 caracteres.';
    setErrors(errors);
    if (!Object.keys(errors).length) {
      setBusy(true);
      try { await onSave({
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        group: form.group.trim(),
      }); } finally { setBusy(false); }
    }
  }
  return (
    <form className="stack" noValidate onSubmit={submit}>
      <Notice tone="neutral">
        Las cuentas nuevas quedan pendientes de activación. El estudiante puede solicitar su enlace de acceso desde Recuperar contraseña si el correo está configurado.
      </Notice>
      <Field
        label="Nombre y apellido"
        personName validate={nameProblem} maxLength={140} required
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        error={errors.name}
      />
      <Field
        label="Correo electrónico"
        type="email"
        validate={emailProblem} maxLength={254} required
        readOnly={existing}
        hint={existing ? "El correo identifica la cuenta." : undefined}
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        error={errors.email}
      />
      <div className="grid grid-2">
        <SelectField
          label="Rol"
          value={form.role}
          onChange={(e) =>
            setForm({ ...form, role: e.target.value as User["role"] })
          }
        >
          <option>Estudiante</option>
          <option>Orientador</option>
        </SelectField>
        <SelectField
          label="Estado"
          value={form.status}
          onChange={(e) =>
            setForm({ ...form, status: e.target.value as User["status"] })
          }
        >
          <option>Activo</option>
          <option>Invitación pendiente</option>
          <option>Suspendido</option>
        </SelectField>
      </div>
      <Field
        label="Grupo"
        maxLength={100} validate={v=>textProblem(v,100,true)} required
        value={form.group}
        onChange={(e) => setForm({ ...form, group: e.target.value })}
        error={errors.group}
      />
      <div className="row">
        <Button type="submit" loading={busy}>Guardar usuario</Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
export function Users() {
  const [users, setUsers, saved] = useUsers();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<User | null>(null);
  const [duplicate, setDuplicate] = useState("");
  const toast = useToast();
  const filtered = useMemo(
    () =>
      users.filter(
        (u) =>
          (u.name + " " + u.email)
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (!role || role === u.role) &&
          (!status || status === u.status),
      ),
    [users, query, role, status],
  );
  const maxPage = Math.max(0, Math.ceil(filtered.length / 6) - 1);
  const actualPage = Math.min(page, maxPage);
  async function save(user: User) {
    if (
      users.some(
        (u) =>
          u.id !== user.id &&
          u.email.toLowerCase() === user.email.toLowerCase(),
      )
    ) {
      setDuplicate("Ya existe un usuario con ese correo.");
      return;
    }
    try { await setUsers((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.map((u) => (u.id === user.id ? user : u))
        : [...prev, user],
    );
    await flush(); await refreshSession(); } catch(error) { setDuplicate((error as Error).message); return; }
    setEditing(null);
    setDuplicate("");
    toast("Usuario guardado");
  }
  return (
    <>
      <PageHeader
        eyebrow="ADMINISTRACIÓN"
        title="Usuarios"
        description="Organiza los perfiles de estudiantes y orientadores de tu institución."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Download size={16} />}
              onClick={() =>
                downloadCSV("usuarios.csv", [
                  ["Nombre", "Correo", "Rol", "Grupo", "Estado"],
                  ...filtered.map((u) => [
                    u.name,
                    u.email,
                    u.role,
                    u.group,
                    u.status,
                  ]),
                ])
              }
            >
              Exportar
            </Button>
            <Button
              icon={<Plus size={17} />}
              onClick={() => {
                setDuplicate("");
                setEditing({
                  id: crypto.randomUUID(),
                  name: "",
                  email: "",
                  role: "Estudiante",
                  group: "",
                  status: "Invitación pendiente",
                });
              }}
            >
              Añadir usuario
            </Button>
          </>
        }
      />
      <div className="filters">
        <Field
          label="Buscar usuario"
          type="search"
          placeholder="Nombre o correo"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <SelectField
          label="Rol"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Todos los roles</option>
          <option>Estudiante</option>
          <option>Orientador</option>
        </SelectField>
        <SelectField
          label="Estado"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Todos los estados</option>
          <option>Activo</option>
          <option>Invitación pendiente</option>
          <option>Suspendido</option>
        </SelectField>
      </div>
      <UserTable
        users={filtered.slice(actualPage * 6, (actualPage + 1) * 6)}
        onEdit={(u) => {
          setDuplicate("");
          setEditing(u);
        }}
      />
      <div className="pagination">
        <span>
          {filtered.length} usuarios encontrados · Página {actualPage + 1} de{" "}
          {maxPage + 1}
        </span>
        <div className="row">
          <Button
            size="sm"
            variant="secondary"
            disabled={actualPage === 0}
            onClick={() => setPage(actualPage - 1)}
            icon={<ChevronLeft size={16} />}
          >
            Anterior
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={actualPage >= maxPage}
            onClick={() => setPage(actualPage + 1)}
          >
            Siguiente <ChevronRight size={16} />
          </Button>
        </div>
      </div>
      {!saved && (
        <Notice tone="warning">
          Los cambios están pendientes de confirmación. Revisa el indicador de guardado.
        </Notice>
      )}
      <Dialog
        side
        open={!!editing}
        onClose={() => setEditing(null)}
        title={
          editing && users.some((u) => u.id === editing.id)
            ? "Editar usuario"
            : "Añadir usuario"
        }
      >
        {duplicate && (
          <div style={{ marginBottom: 16 }}>
            <Notice tone="danger">{duplicate}</Notice>
          </div>
        )}
        {editing && (
          <UserForm
            key={editing.id}
            user={editing}
            existing={users.some(u => u.id === editing.id)}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </>
  );
}
