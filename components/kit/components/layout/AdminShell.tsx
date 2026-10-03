import {AdminSessionDialog} from './AdminSessionDialog';
import {useState,type ReactNode} from 'react';
import Link from 'next/link';
import {LayoutDashboard,Users,ClipboardList,ChartNoAxesCombined,Settings,Menu,BookOpen,School} from 'lucide-react';
import {useSession} from '../../lib/session';
import {Dialog} from '../ui/Dialog';
import {AccountMenu} from './AccountHeader';
import type {View} from '../../types';
import '../../features/admin/admin-design.css';
import '../../styles/workspace-theme.css';
const entries=[['admin','/admin','Resumen',LayoutDashboard],['usuarios','/admin/usuarios','Usuarios',Users],['escuelas','/admin/escuelas','Escuelas',School],['editor','/admin/evaluaciones','Evaluaciones',ClipboardList],['admin-resultados','/admin/resultados','Resultados e informes',ChartNoAxesCombined],['admin-cursos','/admin/cursos','Cursos',BookOpen],['ajustes','/admin/configuracion','Configuración',Settings]] as const;
export function AdminShell({children,view}:{children:ReactNode;view:View}){const session=useSession(),[open,setOpen]=useState(false);const links=entries.filter(([id])=>session.user?.role==='admin'||['admin','admin-resultados'].includes(id));const navigation=<nav aria-label="Administración">{links.map(([id,url,title,Icon])=><Link href={url} aria-current={view===id?'page':undefined} onClick={()=>setOpen(false)} key={id}><Icon size={19}/>{title}</Link>)}</nav>;
 return <div className="ad-app workspace-unified"><AdminSessionDialog/><aside className="ad-sidebar"><Link className="ad-brand" href="/admin"><img src="/media/brain-book-icon.png" alt=""/><span>Ruta Vocacional <b>360°</b><small>ADMINISTRACIÓN</small></span></Link>{navigation}</aside><div className="ad-workspace"><header className="ad-topbar"><button className="ad-menu" aria-label="Abrir menú administrativo" onClick={()=>setOpen(true)}><Menu size={22}/></button><div><span>PLATAFORMA · ECUADOR</span><strong>{session.values['rv360:admin-settings']?.name||'Ruta Vocacional 360°'}</strong></div><AccountMenu view={view}/></header><main id="contenido" className="ad-content" key={view}>{children}</main></div><Dialog open={open} title="Administración" onClose={()=>setOpen(false)}><div className="ad-mobile-nav">{navigation}</div></Dialog></div>;
}
