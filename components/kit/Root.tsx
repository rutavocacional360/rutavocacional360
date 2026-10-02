'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePathname,useRouter,useSearchParams } from 'next/navigation';
import { Suspense } from 'react';


import { Check,CloudUpload,RefreshCw,ShieldCheck } from 'lucide-react';
import App from './App';
import { ToastProvider } from './components/ui/Toast';
import { Button,Card,PasswordInput,Notice } from './components/ui/primitives';
import { passwordProblem } from '@/lib/validation';
import { Brand } from './components/layout/Brand';
import { previewAction,clearNotice,flush,refreshSession,retrySaves,useSession,setPreviewContext } from './lib/session';
import { routes,publicViews } from './routes';
import type { View } from './types';
export function KitRoot({publicHome=false}:{publicHome?:boolean}){
 // The static public home must not wait for a streamed client reveal to be visible.
 const content=<ToastProvider><ConnectedApp /></ToastProvider>;
 return publicHome?content:<Suspense fallback={<Loading />}>{content}</Suspense>;
}
function Loading(){return <main className="loading-screen"><Brand /><p>Preparando tu espacio…</p></main>;}
function ConnectedApp(){
 const path=usePathname().replace(/\/$/,'')||'/',router=useRouter(),session=useSession();const view=(Object.entries(routes).find(([,url])=>url===path)?.[0]||'inicio') as View;const protectedView=!publicViews.includes(view)&&view!=='catalogo';const admin=path.startsWith('/admin')&&view!=='admin-ingresar';
 useEffect(()=>{void flush().then(()=>refreshSession()).catch(()=>{});},[path]);


 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(session.pending||session.error){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[session.pending,session.error]);
 const navigate=useCallback((next:View)=>{router.push(routes[next]);},[router]);
 useEffect(()=>{const refresh=()=>void refreshSession();const changed=(event:StorageEvent)=>{if(event.key?.startsWith('rv360:'))refresh();};const visible=()=>{if(document.visibilityState==='visible')refresh();};window.addEventListener('pageshow',refresh);window.addEventListener('focus',refresh);window.addEventListener('storage',changed);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener('pageshow',refresh);window.removeEventListener('focus',refresh);window.removeEventListener('storage',changed);document.removeEventListener('visibilitychange',visible);};},[]);
 useEffect(()=>{if(session.ready&&protectedView&&(!session.user||(admin?session.user.role!=='admin':session.user.role==='admin')))router.replace(admin?'/admin/login':'/ingresar');},[session.ready,session.user,protectedView,admin,router]);
 if(path==='/restablecer')return <ResetPassword />;
 if((!session.ready||!session.user||(admin?session.user.role!=='admin':session.user.role==='admin'))&&protectedView)return <Loading />;
 return <><App key={session.user?.id||'public'} view={view} navigate={navigate} />{session.user&&protectedView&&(session.error||session.pending>0)&&<div className={`sync-status ${session.error?'sync-error':''}`} role="status">{session.error?<><span>{session.error}</span><Button size="sm" variant="secondary" onClick={()=>void retrySaves()} icon={<RefreshCw size={14}/>}>Reintentar</Button></>:session.pending?<><CloudUpload size={15}/>Guardando borrador…</>:<><Check size={15}/>Cambios guardados</>}</div>}{session.error&&!protectedView&&<div className="public-notice"><Notice tone="warning">{session.error} <button className="text-link" onClick={clearNotice}>Cerrar</button></Notice></div>}</>;
}
function ResetPassword(){const params=useSearchParams(),router=useRouter();const[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[loginPath,setLoginPath]=useState('/ingresar');return <main className="reset-page"><Brand/><Card className="stack"><span className="icon-tile"><ShieldCheck/></span><h1>Una nueva contraseña</h1>{done?<><Notice tone="success">Tu contraseña se actualizó. Ya puedes iniciar sesión.</Notice><Button onClick={()=>router.push(loginPath)}>Ingresar</Button></>:<form className="stack" onSubmit={async e=>{e.preventDefault();if(busy)return;if(passwordProblem(password)){setError(passwordProblem(password));return;}if(password!==confirm){setError('Las contraseñas no coinciden.');return;}setBusy(true);setError('');try{const result=await previewAction('auth/reset-confirm',{method:'POST',body:JSON.stringify({token:params.get('token'),password})});setLoginPath(result.loginPath||'/ingresar');setDone(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><PasswordInput hint="Usa entre 15 y 128 caracteres. Puedes utilizar una frase larga." label="Nueva contraseña" minLength={15} maxLength={128} validate={passwordProblem} autoComplete="new-password" required value={password} onChange={e=>{setPassword(e.target.value);setError('');}}/><PasswordInput label="Repite la contraseña" minLength={15} maxLength={128} validate={passwordProblem} autoComplete="new-password" required value={confirm} onChange={e=>{setConfirm(e.target.value);setError('');}}/>{error&&<Notice tone="danger">{error}</Notice>}<Button type="submit" loading={busy}>Guardar contraseña</Button></form>}</Card></main>;}
