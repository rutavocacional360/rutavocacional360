import type {Simulator} from './training-types';
import {adminFetch} from './admin-session';
import {preparationLevel,schoolTarget} from '../data/school-training';
const clean=(v:unknown,max:number)=>typeof v==='string'?v.replace(/<[^>]*>/g,'').trim().slice(0,max):'';
export function applySimulatorSuggestions(s:Simulator,value:any,careers:{id:string;name:string}[],allowTime=false):Simulator{
 const allowed=new Set(careers.filter(c=>!s.educationLevel||schoolTarget(c.id)===(s.educationLevel==='bachillerato')).map(c=>c.id));
 const title=s.instrument.presentation?.title?.trim()||clean(value?.title,100),summary=s.instrument.presentation?.summary?.trim()||clean(value?.summary,280);
 return {...s,title:s.title.trim()?s.title:clean(value?.title,100),careerIds:s.careerIds?.length?s.careerIds:[...new Set<string>((Array.isArray(value?.careerIds)?value.careerIds:[]).filter((id:any)=>allowed.has(id)))],
  durationMinutes:allowTime&&Number.isInteger(value?.durationMinutes)&&value.durationMinutes>0&&value.durationMinutes<=480?value.durationMinutes:s.durationMinutes,
  instrument:{...s.instrument,...(title&&summary?{presentation:{...s.instrument.presentation,title,summary}}:{}),description:s.instrument.description.trim()?s.instrument.description:clean(value?.instructions,600)},
  questions:s.questions.map(q=>{
   const a=Array.isArray(value?.questions)?value.questions.find((a:any)=>a?.id===q.id):null;if(!a)return q;
   const next={...q};let changed=false;
   const options=q.options||s.instrument.options;
   if(!q.correctValues?.length&&['single','multiple','yesno'].includes(q.type||'single')){
    const keys=Array.isArray(a.correctValues)?[...new Set<number>(a.correctValues)]:[];
    if(!a.issue&&keys.length>0&&keys.every(k=>options.some(o=>o.value===k))&&(q.type==='multiple'?keys.length>=(q.minSelections??1)&&keys.length<=(q.maxSelections??options.length):keys.length===1)){next.correctValues=keys;changed=true;}
   }
   if(!a.issue&&q.type==='short'&&!q.acceptedTexts?.length&&Array.isArray(a.acceptedTexts)){
    const answers=a.acceptedTexts.map((v:any)=>clean(v,200)).filter(Boolean).slice(0,20);if(answers.length){next.acceptedTexts=answers;changed=true;}
   }
   if(!a.issue&&q.type==='number'&&!q.numericKey&&Number.isFinite(a.numericKey?.min)&&Number.isFinite(a.numericKey?.max)&&a.numericKey.min<=a.numericKey.max){next.numericKey={min:a.numericKey.min,max:a.numericKey.max};changed=true;}
   if(!q.explanation?.trim()&&clean(a.explanation,1500)){next.explanation=clean(a.explanation,1500);changed=true;}
   if(!q.topic&&clean(a.topic,100))next.topic=clean(a.topic,100);
   if(!q.difficulty&&['introductory','intermediate','advanced'].includes(a.difficulty))next.difficulty=a.difficulty;
   if(clean(a.issue,300))next.aiIssue=clean(a.issue,300);else if(next.aiIssue)delete next.aiIssue;
   if(changed){next.aiSuggested=true;next.reviewed=false;}
   return next;
  })};
}
export async function autofillSimulator(s:Simulator,careers:{id:string;name:string}[],allowTime=false,onProgress?:(message:string)=>void){
 let simulator=s,completed=0;const messages:string[]=[];
 // Retry only unfinished questions: reviewed content is never regenerated.
 const pending=s.questions.filter(q=>!q.explanation?.trim()||q.aiIssue||(['single','multiple','yesno'].includes(q.type||'single')?!q.correctValues?.length:q.type==='short'?!q.acceptedTexts?.length:q.type==='number'?!q.numericKey:false));
 const metadataPending=!s.careerIds?.length||!s.title.trim()||!s.instrument.description.trim()||!s.instrument.presentation?.title?.trim()||!s.instrument.presentation?.summary?.trim();
 const questions=pending.length?pending:(metadataPending?s.questions.slice(0,5):[]);
 try{

  for(let i=0;i<questions.length;i+=5){
   const batch=questions.slice(i,i+5);onProgress?.('Preparando preguntas '+(i+1)+'–'+(i+batch.length)+' de '+questions.length+'…');
   let data:any;
   for(let attempt=0;attempt<3;attempt++){
    try{
     const response=await adminFetch('/api/import-presentation',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(55000),body:JSON.stringify({operation:'simulator',educationLevel:preparationLevel(s.careerIds,s.educationLevel),title:s.title.slice(0,500),description:s.instrument.description.slice(0,12000),careers:careers.map(({id,name})=>({id,name})),questions:batch.map(q=>({...q,options:q.options||s.instrument.options}))})},55000);
     data=await response.json().catch(()=>({}));
     if(!response.ok)throw Object.assign(Error(response.status===401?'Tu sesión administrativa ha vencido. Guarda el borrador e inicia sesión de nuevo.':data.error||'El servicio de IA no respondió. Reintenta sin perder el documento.'),{retryable:[429,502,503,504].includes(response.status)&&data.code!=='AI_CONFIG'});
     if(!Array.isArray(data.suggestions?.questions)||batch.some(q=>!data.suggestions.questions.some((a:any)=>a?.id===q.id)))throw Object.assign(Error('La IA devolvió un bloque incompleto. Reintenta para completar las preguntas pendientes.'),{retryable:true});
     break;
    }catch(e:any){if(attempt===2||e.retryable===false)throw e;onProgress?.('Reintentando el bloque '+(Math.floor(i/5)+1)+'…');await new Promise(r=>setTimeout(r,1000*(attempt+1)));}
   }
   simulator=applySimulatorSuggestions(simulator,data.suggestions,careers,allowTime&&i===0);completed+=batch.length;
  }
 }catch(e){messages.push((e as Error).message);}
 if(completed)messages.unshift('Preparadas '+completed+' preguntas con IA. Revisa el resumen antes de publicar.');
 if(!questions.length)messages.push('Las claves y explicaciones ya están completas. Puedes revisar y publicar.');
 return {simulator,message:messages.join(' ')};
}
