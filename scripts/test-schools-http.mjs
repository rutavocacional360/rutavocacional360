import assert from 'node:assert/strict';
export async function testSchoolsHttp({request,adminCookie,cookie,userId,base}){
 assert.equal((await request('admin/schools')).status,401);
 assert.equal((await request('admin/schools',null,cookie)).status,403);
 const create=await request('admin/schools',{name:'Escuela HTTP QA',code:'HTTP-QA',city:'Quito',contact:'',email:'',status:'Activa'},adminCookie);
 assert.equal(create.status,200);let school=(await create.json()).school;
 assert.equal((await request('admin/schools',null,adminCookie)).status,200);
 assert.equal((await request('admin/schools/assign',{userId,schoolId:school.id,previousSchoolId:null},cookie)).status,403);
 assert.equal((await request('admin/schools/assign',{userId,schoolId:school.id,previousSchoolId:null},adminCookie)).status,200);
 const members=await request('admin/schools/members?schoolId='+school.id,null,adminCookie);
 assert.equal((await members.json()).total,1);
 const archived=await request('admin/schools',{...school,status:'Archivada'},adminCookie);assert.equal(archived.status,200);school=(await archived.json()).school;
 assert.equal((await request('admin/schools/assign',{userId,schoolId:school.id,previousSchoolId:school.id},adminCookie)).status,409);
 assert.equal((await request('admin/schools/members?schoolId='+school.id,null,adminCookie)).status,200);
 assert.equal((await fetch(base+'/admin/escuelas',{headers:{Cookie:adminCookie}})).status,200);
 const blocked=await fetch(base+'/admin/escuelas',{headers:{Cookie:cookie},redirect:'manual'});assert.equal(blocked.status,307);
 console.log('PASS HTTP schools: authorization, create/list, assignment, archive, retained members and protected page.');
}
