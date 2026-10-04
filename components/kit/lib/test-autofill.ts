import {adminFetch} from './admin-session';
import {fillTestDraft,stableDraft,testDraftIssues,type TestDraft,type CompletedTestDraft} from './test-draft-completion';

export async function completeTestDraft(instrument:TestDraft,context=''):Promise<CompletedTestDraft>{
 const response=await adminFetch('/api/import-presentation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'test-draft',instrument,context})},60000);
 const value=await response.json().catch(()=>null);
 if(!response.ok)throw Object.assign(Error(value?.error||'No se pudo completar el borrador. Reintenta sin perder tus cambios.'),{code:value?.code});
 if(!value?.instrument||!Array.isArray(value.instrument.questions)||!Array.isArray(value.completed)||!Array.isArray(value.review)||!Array.isArray(value.issues)||typeof value.complete!=='boolean')throw Error('La respuesta de IA está incompleta. El borrador original se conserva.');
 const merged=fillTestDraft(instrument,value.instrument);
 if(stableDraft(merged)!==stableDraft(value.instrument))throw Error('La sugerencia intentó cambiar datos existentes. El borrador original se conserva.');
 const issues=testDraftIssues(merged);
 return {...value,instrument:merged,issues:[...issues,...value.issues.filter((issue:any)=>!issues.some(item=>item.questionId===issue.questionId&&item.message===issue.message))],complete:value.complete&&issues.length===0};
}
