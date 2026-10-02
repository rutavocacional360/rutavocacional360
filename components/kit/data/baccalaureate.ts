import {currentTechnicalOptions,technicalCatalogSource} from './technical-figures';
import {textProblem} from '../../../lib/validation';
export const pathwayVersion = 'bachillerato-universidad-3';
export const educationStages = ['Estoy en 10.º de EGB y pasaré a 1.º de BGU', 'Estudiante de EGB Superior (8.º o 9.º)', 'Estoy eligiendo mi bachillerato', 'Estudiante de bachillerato', 'Me gradué del colegio', 'Busco mi primera carrera universitaria'];
export const isChoosingBaccalaureate=(stage='')=>/EGB|eligiendo mi bachillerato/i.test(stage);
export const baccalaureateTypes = [
  { id: 'por-definir', name: 'Todavía no lo he elegido' },
  { id: 'ciencias', name: 'Bachillerato en Ciencias' },
  { id: 'tecnico', name: 'Bachillerato Técnico' },
  { id: 'otro', name: 'Otra formación o título anterior' },
];
export const learningPreferences = [
  { id: 'por-definir', name: 'Aún estoy explorando' },
  { id: 'investigar', name: 'Profundizar en asignaturas, investigar y argumentar' },
  { id: 'aplicar', name: 'Aprender un oficio o especialidad mediante proyectos y práctica' },
  { id: 'ambas', name: 'Me interesan ambas formas de aprendizaje' },
];
export type SchoolProfile = { baccalaureate?: string; specialty?: string; learningPreference?: string; stage?: string };
export type SchoolOption = { family?:string; id: string; name: string; dimensions: string[]; areas: string[]; subjects: string; activity: string };
// Thematic exploration within Ciencias, not official degrees or specializations.
export const scienceOptions: SchoolOption[] = [
  { id: 'ciencias-naturales', name: 'Ciencias naturales y salud', dimensions: ['I','S'], areas: ['ciencias','salud','ambiente'], subjects: 'Biología, Química y Matemática', activity: 'Investiga una pregunta sobre salud o ambiente y explica tus hallazgos con fuentes.' },
  { id: 'ciencias-exactas', name: 'Ciencias exactas y tecnología', dimensions: ['I','R'], areas: ['ciencias','tecnologia','ingenieria'], subjects: 'Matemática, Física e Informática', activity: 'Resuelve un problema de física o programa un modelo sencillo y explica cómo funciona.' },
  { id: 'ciencias-sociales', name: 'Ciencias sociales y humanidades', dimensions: ['S','A'], areas: ['humanidades','educacion'], subjects: 'Historia, Lengua y Literatura, Filosofía', activity: 'Investiga un problema de tu comunidad y presenta dos perspectivas con argumentos.' },
  { id: 'ciencias-economia', name: 'Economía y organización', dimensions: ['E','C'], areas: ['negocios','servicios'], subjects: 'Matemática, Emprendimiento y Gestión, Lengua', activity: 'Compara dos propuestas de emprendimiento: propósito, presupuesto y necesidades de las personas.' },
];
// Representative figures documented by MinEdec, not a complete list or school-level availability.
export const legacyTechnicalOptions: SchoolOption[] = [
  { id: 'diseno-multimedia', name: 'Diseño gráfico y multimedia', dimensions: ['A','I'], areas: ['arte','tecnologia'], subjects: 'Composición visual, ilustración y herramientas digitales', activity: 'Diseña una pieza visual para comunicar una idea y pide opiniones sobre su claridad.' },
  { id: 'informatica', name: 'Informática', dimensions: ['I','R'], areas: ['tecnologia','ingenieria'], subjects: 'Matemática, lógica y proyectos informáticos', activity: 'Crea una página sencilla o diagnostica un problema informático con supervisión.' },
  { id: 'contabilidad', name: 'Contabilidad', dimensions: ['C','E'], areas: ['negocios'], subjects: 'Matemática, registro contable y organización', activity: 'Organiza los ingresos y gastos de un proyecto y explica su balance.' },
  { id: 'gestion-administrativa', name: 'Gestión administrativa', dimensions: ['C','E'], areas: ['negocios'], subjects: 'Organización, comunicación y herramientas de oficina', activity: 'Organiza un evento escolar con agenda, presupuesto y responsabilidades.' },
  { id: 'agropecuaria', name: 'Producción agropecuaria', dimensions: ['R','I'], areas: ['ambiente','ciencias'], subjects: 'Biología, producción y cuidado ambiental', activity: 'Observa un cultivo y registra sus condiciones de crecimiento.' },
  { id: 'automotriz', name: 'Electromecánica automotriz', dimensions: ['R','I'], areas: ['ingenieria'], subjects: 'Física, Matemática y sistemas mecánicos', activity: 'Visita un taller acompañado y compara las tareas de diagnóstico y mantenimiento.' },
  { id: 'mecanizado', name: 'Mecanizado y construcciones metálicas', dimensions: ['R','I'], areas: ['ingenieria'], subjects: 'Dibujo técnico, medidas y procesos de fabricación', activity: 'Diseña en papel una pieza con medidas y consulta cómo se fabrica de forma segura.' },
  { id: 'electricidad', name: 'Instalaciones, equipos y máquinas eléctricas', dimensions: ['R','I'], areas: ['ingenieria'], subjects: 'Física, Matemática y circuitos', activity: 'Explora un circuito en un simulador y explica la función de sus componentes.' },
  { id: 'ventas', name: 'Comercialización y ventas', dimensions: ['E','S'], areas: ['negocios','servicios'], subjects: 'Comunicación, Matemática y atención a clientes', activity: 'Prepara una propuesta de producto e investiga las necesidades de sus posibles usuarios.' },
  { id: 'hoteleria', name: 'Servicios hoteleros', dimensions: ['S','E'], areas: ['servicios','negocios'], subjects: 'Idiomas, organización y atención a personas', activity: 'Diseña la experiencia de bienvenida y atención para un visitante.' },
  { id: 'turismo', name: 'Ventas e información turística', dimensions: ['S','E','A'], areas: ['servicios','humanidades'], subjects: 'Idiomas, cultura y comunicación', activity: 'Prepara una ruta cultural local y presenta su historia a otra persona.' },
];
export const technicalOptions = currentTechnicalOptions;
export const schoolSources = [
  technicalCatalogSource,
  {title:'MinEduc · Orientación vocacional en 8.º, 9.º y 10.º de EGB',url:'https://recursos.educacion.gob.ec/red/lineamientos-para-el-periodo-pedagogico-de-orientacion-vocacional-y-profesional/'},
  { title: 'MinEdec · Currículo de Diseño gráfico y multimedia, 2025', url: 'https://educacion.gob.ec/wp-content/uploads/downloads/2025/10/curriculo-FIP-dmu.pdf' },
  { title: 'MinEduc · Oferta formativa de Bachillerato', url: 'https://educacion.gob.ec/wp-content/uploads/downloads/2021/08/Oferta-Formativa-Bachillerato-2021.pdf' },
  { title: 'MinEdec · Figuras profesionales reportadas por el Distrito 13D03, 2025–2026', url: 'https://educacion.gob.ec/wp-content/uploads/downloads/2026/03/13D03.pdf' },
];
export function schoolProfile(body: SchoolProfile): Required<SchoolProfile> {
  const baccalaureate = body.baccalaureate ?? 'por-definir';
  const learningPreference = body.learningPreference ?? 'por-definir';
  if (!baccalaureateTypes.some(x => x.id === baccalaureate) || !learningPreferences.some(x => x.id === learningPreference)) throw Error('Revisa el tipo de bachillerato y tu preferencia de aprendizaje.');
  if (body.specialty !== undefined && typeof body.specialty !== 'string') throw Error('Revisa la especialidad de bachillerato.');
  if (body.specialty !== undefined && textProblem(body.specialty,140)) throw Error('Revisa la especialidad de bachillerato.');
  if (body.stage !== undefined && textProblem(body.stage,100)) throw Error('Revisa tu etapa educativa.');
  const specialty = body.specialty?.trim() || '';
  if (specialty.length > 140) throw Error('La especialidad no puede superar 140 caracteres.');
  if (body.stage !== undefined && (typeof body.stage !== 'string' || body.stage.length > 100)) throw Error('Revisa tu etapa educativa.');
  return { baccalaureate, learningPreference, specialty: ['tecnico','otro'].includes(baccalaureate) ? specialty : '', stage: body.stage || '' };
}
