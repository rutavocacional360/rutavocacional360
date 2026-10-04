import {useState,useRef,useEffect} from 'react';
import type {Instrument} from '../../types';
import {prepareImportedPresentation} from '../../lib/import-presentation';
import {Button,Field,TextareaField,Notice} from '../ui/primitives';
export function PresentationEditor({instrument,onChange,onBusyChange,allowGenerate=true}:{instrument:Instrument;onChange:(presentation:NonNullable<Instrument['presentation']>)=>void;onBusyChange?:(busy:boolean)=>void;allowGenerate?:boolean}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const value=instrument.presentation||{title:'',summary:''};
 const identity=JSON.stringify([instrument.id,instrument.version,instrument.educationLevel,instrument.title,instrument.description,instrument.presentation]);
 const current=useRef(identity),latestChange=useRef(onChange),mounted=useRef(true),requestId=useRef(0);
 current.current=identity;latestChange.current=onChange;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;requestId.current++;};},[]);
 useEffect(()=>{requestId.current++;setMessage('');setBusy(false);},[identity]);
 useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
 const prepare=async()=>{
  const request=++requestId.current,isCurrent=()=>mounted.current&&current.current===identity&&requestId.current===request;
  setBusy(true);setMessage('');
  try{
   const result=await prepareImportedPresentation({tests:[{...instrument}],warnings:[]},true);
   if(!isCurrent())return;
   if(result.tests[0].presentation)latestChange.current(result.tests[0].presentation);
   setMessage(result.warnings.join(' ')||'Puedes editar estos campos directamente.');
  }catch{if(isCurrent())setMessage('No se pudo generar el resumen. Puedes editar estos campos directamente.');}
  finally{if(isCurrent())setBusy(false);}
 };
 return <div className="stack-sm"><h3>Presentación para estudiantes</h3><p className="small muted">{allowGenerate?'La IA prepara el título y la introducción a partir del contenido. Revisa y edita la propuesta antes de publicar.':'Título e introducción que verá el estudiante. Puedes editarlos aquí o completarlos con el botón «Completar test con IA».'}</p><Field label="Título breve para estudiantes" maxLength={100} value={value.title} onChange={e=>onChange({...value,title:e.target.value})}/><TextareaField label="Introducción breve para estudiantes" maxLength={280} value={value.summary} onChange={e=>onChange({...value,summary:e.target.value})}/>{allowGenerate&&<Button variant="secondary" loading={busy} disabled={!instrument.title.trim()} onClick={()=>void prepare()}>Preparar introducción con IA</Button>}{message&&<Notice>{message}</Notice>}</div>;
}
