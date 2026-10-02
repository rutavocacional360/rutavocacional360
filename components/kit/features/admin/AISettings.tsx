import {useEffect,useState} from 'react';
import {previewAction} from '../../lib/session';
import {Button,Card,Notice} from '../../components/ui/primitives';

export function AISettings(){
 const [status,setStatus]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=async()=>{setError('');try{setStatus(await previewAction('admin/orientation-content'));}catch(e){setError((e as Error).message);}};
 useEffect(()=>{void load();},[]);
 const update=async()=>{if(busy)return;setBusy(true);setError('');setMessage('');try{const result:any=await previewAction('admin/orientation-content',{method:'POST',body:'{}'});setMessage(result.reused?'El contenido de IA está actualizado.':'Contenido de orientación generado y disponible para los informes de estudiantes.');await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <Card className="stack" style={{marginTop:24}}><h2>Inteligencia artificial</h2><p>La IA ayuda a preparar simuladores y explicaciones académicas. Los cursos se habilitan únicamente después de completar los tests y publicar sus resultados.</p>{status?<><p><strong>{status.configured?'Credencial configurada':'Falta configurar la IA'}</strong> · Contenido de orientación: {status.source==='gemini'?'asistido por IA':'local'}</p>{!status.configured&&<Notice tone="warning">Configura GEMINI_API_KEY en el entorno privado del servidor y reinicia la aplicación. No introduzcas claves en formularios públicos.</Notice>}</>:<p role="status">Comprobando el servicio…</p>}{error&&<Notice tone="danger">{error}</Notice>}{message&&<p role="status">{message}</p>}<div className="row"><Button disabled={!status?.configured} loading={busy} onClick={()=>void update()}>Actualizar orientación con IA</Button><Button variant="secondary" disabled={busy} onClick={()=>void load()}>Comprobar estado</Button></div><p className="small muted">Las explicaciones compartidas se generan sin enviar respuestas ni datos personales de estudiantes. El análisis del administrador utiliza conteos agregados.</p></Card>;
}
