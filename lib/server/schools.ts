import {randomUUID} from 'node:crypto';
import {db,document,put,fail} from './store';
import {emailProblem} from '../validation';

// Separate namespaces keep the growing directory out of every session response.
const owners=(org:string)=>({schools:'schools:'+org,members:'school-members:'+org,codes:'school-codes:'+org});
const field=(value:unknown,label:string,max:number,required=false)=>{
 if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim())||/[\x00-\x1f]/.test(value))fail('Revisa '+label+'.');
 return value.trim();
};
const like=(value:string)=>'%'+value.replace(/[!%_]/g,'!$&')+'%';
export async function schoolAction(user:any,path:string,method:string,body:any,params:URLSearchParams){
 if(!user||user.role!=='admin'||!user.institutionId)fail('Solo administración puede gestionar escuelas.',403);
 const owner=owners(user.institutionId);
 const read=async(id:string)=>{
  const row=await db.prepare('SELECT value,revision FROM documents WHERE owner=? AND key=?').get(owner.schools,id) as any;
  if(!row)fail('Escuela no disponible.',404);
  return {...JSON.parse(row.value),revision:row.revision};
 };
 const audit=async(action:string,entity:string)=>put('institution:'+user.institutionId,'rv360:audit',[
  {name:user.name,action,entity,created_at:new Date().toISOString()},
  ...await document('institution:'+user.institutionId,'rv360:audit',[]),
 ].slice(0,1000));
 if(method==='GET'){
  const page=Number(params.get('page')||1),q=(params.get('q')||'').trim();
  if(!Number.isSafeInteger(page)||page<1||page>100000||q.length>180)fail('Revisa la búsqueda y la página.');
  const limit=20,offset=(page-1)*limit;
  if(path==='admin/schools'){
   const status=params.get('status')||'Activa';
   if(!['Activa','Archivada','Todas'].includes(status))fail('Estado no válido.');
   const where="owner=? AND value LIKE ? ESCAPE '!'"+(status==='Todas'?'':" AND value LIKE ?");
   const args:any[]=[owner.schools,like(q),...(status==='Todas'?[]:['%"status":"'+status+'"%'])];
   const total=Number((await db.prepare('SELECT COUNT(*) total FROM documents WHERE '+where).get(...args) as any).total);
   const rows=await db.prepare('SELECT value,revision FROM documents WHERE '+where+' ORDER BY key LIMIT '+limit+' OFFSET '+offset).all(...args) as any[];
   const items=rows.map(row=>({...JSON.parse(row.value),revision:row.revision,students:0,counselors:0}));
   if(items.length){
    const counts=await db.prepare("SELECT m.value school,u.role,COUNT(*) total FROM documents m JOIN users u ON u.id=m.key AND u.institutionId=? WHERE m.owner=? AND m.value IN ("+items.map(()=>'?').join(',')+") GROUP BY m.value,u.role").all(user.institutionId,owner.members,...items.map(s=>JSON.stringify(s.id))) as any[];
    for(const count of counts){const school=items.find(s=>s.id===JSON.parse(count.school));if(school&&count.role==='student')school.students=Number(count.total);if(school&&count.role==='orientador')school.counselors=Number(count.total);}
   }
   return {items,total,page,pages:Math.max(1,Math.ceil(total/limit))};
  }
  if(path==='admin/schools/members'){
   const school=await read(field(params.get('schoolId'),'la escuela',100,true));
   const scope=params.get('scope')||'school';
   if(!['school','unassigned','all'].includes(scope))fail('Filtro no válido.');
   const where="u.institutionId=? AND u.role IN ('student','orientador') AND (u.name LIKE ? ESCAPE '!' OR u.email LIKE ? ESCAPE '!')"+(scope==='school'?' AND m.value=?':scope==='unassigned'?' AND m.key IS NULL':'');
   const join=' FROM users u LEFT JOIN documents m ON m.owner=? AND m.key=u.id WHERE '+where;
   const args=[owner.members,user.institutionId,like(q),like(q),...(scope==='school'?[JSON.stringify(school.id)]:[])];
   const total=Number((await db.prepare('SELECT COUNT(*) total'+join).get(...args) as any).total);
   const rows=await db.prepare('SELECT u.id,u.name,u.email,u.role,u.status,m.value assignment'+join+' ORDER BY u.name,u.id LIMIT '+limit+' OFFSET '+offset).all(...args) as any[];
   return {school,items:rows.map(({assignment,...row})=>({...row,schoolId:assignment?JSON.parse(assignment):null})),total,page,pages:Math.max(1,Math.ceil(total/limit))};
  }
 }
 if(path==='admin/schools'&&method==='POST'&&body.action==='delete')return db.transaction(async()=>{
  const id=field(body.id,'el identificador',100,true),school=await read(id);
  if(body.revision!==school.revision)fail('La escuela cambió. Recarga antes de eliminar.',409);
  // Removing directory metadata never removes accounts, profiles or work.
  await db.prepare('DELETE FROM documents WHERE owner=? AND value=?').run(owner.members,JSON.stringify(id));
  await db.prepare('DELETE FROM documents WHERE owner=? AND key=?').run(owner.codes,school.code);
  await db.prepare('DELETE FROM documents WHERE owner=? AND key=?').run(owner.schools,id);
  await audit('Eliminar escuela',id);
  return {ok:true};
 });
 if(path==='admin/schools'&&method==='POST')return db.transaction(async()=>{
  if(body.action!==undefined)fail('Operación de escuelas no válida.');
  const id=body.id===undefined?randomUUID():field(body.id,'el identificador',100,true);
  const previous=body.id===undefined?null:await read(id);
  if(previous&&body.revision!==previous.revision)fail('La escuela cambió. Recarga antes de guardar.',409);
  const code=field(body.code,'el código',40,true).toUpperCase();
  if(!/^[A-Z0-9-]{2,40}$/.test(code))fail('Usa un código de 2 a 40 letras, números o guiones.');
  const duplicate=await document(owner.codes,code);
  if(duplicate&&duplicate!==id)fail('Ya existe una escuela con ese código.',409);
  if(!['Activa','Archivada'].includes(body.status))fail('Selecciona un estado válido.');
  const school={id,name:field(body.name,'el nombre',180,true),code,status:body.status,
   city:field(body.city,'la ciudad',100),contact:field(body.contact,'el contacto',140),email:field(body.email,'el correo',254),
   createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
  if(school.email&&emailProblem(school.email))fail('Revisa el correo de contacto.');
  await put(owner.schools,id,school);await put(owner.codes,code,id);
  if(previous&&previous.code!==code)await db.prepare('DELETE FROM documents WHERE owner=? AND key=?').run(owner.codes,previous.code);
  await audit(previous?'Actualizar escuela':'Crear escuela',id);
  return {school:await read(id)};
 });
 if(path==='admin/schools/assign'&&method==='POST')return db.transaction(async()=>{
  const userId=field(body.userId,'el usuario',100,true);
  const target=await db.prepare("SELECT id FROM users WHERE id=? AND institutionId=? AND role IN ('student','orientador')").get(userId,user.institutionId);
  if(!target)fail('Usuario no disponible.',404);
  const current=await document(owner.members,userId);
  if(body.previousSchoolId!==current)fail('La asignación cambió. Recarga la lista.',409);
  const schoolId=body.schoolId===null?null:field(body.schoolId,'la escuela',100,true);
  if(schoolId){const school=await read(schoolId);if(school.status!=='Activa')fail('Reactiva la escuela antes de asignar usuarios.',409);await put(owner.members,userId,schoolId);}
  else await db.prepare('DELETE FROM documents WHERE owner=? AND key=?').run(owner.members,userId);
  await audit(schoolId?'Asignar usuario a escuela':'Retirar asignación de escuela',userId);
  return {ok:true};
 });
 fail('Operación de escuelas no disponible.',405);
}
