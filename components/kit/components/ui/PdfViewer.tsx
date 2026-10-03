"use client";

import {useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy,RenderTask} from 'pdfjs-dist';
import './pdf-viewer.css';

/** Render locally: mobile browsers do not reliably support embedded PDF plugins. */
export function PdfViewer({src,title}:{src?:string;title:string}){
 const host=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const [document,setDocument]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[zoom,setZoom]=useState(1),[width,setWidth]=useState(0),[retry,setRetry]=useState(0),[busy,setBusy]=useState(true),[error,setError]=useState(''),[text,setText]=useState('');
 useEffect(()=>{
  const element=host.current;if(!element)return;
  const observer=new ResizeObserver(([entry])=>setWidth(Math.floor(entry.contentRect.width)));
  observer.observe(element);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  let active=true,task:ReturnType<typeof import('pdfjs-dist')['getDocument']>|undefined;
  setDocument(null);setPage(1);setZoom(1);setBusy(true);setError('');setText('');
  if(src)void import('pdfjs-dist').then(async pdfjs=>{
   if(!active)return;
   // The hosting CDN serves .mjs as text/plain, which module workers reject.
   // Match the installed API version and bypass cached workers from older builds.
   pdfjs.GlobalWorkerOptions.workerSrc=`/vendor/pdfjs-${pdfjs.version}.worker.js`;
   task=pdfjs.getDocument({url:src});
   const doc=await task.promise;if(active)setDocument(doc);
  }).catch(()=>{if(active){setBusy(false);setError('No pudimos cargar el PDF. Puedes reintentarlo o abrir el archivo con el botón del informe.');}});
  return()=>{active=false;void task?.destroy();};
 },[src,retry]);
 useEffect(()=>{
  if(!document||!width)return;
  let active=true,render:RenderTask|undefined;
  setBusy(true);setText('');
  void document.getPage(page).then(async pdfPage=>{
   if(!active||!canvas.current)return;
   const base=pdfPage.getViewport({scale:1}),scale=Math.max(1,width-16)/base.width*zoom;
   const viewport=pdfPage.getViewport({scale}),ratio=Math.min(window.devicePixelRatio||1,2),element=canvas.current;
   element.width=Math.ceil(viewport.width*ratio);element.height=Math.ceil(viewport.height*ratio);
   element.style.width=viewport.width+'px';element.style.height=viewport.height+'px';
   render=pdfPage.render({canvas:element,viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0]});
   await render.promise;if(!active)return;setBusy(false);
   const content=await pdfPage.getTextContent();
   if(active)setText(content.items.map(item=>'str' in item?item.str:'').join(' '));
  }).catch(e=>{if(active&&e?.name!=='RenderingCancelledException'){setBusy(false);setError('No pudimos mostrar esta página. Reintenta cargar el PDF.');}});
  return()=>{active=false;render?.cancel();};
 },[document,page,width,zoom]);
 const changePage=(next:number)=>{setPage(next);host.current?.scrollTo({top:0,left:0});};
 return <section className="pdf-viewer" aria-label={title}>
  <div className="pdf-viewer-toolbar" role="group" aria-label="Controles del PDF">
   <div className="pdf-viewer-pages"><button type="button" aria-label="Página anterior del PDF" disabled={!document||page<=1} onClick={()=>changePage(page-1)}>‹</button><span aria-live="polite">Página {document?page:'—'} de {document?.numPages??'—'}</span><button type="button" aria-label="Página siguiente del PDF" disabled={!document||page>=document.numPages} onClick={()=>changePage(page+1)}>›</button></div>
   <label className="pdf-viewer-zoom">Zoom <select aria-label="Zoom del PDF" value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={1}>Ajustar al ancho</option><option value={1.5}>150 %</option><option value={2}>200 %</option><option value={3}>300 %</option></select></label>
  </div>
  {error?<div className="pdf-viewer-message" role="alert"><p>{error}</p><button type="button" onClick={()=>setRetry(v=>v+1)}>Reintentar PDF</button></div>:busy&&<p className="pdf-viewer-message" role="status">Preparando página…</p>}
  <div ref={host} className="pdf-viewer-viewport" tabIndex={0} aria-label="Página del documento; amplía para leer los detalles" aria-busy={busy}>
   <canvas ref={canvas} style={{visibility:busy||error?'hidden':'visible',display:document&&!error?'block':'none'}} role="img" aria-label={`${title}. Página ${page}`}/>
  </div>
  {text&&!error&&<details className="pdf-viewer-text"><summary>Leer el texto de esta página</summary><p>{text}</p></details>}
 </section>;
}
