"use client";
import { useSyncExternalStore } from 'react';
import {readApiResponse} from './api-response';
import { configureInstruments } from '../data/instruments';
import { configureCatalog } from './catalog';
export type SessionUser={id:string;name:string;email:string;role:'student'|'orientador'|'admin';institutionId:string|null;group:string};
type Snapshot={ready:boolean;user:SessionUser|null;values:Record<string,any>;revisions:Record<string,number>;pending:number;error:string;mailConfigured:boolean;serviceAvailable?:boolean};
let state:Snapshot={ready:false,user:null,values:{},revisions:{},pending:0,error:'',mailConfigured:false};
let mutation=0;
let refreshSequence=0;
const serverState=state,listeners=new Set<()=>void>();
const update=(patch:Partial<Snapshot>)=>{state={...state,...patch};listeners.forEach(fn=>fn());};
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export function useSession(){return useSyncExternalStore(subscribe,()=>state,()=>serverState);}
export function getSession(){return state;}
async function request(path:string,options:RequestInit={}){const response=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json',...options.headers},cache:'no-store'});return readApiResponse(response);}
export async function refreshSession(){
 const generation=mutation,sequence=++refreshSequence;
 const stale=()=>generation!==mutation||sequence!==refreshSequence||state.pending>0;
 try{
  const data=await request('session');
  if(stale())return;
  configureCatalog(data.values['rv360:published-content']||[]);
  configureInstruments(data.values['rv360:battery']?.instruments.filter((t:any)=>['intereses','valores','autoconocimiento'].includes(t.id)));
  update({...data,ready:true,error:failed.size?state.error:'',serviceAvailable:data.serviceAvailable!==false});
 }catch(e){if(!stale())update({ready:true,error:(e as Error).message});}
}
export function setPreviewContext(_admin:boolean){}
let queue=Promise.resolve();const failed=new Map<string,unknown>();
export async function saveValue(key:string,value:unknown){if(!state.user)throw new Error('Inicia sesión para guardar tus cambios.');mutation++;update({values:{...state.values,[key]:value},pending:state.pending+1});const task=queue.then(async()=>{try{const result=await request('state',{method:'PUT',body:JSON.stringify({key,value,revision:state.revisions[key]||0})});failed.delete(key);update({revisions:{...state.revisions,[key]:result.revision},error:failed.size?state.error:''});}catch(e){failed.set(key,value);update({error:(e as Error).message});throw e;}finally{update({pending:state.pending-1});}});queue=task.catch(()=>{});return task;}
export async function flush(){await queue;if(state.error||failed.size)throw new Error(state.error||'Hay cambios pendientes de guardar.');}
export async function retrySaves(){for(const [key,value] of failed)try{await saveValue(key,value);}catch{}}
export function clearNotice(){update({error:''});}
export async function logout(){await flush();await request('auth/logout',{method:'POST',body:'{}'});mutation++;refreshSequence++;failed.clear();configureCatalog([]);configureInstruments();for(const key of Object.keys(sessionStorage))if(key.startsWith('rv360:'))sessionStorage.removeItem(key);for(const key of Object.keys(localStorage))if(key.startsWith('rv360:'))localStorage.removeItem(key);update({...serverState,ready:true});}
export async function previewAction<T=any>(path:string,options:RequestInit={}):Promise<T>{await flush();const data=await request(path,options);if(options.method&&options.method!=='GET'&&!path.includes('password-reset')&&!path.includes('reset-confirm'))await refreshSession();return data;}
