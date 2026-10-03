import { baccalaureateTypes, learningPreferences, scienceOptions, technicalOptions, schoolSources, pathwayVersion, type SchoolProfile, type SchoolOption } from '../data/baccalaureate';

export function schoolGuidance(scores: {dimension:string;raw:number}[], evidence: string[], profile: SchoolProfile = {}, careers: {id:string;name:string;areaId?:string}[] = []) {
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
  const preference = profile.learningPreference || 'por-definir';
  let suggested: 'ciencias'|'tecnico'|'ambas'|'pendiente' = 'pendiente';
  let reason = 'Completa y entrega Intereses vocacionales para comparar Ciencias y Técnico. No necesitas haber elegido una modalidad.';
  if (valid) {
    if (differentiated && value('R') >= 15 && value('R') - value('I') >= 4) {
      suggested = 'tecnico'; reason = 'Tu interés en actividades prácticas supera al de investigación en este cuestionario. Esto invita a explorar primero una especialidad técnica; completa tu perfil para contrastarlo.';
    } else if (differentiated && value('I') >= 15 && value('I') - value('R') >= 4) {
      suggested = 'ciencias'; reason = 'Tu interés en investigar y explicar supera al de actividades prácticas en este cuestionario. Esto invita a explorar primero Ciencias; completa tu perfil para contrastarlo.';
    } else {
      suggested = 'ambas'; reason = 'Tus respuestas no permiten dar prioridad a una modalidad. Ambas siguen abiertas; compara sus asignaturas y actividades.';
    }
  }
  const rank = (options: SchoolOption[]) => {
    if (!differentiated) return [];
    const scored = options.map(o=>({...o, score:o.dimensions.reduce((n,d)=>n+value(d),0)/o.dimensions.length}));
    const best = Math.max(...scored.map(o=>o.score));
    return scored.filter(o=>o.score>=15&&o.score>=best-2).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'es')).map(o=>({
      ...o, reason:'Se relaciona con tus intereses en '+o.dimensions.map(d=>names[d]).join(' y ')+'. Compárala mediante la actividad propuesta.',
      evidence: evidence.filter(e=>o.dimensions.some(d=>e.endsWith(':dimension:'+d))),
      careers: careers.filter(c=>c.areaId&&o.areas.includes(c.areaId)&&(!careerPatterns[o.id]||careerPatterns[o.id].test(c.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()))).slice(0,3).map(c=>({id:c.id,name:c.name})),
    }));
  };
  const title = suggested === 'ciencias' ? 'Tu perfil muestra afinidad con Bachillerato en Ciencias' : suggested === 'tecnico' ? 'Tu perfil muestra afinidad con Bachillerato Técnico' : suggested === 'ambas' ? 'Explora Ciencias y Técnico: ambas opciones siguen abiertas' : 'Tu orientación de bachillerato está por completar';
  const science = rank(scienceOptions), technical = rank(technicalOptions);
  return {
    version:pathwayVersion, suggested, title, reason,
    profile: { stage:profile.stage||'Sin registrar', baccalaureate:baccalaureateTypes.find(t=>t.id===profile.baccalaureate)?.name||'Todavía no lo he elegido', specialty:profile.specialty||'', learningPreference:learningPreferences.find(p=>p.id===preference)?.name||'Aún estoy explorando' },
    science, technical, evidence: valid ? [...evidence, ...(preference!=='por-definir'?['perfil:learningPreference']:[])] : [],
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
  return [
    {title:'1. Tu perfil de bachillerato',lines:[p.profile.stage,p.profile.baccalaureate,...(p.profile.specialty?[p.profile.specialty]:[]),p.profile.learningPreference,p.context,p.title,p.reason]},
    ...([{title:'2. Ciencias: áreas para explorar',options:p.science},{title:'2. Técnico: figuras profesionales para explorar',options:p.technical}]).map(({title,options})=>({title,lines:options.length?options.flatMap(o=>[o.name,o.reason,'Asignaturas y contenidos: '+o.subjects,'Actividad: '+o.activity,'Conexión universitaria: '+(o.careers.map(c=>c.name).join(', ')||'Consulta el catálogo y compara programas de esta área.')]):['Sin áreas priorizadas todavía. Completa tus intereses y compara ambas modalidades.']})),
    {title:'3. Del bachillerato a la universidad',lines:[p.bridge,...p.nextSteps,...p.notes,...p.sources.map(s=>s.title+': '+s.url)]},
  ];
}
