"use client";
import {useMemo,useState,useRef,useEffect} from 'react';
import type {Instrument} from '../../types';
import {suggestSimulatorCareers} from '../../lib/simulator-careers';
import {schoolTarget} from '../../data/school-training';
import {adminFetch} from '../../lib/admin-session';
import {readApiResponse} from '../../lib/api-response';
import {Button,Notice} from '../../components/ui/primitives';

export function StudyOptionSuggestions({test,careers,onSelect}:{test:Instrument;careers:{id:string;name:string}[];onSelect:(id:string)=>void}){
 const [suggestions,setSuggestions]=useState<string[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const description=useMemo(()=>[test.description,...test.questions.map(q=>[q.text,q.dimension,...(q.options||test.options).map(o=>o.label)].join(' '))].join('\n').slice(0,40000),[test.description,test.questions,test.options]);
 const scopedCareers=useMemo(()=>careers.filter(c=>schoolTarget(c.id)===(test.educationLevel==='bachillerato')),[careers,test.educationLevel]);
 const local=useMemo(()=>suggestSimulatorCareers(test.title+' '+description,scopedCareers),[test.title,description,scopedCareers]);
 const identity=JSON.stringify([test.id,test.educationLevel,test.title,description]);
 const current=useRef(identity);current.current=identity;
 const mounted=useRef(true),requestId=useRef(0);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;requestId.current++;};},[]);
 useEffect(()=>{requestId.current++;setSuggestions([]);setMessage('');setBusy(false);},[identity]);
 const detect=async()=>{
  const request=++requestId.current;
  const isCurrent=()=>mounted.current&&current.current===identity&&requestId.current===request;
  setBusy(true);setMessage('');
  try{
   const data=await readApiResponse(await adminFetch('/api/import-presentation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'study-options',educationLevel:test.educationLevel,title:test.title.slice(0,500),description})},55000));
   if(!isCurrent())return;
   if(!Array.isArray(data.careerIds))throw new Error('El servidor no devolvió opciones de estudio. Actualiza la aplicación y vuelve a intentar.');
   setSuggestions(data.careerIds||[]);setMessage(data.careerIds?.length?'Opciones detectadas. Añade las que correspondan y completa el criterio documentado.':'No se encontraron relaciones suficientemente claras. Puedes seleccionar una opción manualmente.');
  }catch(e){if(isCurrent())setMessage((e as Error).message);}finally{if(isCurrent())setBusy(false);}
 };
 const detected=scopedCareers.filter(c=>[...local,...suggestions].includes(c.id)&&!test.careerLinks?.some(link=>link.careerId===c.id));
 return <div className="stack-sm"><p className="small muted">Detecta opciones relacionadas con el documento dentro de {test.educationLevel==='bachillerato'?'Bachillerato':'Universidad'}. Para recomendar según resultados, completa el rango y la fuente del criterio.</p><Button variant="secondary" loading={busy} disabled={!description.trim()} onClick={()=>void detect()}>Detectar opciones con IA</Button>{message&&<Notice>{message}</Notice>}{!!detected.length&&<div className="stack-sm"><strong>Opciones detectadas en el contenido</strong>{detected.map(c=><div className="row between" key={c.id}><span>{c.name}</span><Button size="sm" variant="secondary" onClick={()=>onSelect(c.id)}>Añadir relación</Button></div>)}</div>}</div>;
}
