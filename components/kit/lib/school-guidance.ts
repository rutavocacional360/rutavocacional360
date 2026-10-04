import { baccalaureateTypes, learningPreferences, scienceOptions, technicalOptions, schoolSources, pathwayVersion, type SchoolProfile, type SchoolOption } from '../data/baccalaureate';
import {schoolSelection} from './school-selection';

export type SchoolRelation = {optionId:string;reason:string;evidence:string[];dimensionId:string;value:number;min:number;max:number};
export function schoolGuidance(scores: {dimension:string;raw:number}[], evidence: string[], profile: SchoolProfile = {}, careers: {id:string;name:string;areaId?:string}[] = [], relations: SchoolRelation[] = []) {
  const names:Record<string,string>={R:'actividades prácticas',I:'investigación',A:'creatividad',S:'ayuda a personas',E:'iniciativa y organización de proyectos',C:'orden y procedimientos'};
  // A broad area such as engineering is not enough to connect a technical figure
  // to a university course. Match its specific subject matter as well.
  const careerPatterns:Record<string,RegExp>={
    informatica:/SOFTWARE|COMPUTACION|INFORMATICA|SISTEMAS DE INFORMACION|TECNOLOGIAS DE LA INFORMACION/,
    contabilidad:/CONTAB|AUDITORIA|FINANZ/,
    'gestion-administrativa':/ADMINISTRACION|GESTION EMPRESARIAL|NEGOCIOS/,
    agropecuaria:/AGRON|AGROPEC|AGROIND|VETERIN|ZOOTEC|AGROECO/,
    automotriz:/AUTOMOT|MECANIC|MECATRON/,
    mecanizado:/MECANIC|INDUSTRIAL|MECATRON|METAL/,
    electricidad:/ELECTRIC|ELECTRON|ENERGIA|ELECTROMECAN/,
    ventas:/MARKETING|MERCAD|COMERCIAL|COMERCIO|NEGOCIOS/,
    hoteleria:/HOTEL|HOSPITALIDAD|TURISM|GASTRONOM/,
    turismo:/TURISM|HOTEL|HOSPITALIDAD/,
    'diseno-multimedia':/DISENO|MULTIMEDIA|ANIMACION|COMUNICACION|ARTES/,
  };
  const valid = scores.length === 6 && new Set(scores.map(s=>s.dimension)).size === 6 && ['R','I','A','S','E','C'].every(d=>scores.some(s=>s.dimension===d&&Number.isFinite(s.raw)&&s.raw>=5&&s.raw<=25));
  const value = (d:string)=>scores.find(s=>s.dimension===d)?.raw || 0;
  const max = valid ? Math.max(...scores.map(s=>s.raw)) : 0;
  const differentiated = valid && max >= 15 && max - Math.min(...scores.map(s=>s.raw)) > 0;
  const ordered = [...scores].sort((a,b)=>b.raw-a.raw);
  const cutoff = Math.max(15,ordered[1]?.raw??max);
  const highlightedDimensions = differentiated ? ordered.filter(s=>s.raw>=cutoff).map(s=>s.dimension) : [];
  const acceptedRelations = relations.filter(r=>Number.isFinite(r.value)&&Number.isFinite(r.min)&&Number.isFinite(r.max)&&r.min<=r.max&&r.value>=r.min&&r.value<=r.max&&['ciencias','tecnico',...scienceOptions.map(o=>o.id),...technicalOptions.map(o=>o.id)].includes(r.optionId));
  const scienceRelations = acceptedRelations.filter(r=>r.optionId==='ciencias'||scienceOptions.some(o=>o.id===r.optionId)),technicalRelations = acceptedRelations.filter(r=>r.optionId==='tecnico'||technicalOptions.some(o=>o.id===r.optionId));
  const preference = profile.learningPreference || 'por-definir';
  let suggested: 'ciencias'|'tecnico'|'ambas'|'pendiente' = 'pendiente';
  let reason = 'Completa y entrega Intereses vocacionales para comparar Ciencias y Técnico. No necesitas haber elegido una modalidad.';
  if (valid) {
    if (differentiated && value('R') >= 15 && value('R') - value('I') >= 4) {
      suggested = 'tecnico'; reason = 'Tu interés en actividades prácticas supera al de investigación en los cuestionarios completos. Explora primero una figura técnica y contrasta esta afinidad con sus asignaturas y proyectos.';
    } else if (differentiated && value('I') >= 15 && value('I') - value('R') >= 4) {
      suggested = 'ciencias'; reason = 'Tu interés en investigar y explicar supera al de actividades prácticas en los cuestionarios completos. Explora primero Ciencias y contrasta esta afinidad con sus asignaturas y actividades.';
    } else {
      suggested = 'ambas'; reason = differentiated ? 'Tus respuestas no dan prioridad general a una modalidad. Compara las áreas y figuras relacionadas con tus intereses destacados.' : 'Tus intereses son similares o no muestran una diferencia suficiente para priorizar una modalidad. Compara Ciencias, Técnico y el catálogo completo mediante sus asignaturas y actividades.';
    }
  }
  if (!differentiated && acceptedRelations.length) {
    suggested = scienceRelations.length&&technicalRelations.length?'ambas':scienceRelations.length?'ciencias':'tecnico';
    reason = 'Tus resultados cumplen los criterios de relación con '+(suggested==='ambas'?'Ciencias y Técnico':suggested==='ciencias'?'Ciencias':'Técnico')+' configurados en tus tests. Revisa la puntuación, el criterio y la actividad de cada opción; estas relaciones orientan la exploración y no certifican aptitud.';
  }
  const linkedCareers = (o: SchoolOption) => careers.filter(c=>c.areaId&&o.areas.includes(c.areaId)&&(!careerPatterns[o.id]||careerPatterns[o.id].test(c.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()))).slice(0,3).map(c=>({id:c.id,name:c.name}));
  const rank = (options: SchoolOption[], limit: number) => {
    const scored = differentiated ? options.map(o=>({...o,score:o.dimensions.reduce((n,d)=>n+value(d),0)/o.dimensions.length,supportDimensions:o.dimensions.filter(d=>highlightedDimensions.includes(d))})).filter(o=>o.supportDimensions.length) : [];
    const best = scored.length?Math.max(...scored.map(o=>o.score)):0;
    const ranked = scored.filter(o=>o.score>=best-2).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'es'));
    const selected = ranked.slice(0,limit).map(o=>({
      ...o, ranking:1+ranked.filter(other=>other.score>o.score+1e-8).length,tied:ranked.some(other=>other.id!==o.id&&Math.abs(other.score-o.score)<1e-8),
      reason:'Se relaciona con tus intereses destacados en '+o.supportDimensions.map(d=>names[d]).join(' y ')+'. Compárala mediante la actividad propuesta.',
      evidence: evidence.filter(e=>o.supportDimensions.some(d=>e.endsWith(':dimension:'+d))),
      careers: linkedCareers(o),criteria:[] as SchoolRelation[],
    }));
    for (const o of options) {
      const matching = acceptedRelations.filter(r=>r.optionId===o.id);
      if (!matching.length) continue;
      const criterionReason = matching.map(r=>r.reason+' Puntuación guardada: '+r.value+'. Criterio del test: '+r.min+' a '+r.max+'.').join(' ');
      const existing = selected.find(candidate=>candidate.id===o.id);
      if (existing) {
        existing.reason += ' '+criterionReason;
        existing.criteria=matching;
        existing.evidence=[...new Set([...existing.evidence,...matching.flatMap(r=>r.evidence)])];
      } else selected.push({...o,score:valid?o.dimensions.reduce((n,d)=>n+value(d),0)/o.dimensions.length:0,supportDimensions:[],ranking:0,tied:false,reason:criterionReason,evidence:[...new Set(matching.flatMap(r=>r.evidence))],careers:linkedCareers(o),criteria:matching});
    }
    // Explicit test criteria lead; alphabetical ties are a display order, not an aptitude ranking.
    return {options:selected.sort((a,b)=>Number(b.criteria.length>0)-Number(a.criteria.length>0)||b.score-a.score||a.name.localeCompare(b.name,'es')).slice(0,limit),total:new Set([...ranked.map(o=>o.id),...selected.map(o=>o.id)]).size};
  };
  const title = suggested === 'ciencias' ? 'Tu perfil muestra afinidad con Bachillerato en Ciencias' : suggested === 'tecnico' ? 'Tu perfil muestra afinidad con Bachillerato Técnico' : suggested === 'ambas' ? 'Explora Ciencias y Técnico: ambas opciones siguen abiertas' : 'Tu orientación de bachillerato está por completar';
  const rankedScience = rank(scienceOptions,4), rankedTechnical = rank(technicalOptions,8);
  const science = rankedScience.options, technical = rankedTechnical.options;
  const rankingNote = differentiated ? 'Las opciones se comparan por los intereses destacados que comparten y el promedio de sus dimensiones, con igual peso. Los empates se muestran en orden alfabético; no indican mayor aptitud.'+(rankedTechnical.total>technical.length?' Se muestran '+technical.length+' de '+rankedTechnical.total+' figuras relacionadas; puedes explorar las demás en el catálogo.':'') : acceptedRelations.length ? 'Las opciones cumplen los criterios definidos por el autor del test. La puntuación y el intervalo guardados sustentan cada relación; no representan una certificación de aptitud.' : valid ? 'No hay áreas ni figuras priorizadas: tus tests completos no permiten diferenciarlas. Puedes comparar ambas modalidades y explorar el catálogo sin repetir los tests.' : 'Se necesita un resultado de intereses o criterios escolares evaluados para priorizar áreas y figuras.';
  return {
    version:pathwayVersion, suggested, title, reason,highlightedDimensions,rankingNote,
    orientationState: differentiated?'differentiated' as const:acceptedRelations.length?'criteria' as const:valid?'open' as const:'pending' as const,
    basis: differentiated?'interest_profile' as const:acceptedRelations.length?'configured_criteria' as const:valid?'no_prioritization' as const:'pending' as const,
    profile: { stage:profile.stage||'Sin registrar', baccalaureate:baccalaureateTypes.find(t=>t.id===profile.baccalaureate)?.name||'Todavía no lo he elegido', specialty:profile.specialty||'', learningPreference:learningPreferences.find(p=>p.id===preference)?.name||'Aún estoy explorando' },
    science, technical, evidence: [...new Set([...(valid?evidence:[]),...acceptedRelations.flatMap(r=>r.evidence)])],
    context: /gradu|universitaria/i.test(profile.stage||'') ? 'Ya estás preparando tu paso a educación superior. Usa tu bachillerato como punto de partida para identificar fortalezas y contenidos por reforzar, sin tener que volver a elegirlo.' : 'Primero compara tu bachillerato y sus áreas; después explora carreras universitarias relacionadas.',
    bridge:'Ciencias y Técnico permiten continuar hacia educación superior. Las conexiones siguientes son ejemplos para explorar, no requisitos de ingreso ni restricciones de carrera.',
    notes:[
      'En Ciencias se muestran áreas de exploración, no carreras ni especializaciones oficiales del título.',
      'En Técnico se muestran las 34 figuras profesionales del catálogo del Acuerdo 2024-00065-A reformado por el Acuerdo 2025-00051-A, cuya implementación es progresiva. Confirma con el colegio el nombre vigente, la oferta, los talleres y los requisitos; el catálogo escolar no acredita disponibilidad de especialidades.',
      'Afinidad describe intereses y preferencias declaradas; no certifica aptitud, rendimiento ni admisión.',
    ],
    nextSteps:[
      'Si todavía no has elegido bachillerato, mantén tu perfil por definir y usa estas recomendaciones para comparar opciones. Si ya lo cursas, puedes registrar tu modalidad actual en el perfil.',
      suggested==='tecnico'?'Compara dos figuras técnicas, visita sus talleres y pregunta por proyectos y prácticas.':suggested==='ciencias'?'Compara las áreas de Ciencias y prueba una actividad de las que más te interesan.':'Compara una experiencia de Ciencias y otra de Técnico; registra qué disfrutas y qué necesitas reforzar.',
      'Revisa tus trabajos y asignaturas con tu orientador o docente para contrastar intereses con habilidades observadas.',
      'Después compara las carreras universitarias relacionadas: malla, modalidad, ubicación y requisitos de admisión.',
    ],
    sources:schoolSources,
  };
}
export type SchoolGuidance = ReturnType<typeof schoolGuidance>;
export function schoolReportSections(p: SchoolGuidance) {
  const selection=schoolSelection(p);
  return [
    {title:'1. Tu perfil de bachillerato',lines:[p.profile.stage,p.profile.baccalaureate,...(p.profile.specialty?[p.profile.specialty]:[]),p.profile.learningPreference,p.context,selection.title,p.reason]},
    ...selection.groups.map((group,index)=>({title:(index+2)+'. '+group.title,lines:group.options.length?group.options.flatMap(o=>[(selection.options.indexOf(o)+1)+'. '+o.name,o.reason,'Asignaturas y contenidos: '+o.subjects,'Actividad: '+o.activity,'Conexión universitaria: '+(o.careers.map(c=>c.name).join(', ')||'Consulta el catálogo y compara programas de esta área.')]):['No se prioriza una opción concreta dentro de esta modalidad. Revisa las asignaturas y actividades con tu orientador.']})),
    {title:(selection.groups.length+2)+'. Del bachillerato a la universidad',lines:[p.bridge,...p.nextSteps,...p.notes,...p.sources.map(s=>s.title+': '+s.url)]},
  ];
}
