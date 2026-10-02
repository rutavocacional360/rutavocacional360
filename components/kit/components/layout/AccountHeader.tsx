import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ChevronDown,LogOut,UserRound,LockKeyhole} from 'lucide-react';
import {Brand} from './Brand';
import {Avatar,Button} from '../ui/primitives';
import {studentNav,adminNav} from '../../data/navigation';
import {routes} from '../../routes';
import {logout,useSession} from '../../lib/session';
import {useToast} from '../ui/Toast';
import type {View} from '../../types';
export function AccountAvatar(){const s=useSession(),photo=s.values['rv360:profile']?.photo;return photo?<img className="account-photo" src={photo} alt=""/>:<Avatar name={s.user?.name||'Mi cuenta'} small/>;}
export function AccountMenu({view}:{view?:View}){
 const s=useSession(),admin=s.user?.role!=='student',toast=useToast(),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);const wrap=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
 const account=admin?'/admin/cuenta':'/mi-ruta/perfil';
 const close=()=>{setOpen(false);trigger.current?.focus();};
 useEffect(()=>{if(!open)return;menu.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();const outside=(e:PointerEvent)=>{if(!wrap.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
 useEffect(()=>setOpen(false),[view]);
 return <div className="account-menu-wrap" ref={wrap}><button ref={trigger} className="account-trigger" aria-label="Abrir menú de cuenta" aria-haspopup="menu" aria-expanded={open} aria-controls="account-menu" onClick={()=>setOpen(!open)}><AccountAvatar/><span>{admin?(s.user?.role==='admin'?'Administrador':'Orientador'):s.user?.name.split(' ')[0]}</span><ChevronDown size={16}/></button>{open&&<div ref={menu} id="account-menu" className="account-menu" role="menu" aria-label="Mi cuenta" onKeyDown={e=>{const items=Array.from(menu.current?.querySelectorAll<HTMLElement>('[role=menuitem]')||[]);const i=items.indexOf(document.activeElement as HTMLElement);if(e.key==='Escape'){e.preventDefault();close();}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}else if(e.key==='Tab'){setOpen(false);}}}><div className="account-identity"><b>{s.user?.name}</b><small>{s.user?.email}</small></div><Link role="menuitem" href={account} onClick={close}><UserRound size={18}/>{admin?'Datos de administrador':'Mi perfil'}</Link><Link role="menuitem" href={account+'?tab=seguridad'} onClick={close}><LockKeyhole size={18}/>Seguridad y contraseña</Link><button role="menuitem" disabled={busy} onClick={async()=>{setBusy(true);try{await logout();window.location.replace(admin?'/admin/login':'/ingresar');}catch(e){toast((e as Error).message, 'danger');setBusy(false);}}}><LogOut size={18}/>{busy?'Cerrando sesión…':'Cerrar sesión'}</button></div>}</div>;
}
export function AccountHeader({view,action}:{view?:View;action?:React.ReactNode}){
 const s=useSession(),admin=s.user?.role!=='student',nav=admin?(s.user?.role==='orientador'?adminNav.filter(n=>['admin','admin-resultados'].includes(n.id)):adminNav):studentNav;
 return <header className="compact-header"><div className="compact-header-inner"><Link href={admin?'/admin':'/mi-ruta'} aria-label="Ruta Vocacional 360°, inicio"><Brand/></Link><nav className="compact-nav" aria-label={admin?'Navegación administrativa':'Navegación principal'}>{nav.map(n=><Link key={n.id} href={routes[n.id]} aria-current={view===n.id?'page':undefined}><n.icon size={18}/>{n.label}</Link>)}</nav><AccountMenu view={view}/></div>{action&&<div className="compact-focus-action">{action}</div>}</header>;
}
