import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function runAssessmentImportHttp({base,adminCookie,studentCookie}) {
 const html='<h1>Test QA importado</h1><fieldset><legend>Me gusta aprender</legend><label><input type="radio">Sí</label><label><input type="radio">No</label></fieldset>';
 const fileName='test-rutas-'+randomUUID()+'.html';
 const upload=async(level,cookie=adminCookie,expected=202,reuse=false)=>{
  const form=new FormData();form.set('file',new File([html],fileName,{type:'text/html'}));if(level!==undefined)form.set('educationLevel',level);
  if(reuse)form.set('reuse','1');
  const response=await fetch(base+'/api/admin/import',{method:'POST',headers:{Origin:base,Cookie:cookie},body:form});
  const value=await response.json();assert.equal(response.status,expected,value.error);return value;
 };
 await upload(undefined,adminCookie,400);await upload('ambos',adminCookie,400);await upload('bachillerato',studentCookie,403);
 const [school,university]=await Promise.all([upload('bachillerato'),upload('universidad')]);
 assert.notEqual(school.id,university.id,'The same document can be uploaded independently to both categories');
 for(const [job,educationLevel] of [[school,'bachillerato'],[university,'universidad']]){
  assert.equal(job.educationLevel,educationLevel);
  let result;
  for(let i=0;i<120;i++){
   const response=await fetch(base+'/api/admin/import?id='+job.id+'&status=1',{headers:{Cookie:adminCookie}});assert.equal(response.status,200);result=await response.json();
   if(result.status==='Completado')break;assert.notEqual(result.status,'Error',result.error);await new Promise(r=>setTimeout(r,50));
  }
  assert.equal(result.status,'Completado');assert.equal(result.educationLevel,educationLevel);assert(result.tests.length);assert(result.tests.every(t=>t.educationLevel===educationLevel && t.sourceId===job.id));
  const reused=await upload(educationLevel,adminCookie,202,true);assert.equal(reused.id,job.id);assert.equal(reused.reused,true);assert.equal(reused.status,'Completado');
  const assign=await fetch(base+'/api/admin/import',{method:'POST',headers:{Origin:base,Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({id:job.id,action:'assign',educationLevel:educationLevel==='bachillerato'?'universidad':'bachillerato'})});assert.equal(assign.status,409);
 }
 await upload('bachillerato',adminCookie,400);
 const suggest=async(body,expected)=>{
  const response=await fetch(base+'/api/import-presentation',{method:'POST',headers:{Origin:base,Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const value=await response.json();assert.equal(response.status,expected,value.error);return value;
 };
 await suggest({operation:'study-options',educationLevel:'ambos',title:'QA',description:'QA'},400);
 await suggest({operation:'simulator',title:'QA',careers:[],questions:[{id:'q1'}]},400);
 const unavailable=await suggest({operation:'study-options',educationLevel:'bachillerato',title:'Informática',description:'Programación y redes'},503);
 assert.equal(unavailable.code,'AI_CONFIG','Missing AI configuration must be actionable and must not trigger futile retries');
 console.log('PASS HTTP imports: protected multipart upload, mandatory category, independent duplicate detection, worker results and immutable category.');
}
