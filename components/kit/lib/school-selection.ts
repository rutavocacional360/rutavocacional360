import type {SchoolGuidance} from './school-guidance';

type PathwaySelection=Pick<SchoolGuidance,'suggested'|'science'|'technical'>;

/** Select the recorded recommendation without changing scores or historical evidence. */
export function schoolSelection(pathway?:PathwaySelection|null,ready=true){
 const modality=ready&&(pathway?.suggested==='ciencias'||pathway?.suggested==='tecnico')?pathway.suggested:null;
 const candidates=modality==='ciencias'?pathway?.science:modality==='tecnico'?pathway?.technical:[];
 const options=(candidates||[]).filter((option,index,all)=>option.id!=='ciencias'&&option.id!=='tecnico'&&all.findIndex(previous=>previous.id===option.id)===index);
 return {
  modality,options,
  title:modality==='ciencias'?'Bachillerato en Ciencias':modality==='tecnico'?'Bachillerato Técnico':'Modalidad por definir',
  optionsTitle:modality==='tecnico'?'Figuras recomendadas':'Áreas recomendadas',
  rankingNote:modality?'Las opciones corresponden a la modalidad recomendada según tus resultados guardados. '+(options.length===1?'Se muestra 1 '+(modality==='tecnico'?'figura':'área'):'Se muestran '+options.length+(modality==='tecnico'?' figuras':' áreas'))+'. Puedes consultar las demás opciones en el catálogo de referencia.':null,
 };
}
