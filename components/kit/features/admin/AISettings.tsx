import {useEffect,useState} from 'react';
import {previewAction} from '../../lib/session';
import {Button,Card,Notice} from '../../components/ui/primitives';

export function AISettings(){
 const [status,setStatus]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=async()=>{setError('');try{setStatus(await previewAction('admin/orientation-content'));}catch(e){setError((e as Error).message);}};
 useEffect(()=>{void load();},[]);
 const update=async()=>{if(busy)return;setBusy(true);setError('');setMessage('');try{const result:any=await previewAction('admin/orientation-content',{method:'POST',body:'{}'});setMessage(result.reused?'Las explicaciones académicas de IA están actualizadas.':'Explicaciones académicas generadas y disponibles. El análisis personal se realiza cuando el estudiante completa los tests de su ruta.');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const analysis=status?.studentAnalysis;
 return <Card className="stack" style={{marginTop:24}}>
  <h2>Inteligencia artificial</h2>
  <p>La IA analiza los resultados agregados de los tests de cada ruta para explicar la afinidad con opciones de Bachillerato o carreras de Universidad. El análisis conserva la evidencia de los tests y las opciones del catálogo.</p>
  {status?<>
   <p><strong>{status.configured?'Credencial configurada':'Falta configurar la IA'}</strong> · Explicaciones académicas: {status.source==='gemini'?'generadas con IA':'locales'}</p>
   {!status.configured&&<Notice tone="warning">Configura GEMINI_API_KEY en el entorno privado del servidor y reinicia la aplicación. No introduzcas claves en formularios públicos.</Notice>}
   {analysis&&<>
    <p><strong>Análisis de resultados:</strong> {!analysis.configured?'pendiente de configuración':analysis.error?'el proveedor necesita revisión':analysis.lastSuccessAt?'última respuesta de IA validada: '+new Date(analysis.lastSuccessAt).toLocaleString('es-EC'):'listo para analizar una ruta completada'}.</p>
    {analysis.error&&<Notice tone="warning">{analysis.error.message}</Notice>}
   </>}
  </>:<p role="status">Comprobando el servicio…</p>}
  {error&&<Notice tone="danger">{error}</Notice>}{message&&<p role="status">{message}</p>}
  <div className="row"><Button disabled={!status?.configured} loading={busy} onClick={()=>void update()}>Actualizar explicaciones con IA</Button></div>
  <p className="small muted">El análisis personal envía códigos y puntuaciones agregadas, etapa y candidatos de la ruta. Los nombres, correos y respuestas personales permanecen en el servidor. Los cursos se habilitan al completar los tests y publicar sus resultados.</p>
 </Card>;
}
