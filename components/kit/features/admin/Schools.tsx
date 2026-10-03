import {useEffect,useState} from 'react';
import {School,Plus,ArrowLeft,Search} from 'lucide-react';
import {adminFetch} from '../../lib/admin-session';
import {readApiResponse} from '../../lib/api-response';
import {Badge,Button,Card,Field,Notice,PageHeader,SelectField} from '../../components/ui/primitives';
import {Dialog} from '../../components/ui/Dialog';
import {useToast} from '../../components/ui/Toast';
import './schools.css';

type SchoolRecord={id?:string;revision?:number;name:string;code:string;city:string;contact:string;email:string;status:string;students?:number;counselors?:number};
type Member={id:string;name:string;email:string;role:string;status:string;schoolId:string|null};
type Directory={items:any[];total:number;pages:number;school?:SchoolRecord};
const blank=():SchoolRecord=>({name:'',code:'',city:'',contact:'',email:'',status:'Activa'});
const api=async(path:string,options:RequestInit={})=>readApiResponse(await adminFetch('/api/admin/schools'+path,options));
export function Schools(){
 const toast=useToast();
 const [selected,setSelected]=useState<SchoolRecord|null>(null),[editing,setEditing]=useState<SchoolRecord|null>(null);
 const [search,setSearch]=useState(''),[q,setQ]=useState(''),[status,setStatus]=useState('Activa'),[scope,setScope]=useState('school'),[page,setPage]=useState(1);
 const [data,setData]=useState<Directory|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[formError,setFormError]=useState('');
 const [busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[assignment,setAssignment]=useState<{member:Member;schoolId:string|null}|null>(null);
 useEffect(()=>{
  let alive=true;const controller=new AbortController();setLoading(true);setError('');
  const params=new URLSearchParams({q,page:String(page),status,scope,...(selected?.id?{schoolId:selected.id}:{})});
  api((selected?'/members':'')+'?'+params,{signal:controller.signal}).then(result=>{if(alive){if(page>result.pages){setPage(result.pages);return;}setData(result);}}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;controller.abort();};
 },[selected?.id,q,page,status,scope,revision]);
 const open=(school:SchoolRecord|null)=>{setSelected(school);setData(null);setSearch('');setQ('');setPage(1);setScope('school');};
 const save=async()=>{
  if(busy||!editing)return;setBusy(true);setFormError('');
  try{await api('',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(editing)});setEditing(null);setRevision(n=>n+1);toast('Escuela guardada.');}
  catch(e){setFormError((e as Error).message);}finally{setBusy(false);}
 };
 const assign=async()=>{
  if(busy||!assignment)return;setBusy(true);setFormError('');
  try{await api('/assign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:assignment.member.id,schoolId:assignment.schoolId,previousSchoolId:assignment.member.schoolId})});setAssignment(null);setRevision(n=>n+1);toast('Asignación actualizada.');}
  catch(e){setFormError((e as Error).message);}finally{setBusy(false);}
 };
 const activeSchool=data?.school||selected;
 return <div className="stack school-directory">
  {selected&&<div><Button variant="ghost" icon={<ArrowLeft size={17}/>} onClick={()=>open(null)}>Volver a escuelas</Button></div>}
  <PageHeader eyebrow="COMUNIDAD EDUCATIVA" title={selected?activeSchool?.name||'Escuela':'Escuelas'} description={selected?'Organiza estudiantes y orientadores de este centro.':'Prepara tu red de centros educativos y organiza a sus usuarios desde un solo lugar.'} actions={!selected?<Button icon={<Plus size={17}/>} onClick={()=>{setEditing(blank());setFormError('');}}>Crear escuela</Button>:undefined}/>
  <Notice>El administrador conserva el control de la plataforma. La asignación a una escuela organiza usuarios; no cambia sus permisos, evaluaciones ni su centro de procedencia declarado.</Notice>
  {selected&&activeSchool?.status==='Archivada'&&<Notice tone="warning">Esta escuela está archivada. Conserva sus usuarios e historial; reactívala desde el directorio para recibir nuevas asignaciones.</Notice>}
  <Card><form className="school-filters" onSubmit={e=>{e.preventDefault();setQ(search.trim());setPage(1);}}>
   <Field label={selected?'Buscar usuario':'Buscar escuela'} placeholder={selected?'Nombre o correo':'Nombre, código o ciudad'} value={search} maxLength={180} onChange={e=>setSearch(e.target.value)}/>
   {selected?<SelectField label="Usuarios" value={scope} onChange={e=>{setScope(e.target.value);setPage(1);}}><option value="school">De esta escuela</option><option value="unassigned">Sin escuela asignada</option><option value="all">Todos los usuarios</option></SelectField>:<SelectField label="Estado" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option>Activa</option><option>Archivada</option><option>Todas</option></SelectField>}
   <Button type="submit" variant="secondary" icon={<Search size={16}/>}>Buscar</Button>
  </form></Card>
  {error?<Notice tone="danger">{error} <Button variant="ghost" onClick={()=>setRevision(n=>n+1)}>Reintentar</Button></Notice>:loading?<p role="status">Cargando {selected?'usuarios':'escuelas'}…</p>:<>
   {!data?.items.length&&<Card><h2>{selected?'No hay usuarios en esta lista':'No hay escuelas en esta lista'}</h2><p className="muted">{selected?'Prueba otra búsqueda o selecciona «Sin escuela asignada» para organizar a tus usuarios.':'Crea una escuela para empezar o ajusta la búsqueda y el estado.'}</p></Card>}
   {!selected?<div className="school-grid">{data?.items.map((school:SchoolRecord)=><Card key={school.id} className="stack school-card"><div className="row"><School size={24}/><Badge tone={school.status==='Activa'?'success':'neutral'}>{school.status}</Badge></div><h2>{school.name}</h2><p className="muted">{school.code}{school.city?' · '+school.city:''}</p><p><strong>{school.students}</strong> estudiantes · <strong>{school.counselors}</strong> orientadores</p>{school.contact&&<p className="small">Contacto: {school.contact}</p>}{school.email&&<p className="small">{school.email}</p>}<div className="row"><Button variant="secondary" onClick={()=>open(school)}>Ver usuarios</Button><Button variant="ghost" onClick={()=>{setEditing(school);setFormError('');}}>Editar escuela</Button></div></Card>)}</div>:<div className="stack">{data?.items.map((member:Member)=><Card className="school-member" key={member.id}><div><h2>{member.name}</h2><p className="muted small">{member.email}</p><p className="small">{member.role==='student'?'Estudiante':'Orientador'} · {member.status} · {member.schoolId===selected.id?'Esta escuela':member.schoolId?'Asignado a otra escuela':'Sin escuela asignada'}</p></div><Button variant="secondary" disabled={member.schoolId!==selected.id&&activeSchool?.status!=='Activa'} onClick={()=>{setAssignment({member,schoolId:member.schoolId===selected.id?null:selected.id!});setFormError('');}}>{member.schoolId===selected.id?'Retirar asignación':member.schoolId?'Cambiar a esta escuela':'Asignar a esta escuela'}</Button></Card>)}</div>}
   {!!data?.total&&<div className="school-pagination"><span>{data.total} {selected?'usuarios':'escuelas'} · Página {page} de {data.pages}</span><div className="row"><Button variant="secondary" disabled={page===1} onClick={()=>setPage(n=>n-1)}>Anterior</Button><Button variant="secondary" disabled={page>=data.pages} onClick={()=>setPage(n=>n+1)}>Siguiente</Button></div></div>}
  </>}
  <Dialog open={!!editing} title={editing?.id?'Editar escuela':'Crear escuela'} wide onClose={()=>{if(!busy)setEditing(null);}}>{editing&&<form className="stack" onSubmit={e=>{e.preventDefault();void save();}}>
   <fieldset disabled={busy} className="school-fieldset stack"><Field label="Nombre de la escuela" required maxLength={180} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/><div className="grid grid-2"><Field label="Código único" required minLength={2} maxLength={40} pattern="[A-Za-z0-9-]{2,40}" hint="Código AMIE o código interno; letras, números y guiones." value={editing.code} onChange={e=>setEditing({...editing,code:e.target.value})}/><Field label="Ciudad o cantón" maxLength={100} value={editing.city} onChange={e=>setEditing({...editing,city:e.target.value})}/><Field label="Persona de contacto" maxLength={140} value={editing.contact} onChange={e=>setEditing({...editing,contact:e.target.value})}/><Field label="Correo de contacto" type="email" maxLength={254} value={editing.email} onChange={e=>setEditing({...editing,email:e.target.value})}/></div><SelectField label="Estado" value={editing.status} onChange={e=>setEditing({...editing,status:e.target.value})}><option>Activa</option><option>Archivada</option></SelectField>{editing.status==='Archivada'&&<Notice>Archivar detiene las nuevas asignaciones. Conserva las existentes y no suspende las cuentas.</Notice>}</fieldset>
   {formError&&<Notice tone="danger">{formError}</Notice>}<div className="row"><Button type="submit" loading={busy}>Guardar escuela</Button><Button variant="secondary" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</Button></div>
  </form>}</Dialog>
  <Dialog open={!!assignment} title="Confirmar asignación" onClose={()=>{if(!busy)setAssignment(null);}}>{assignment&&<div className="stack"><p>{assignment.schoolId?`Asignar a ${assignment.member.name} a ${activeSchool?.name}. Si tenía otra escuela, esta asignación la reemplazará.`:`Retirar a ${assignment.member.name} de esta escuela.`}</p><p className="muted">La cuenta, los permisos y los resultados se conservan.</p>{formError&&<Notice tone="danger">{formError}</Notice>}<div className="row"><Button loading={busy} onClick={()=>void assign()}>Confirmar</Button><Button variant="secondary" disabled={busy} onClick={()=>setAssignment(null)}>Cancelar</Button></div></div>}</Dialog>
 </div>;
}
