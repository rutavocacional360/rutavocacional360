import {QUESTION_TYPES} from './test-engine';
/** Import explicit rules, never manufacture a scoring key from question wording. */
export function importedInstrument(entry:any,base:any,filename:string){
 const metadata=entry.data||{},defaults=metadata.options||[];
 const questions=entry.items.map((q:any,i:number)=>{
  const options=(q.options||defaults).map((o:any,j:number)=>typeof o==='string'?{label:o,value:j+1}:{...o,label:String(o.label||''),value:typeof o.value==='number'?o.value:j+1}).filter((o:any)=>o.label.trim());
  const type=q.type in QUESTION_TYPES?q.type:options.length>=2?'single':'open';
  return {...q,id:q.id||'q'+(i+1),text:String(q.q||q.text||''),dimension:q.dim||q.dimension||'',type,options,section:q.section||'',source:q.source||filename};
 });
 const dimensions=metadata.dimensions||[...new Set<string>(questions.map((q:any)=>q.dimension).filter(Boolean))].map(id=>({id,name:({R:'Realista',I:'Investigador',A:'Artístico',S:'Social',E:'Emprendedor',C:'Convencional'} as Record<string,string>)[id]||id}));
 const scored=questions.filter((q:any)=>q.type!=='info');
 const objective=scored.length&&scored.every((q:any)=>q.correctValues?.length||q.numericKey||q.acceptedTexts?.length);
 const explicitDimensions=scored.length&&scored.every((q:any)=>q.dimension&&q.options?.length>=2);
 const scoring=metadata.scoring|| (objective?'objective':explicitDimensions?'dimensions':'manual');
 for(const q of questions){
  if((q.policy||scoring)!=='dimensions'||!q.dimension||!q.options.length||q.options.some((o:any)=>Object.keys(o.contributions||{}).length))continue;
  const points=q.options.map((o:any)=>o.points??o.value),lower=Math.min(...points),upper=Math.max(...points);
  q.options=q.options.map((o:any)=>({...o,contributions:{[q.dimension]:q.inverse?lower+upper-(o.points??o.value):o.points??o.value}}));
  q.inverse=false;
 }
 const {publishedAt:_publishedAt,publishedBy:_publishedBy,...draftMetadata}=metadata;
 return {...base,...draftMetadata,id:base.id,stableId:undefined,publishedAt:undefined,publishedBy:undefined,status:'Borrador',version:'1',title:metadata.title||entry.name,description:metadata.description||entry.description||base.description,questions,dimensions,scoring,source:filename};
}
