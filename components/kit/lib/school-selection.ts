import type {SchoolGuidance} from './school-guidance';

type PathwaySelection=Pick<SchoolGuidance,'suggested'|'science'|'technical'>;

/** Select the recorded recommendation without changing scores or historical evidence. */
export function schoolSelection(pathway?:PathwaySelection|null,ready=true){
 const modality=ready&&(pathway?.suggested==='ciencias'||pathway?.suggested==='tecnico')?pathway.suggested:null;
 // A tie between modalities does not invalidate the evidence for specific study options.
 const comparison=ready&&pathway?.suggested==='ambas';
 const selectedModalities:('ciencias'|'tecnico')[]=modality?[modality]:comparison?['ciencias','tecnico']:[];
 const groups=selectedModalities.map(selected=>({
  modality:selected,
  title:comparison?(selected==='ciencias'?'Áreas de Ciencias para explorar':'Figuras técnicas para explorar'):(selected==='ciencias'?'Áreas recomendadas':'Figuras recomendadas'),
  options:(selected==='ciencias'?pathway?.science||[]:pathway?.technical||[]).filter((option,index,all)=>option.id!=='ciencias'&&option.id!=='tecnico'&&all.findIndex(previous=>previous.id===option.id)===index),
 }));
 const options=groups.flatMap(group=>group.options);
 return {
  modality,comparison,groups,options,
  title:modality==='ciencias'?'Bachillerato en Ciencias':modality==='tecnico'?'Bachillerato Técnico':comparison?'Explora Ciencias y Técnico':'Modalidad por definir',
  optionsTitle:modality==='tecnico'?'Figuras recomendadas':'Áreas recomendadas',
  rankingNote:modality?'Las opciones corresponden a la modalidad recomendada según tus resultados guardados. '+(options.length===1?'Se muestra 1 '+(modality==='tecnico'?'figura':'área'):'Se muestran '+options.length+(modality==='tecnico'?' figuras':' áreas'))+'. Puedes consultar las demás opciones en el catálogo de referencia.':comparison&&options.length?'Tus resultados no priorizan una sola modalidad. Estas '+options.length+' opciones sí se relacionan con tus intereses o cumplen los criterios de tus tests; compáralas sin interpretar el orden como una mayor aptitud.':null,
 };
}
