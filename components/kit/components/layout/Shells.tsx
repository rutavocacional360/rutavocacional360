import {StudentShell} from './StudentShell';
import {AdminShell} from './AdminShell';
import {AccountHeader} from './AccountHeader';
import { useEffect,useRef,useState,type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft,HelpCircle,LogOut,LogIn,Menu,X,Route,Compass,FileText } from 'lucide-react';
import { Brand } from './Brand';
import { Avatar,Badge,Button,IconButton } from '../ui/primitives';
import { Dialog } from '../ui/Dialog';
import { studentNav,adminNav,views } from '../../data/navigation';
import type { Navigate,View } from '../../types';
import { routes } from '../../routes';
import { flush,logout,useSession } from '../../lib/session';
import { useToast } from '../ui/Toast';

function useMenuFocus(open:boolean,close:()=>void,ref:React.RefObject<HTMLElement|null>){useEffect(()=>{if(!open)return;const prior=document.activeElement as HTMLElement;const node=ref.current;const list=()=>Array.from(node?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select')||[]);list()[0]?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close();}if(event.key==='Tab'){const items=list();const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);prior?.focus();};},[open]);}
export function DemoToolbar(){return null;}
export function PublicHeader({navigate,cinematic=false}:{navigate:Navigate;cinematic?:boolean}){
 const [open,setOpen]=useState(false);const nav=useRef<HTMLElement>(null);useMenuFocus(open,()=>setOpen(false),nav);
 return <header className="site-header"><div className="site-container site-header-inner">
  <Link className="brand-button" href="/" aria-label="Ruta Vocacional 360°, inicio"><Brand inverse={cinematic}/></Link>
  <IconButton label={open?'Cerrar navegación':'Abrir navegación'} className="site-menu-toggle" aria-expanded={open} aria-controls="public-navigation" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</IconButton>
  <nav ref={nav} id="public-navigation" className={'site-navigation '+(open?'is-open':'')} aria-label="Menú público">
   <a href="/#como-funciona" onClick={()=>setOpen(false)}>{cinematic&&<Route size={17} aria-hidden="true"/>}Cómo funciona</a>
   <a href="/#areas" onClick={()=>setOpen(false)}>{cinematic&&<Compass size={17} aria-hidden="true"/>}Áreas de estudio</a><a href="/#tu-informe" onClick={()=>setOpen(false)}>{cinematic&&<FileText size={17} aria-hidden="true"/>}Tu informe</a>
   
   <Link className="site-login" href="/ingresar" onClick={()=>setOpen(false)}>Ingresar<LogIn size={17}/></Link>
   {open&&<Button className="site-menu-close" variant="ghost" onClick={()=>setOpen(false)}>Cerrar menú</Button>}
  </nav>
 </div></header>;
}
export function AppShell({children,view,navigate,admin=false}:{children:ReactNode;view:View;navigate:Navigate;admin?:boolean}){
 if(admin)return <AdminShell view={view}>{children}</AdminShell>;
 return <StudentShell view={view}>{children}</StudentShell>;
}
export function FocusShell({children,title,navigate}:{children:ReactNode;title:string;navigate:Navigate}){const toast=useToast();return <StudentShell view="evaluaciones" focus action={<Button variant="ghost" size="sm" onClick={async()=>{try{await flush();navigate('evaluaciones');}catch(error){toast((error as Error).message, 'danger');}}} icon={<ArrowLeft size={17}/>}>Guardar y salir</Button>}>{children}</StudentShell>;}
