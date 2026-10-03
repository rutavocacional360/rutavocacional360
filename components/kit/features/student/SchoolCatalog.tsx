import {baccalaureateModalities,baccalaureateModalitiesSource,complementaryArtsOffer,scienceOptions,technicalOptions} from '../../data/baccalaureate';
import {technicalCatalogSource} from '../../data/technical-figures';

/** The official catalog is reference material; personal recommendations require completed tests. */
export function SchoolCatalog(){
 const families=[...new Set(technicalOptions.map(option=>option.family||'Otras figuras profesionales'))];
 return <details className="rd-disclosure school-catalog"><summary>Consultar todas las opciones oficiales de Bachillerato</summary>
  <p>Catálogo de referencia de Ecuador. Tus recomendaciones personales aparecen al completar los tests y publicar sus resultados. Confirma con cada colegio qué figuras ofrece y los requisitos de ingreso.</p>
  <section><h3>Modalidades de Bachillerato General</h3>{baccalaureateModalities.map(modality=><div key={modality.id}><h4>{modality.name}</h4><p>{modality.description}</p>{modality.id==='ciencias'&&<><p>Áreas para explorar dentro de Ciencias; no son títulos ni especialidades oficiales:</p><ul>{scienceOptions.map(option=><li key={option.id}>{option.name} · {option.subjects}</li>)}</ul></>}</div>)}<a href={baccalaureateModalitiesSource.url} target="_blank" rel="noreferrer">Consultar modalidades en la fuente ministerial</a></section>
  <section><h3>Bachillerato Técnico: {technicalOptions.length} figuras en {families.length} familias</h3>{families.map(family=><details key={family}><summary>{family}</summary><ul>{technicalOptions.filter(option=>(option.family||'Otras figuras profesionales')===family).map(option=><li key={option.id}>{option.name}</li>)}</ul></details>)}<p><a href={technicalCatalogSource.url} target="_blank" rel="noreferrer">Consultar catálogo técnico oficial</a> · Consulta: {technicalCatalogSource.checkedAt}</p></section>
  <section><h3>{complementaryArtsOffer.name}</h3><p>{complementaryArtsOffer.description}</p><ul>{complementaryArtsOffer.specialties.map(specialty=><li key={specialty}>{specialty}</li>)}</ul><a href={complementaryArtsOffer.source.url} target="_blank" rel="noreferrer">Consultar formación complementaria en Artes</a></section>
 </details>;
}
