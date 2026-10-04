import type {Instrument} from '../types';
import {instrumentProblems} from './test-engine';

export type TestDraft=Instrument&{status:string;[key:string]:any};
export type DraftIssue={questionId?:string;step:number;message:string};
export type CompletedTestDraft={instrument:TestDraft;completed:string[];review:string[];issues:DraftIssue[];complete:boolean};
const missing=(value:any)=>value===undefined||value===null||typeof value==='string'&&!value.trim()||Array.isArray(value)&&!value.length;
// This exact text is emitted by the document importer, never meaningful instructions.
export const importedInstructionPlaceholder=(value:unknown)=>typeof value==='string'&&value.trim()==='Instrumento importado. Revisa su contenido antes de publicar.';
const rootFields=['title','description','purpose','source','scoring','aggregation','dimensions','ranges'];
const questionFields=['text','help','source','explanation','type','policy','dimension','correctValues','acceptedTexts','numericKey','min','max','step','rows','rubric','rankingPoints','minSelections','maxSelections'];

/** A proposal may fill gaps; it cannot replace settings, IDs or manual content. */
export function fillTestDraft(original:TestDraft,proposal:any):TestDraft{
 const next=structuredClone(original);
 const fill=(target:any,source:any,fields:string[])=>{for(const key of fields)if((missing(target[key])||key==='description'&&importedInstructionPlaceholder(target[key]))&&!missing(source?.[key]))target[key]=structuredClone(source[key]);};
 const options=(current:any[],suggested:any[])=>!current?.length?structuredClone(suggested||[]):current.map(option=>{
  const next={...option},found=suggested?.find(item=>item.value===option.value);fill(next,found,['label','description','points','contributions']);return next;
 });
 fill(next,proposal,rootFields);
 const presentation={...next.presentation};fill(presentation,proposal?.presentation,['title','summary']);
 if(presentation.title||presentation.summary)next.presentation=presentation as Instrument['presentation'];
 next.options=options(next.options,proposal?.options);
 if(!next.questions.length)next.questions=structuredClone(proposal?.questions||[]);
 else next.questions=next.questions.map(question=>{
  const next={...question},found=proposal?.questions?.find((item:any)=>item.id===question.id);
  fill(next,found,questionFields);
  if(question.options||found?.options?.length&&(!original.options?.length||original.options.some(option=>!option.label?.trim())))next.options=options(question.options||original.options||[],found?.options);
  return next;
 });
 return next;
}

export function testDraftIssues(instrument:Instrument):DraftIssue[]{
 const issues=instrumentProblems(instrument);
 for(const [key,message] of [['purpose','Describe el propósito del instrumento.'],['description','Completa las instrucciones del test.']] as const)
  if(!instrument[key]?.trim()||key==='description'&&importedInstructionPlaceholder(instrument[key]))issues.push({step:0,message});
 if(!instrument.presentation?.title?.trim()||!instrument.presentation?.summary?.trim())issues.push({step:0,message:'Completa el título breve y la introducción.'});
 return issues;
}

export function stableDraft(value:any):string{
 if(Array.isArray(value))return '['+value.map(stableDraft).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+stableDraft(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
