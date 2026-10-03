import type {ReactNode} from 'react';
import {Button} from '../../components/ui/primitives';
import './results-document.css';

/** Shared presentation for school options and university careers. */
export function RecommendationCard({index,title,description,reason,href,onOpen,openLabel,children,className='',titleClassName='rd-career-title'}:{index:number;title:string;description:string;reason:string;href?:string;onOpen:()=>void;openLabel:string;children?:ReactNode;className?:string;titleClassName?:string}){
 return <article className={'rd-career rd-recommended'+(className?' '+className:'')}>
  <span className="rd-eyebrow">OPCIÓN {String(index+1).padStart(2,'0')} PARA EXPLORAR</span>
  <h4>{href?<a className={titleClassName} href={href}>{title}</a>:title}</h4>
  <p>{description}</p>
  <details><summary>Por qué aparece en tus resultados</summary><p>{reason}</p></details>
  {children}
  <div className="rd-follow-actions">
   {href&&<a className="button button--primary button--md" href={href} aria-label={'Autopreparación: '+title}>Autopreparación</a>}
   <Button variant="secondary" onClick={onOpen} aria-label={openLabel+': '+title}>{openLabel}</Button>
  </div>
 </article>;
}
