import type {SchoolOption} from './baccalaureate';
// Names and families: MINEDUC-MINEDUC-2024-00065-A, art. 4,
// as replaced by MINEDEC-MINEDEC-2025-00051-A, art. 2 (pages 8–9).
// Persisted ids stay stable when an official name or family changes.
// Interests, exploration activities and subjects below are internal orientation mappings.
const families=[
 {family:'Deportes',dimensions:['R','S'],areas:['salud','educacion'],subjects:'Educación Física, Biología y organización de actividades',names:[['actividad-fisica','Actividad física, deporte y recreación'],['gestion-deportiva','Gestión deportiva y cultural']]},
 {family:'Salud y servicio',dimensions:['S','R'],areas:['salud','educacion','servicios'],subjects:'Biología, comunicación y cuidado de personas',names:[['seguridad-ciudadana','Seguridad ciudadana'],['primera-infancia','Atención a la primera infancia'],['grupos-prioritarios','Asistencia y cuidado a grupos prioritarios']]},
 {family:'Artes',dimensions:['A','S'],areas:['arte','humanidades'],subjects:'Educación Cultural y Artística, expresión y comunicación',names:[['artes-plasticas','Artes plásticas y gestión cultural'],['artes-escenicas','Artes escénicas y gestión cultural'],['musica','Música y gestión cultural']]},
 {family:'Diseño',dimensions:['A','I'],areas:['arte','tecnologia'],subjects:'Composición visual, dibujo y herramientas de diseño',names:[['diseno-modas','Diseño de modas'],['diseno-multimedia','Diseño gráfico y multimedia']]},
 {family:'Administrativa y financiera',dimensions:['C','E'],areas:['negocios'],subjects:'Matemática, organización y Emprendimiento y Gestión',names:[['contabilidad','Gestión financiera y contable'],['gestion-administrativa','Gestión administrativa y logística']]},
 {family:'Agropecuaria',dimensions:['R','I'],areas:['ambiente','ciencias'],subjects:'Biología, Matemática y cuidado ambiental',names:[['hidrobiologicos','Manejo de recursos hidrobiológicos'],['agropecuaria','Producción agropecuaria sostenible']]},
 {family:'Ambiente',dimensions:['I','R'],areas:['ambiente','ciencias'],subjects:'Biología, Química y análisis del entorno',names:[['gestion-ambiental','Gestión ambiental y desarrollo sostenible'],['areas-protegidas','Conservación y manejo de áreas protegidas']]},
 {family:'Construcción sostenible',dimensions:['R','I'],areas:['ingenieria'],subjects:'Matemática, Física, medidas y dibujo técnico',names:[['obra-civil','Construcción de obra civil']]},
 {family:'Industrial',dimensions:['R','I'],areas:['ingenieria','ciencias'],subjects:'Física, Matemática y procesos de producción',names:[['electronica','Electrónica'],['mecatronica','Mecatrónica'],['madera','Fabricación en madera'],['industrial','Electromecánica industrial'],['automotriz','Electromecánica automotriz'],['alimentos','Conservación y procesamiento de alimentos'],['calzado','Producción de calzado'],['mecanizado','Mecánica industrial'],['electricidad','Instalaciones eléctricas y automatización'],['climatizacion','Climatización']]},
 {family:'Tecnologías',dimensions:['I','R'],areas:['tecnologia','ingenieria'],subjects:'Matemática, lógica, tecnología y resolución de problemas',names:[['seguridad-informatica','Seguridad informática'],['redes','Redes y telecomunicaciones'],['datos','Ciencia de datos'],['informatica','Soporte informático'],['software','Desarrollo de software']]},
 {family:'Turismo',dimensions:['S','E'],areas:['servicios','humanidades','negocios'],subjects:'Idiomas, comunicación, cultura y organización',names:[['hoteleria','Hostelería y arte culinario'],['turismo','Gestión turística']]},
];
export const currentTechnicalOptions:SchoolOption[]=families.flatMap(f=>f.names.map(([id,name])=>({id,name,dimensions:f.dimensions,areas:f.areas,subjects:f.subjects,activity:'Conoce un proyecto de '+name.toLowerCase()+', conversa con un docente sobre sus tareas y registra qué disfrutas y qué necesitas reforzar.',family:f.family})));
export const technicalCatalogSource={
 title:'MinEdec · Catálogo de Bachillerato Técnico, reforma 2025-00051-A',
 url:'https://educacion.gob.ec/wp-content/uploads/downloads/2025/10/MINEDEC-MINEDEC-2025-00051-A.pdf',
 checkedAt:'2026-10-02',version:'MINEDEC-MINEDEC-2025-00051-A-art2',
 figureCount:34,familyCount:11,areaCount:3,
 scope:'34 figuras profesionales, 11 familias y 3 áreas. Implementación progresiva desde Sierra–Amazonía 2025–2026 y Costa–Galápagos 2026–2027. Confirma la oferta y los requisitos con cada colegio.',
};
