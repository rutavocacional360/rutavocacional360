import {Button} from '../../components/ui/primitives';
import './results-document.css';

function preview(text:string){
 const value=(text||'').replace(/\s+/g,' ').trim();
 if(value.length<=180)return value;
 const end=value.lastIndexOf(' ',177);
 return value.slice(0,end>100?end:177)+'…';
}

/** Shared presentation for school options and university careers. */
export function RecommendationCard({index,title,description,href,onOpen,openLabel,className='',titleClassName='rd-career-title'}:{index:number;title:string;description:string;href?:string;onOpen:()=>void;openLabel:string;className?:string;titleClassName?:string}){
 return <article className={'rd-career rd-recommended'+(className?' '+className:'')}>
  <header className="rd-option-heading"><span className="rd-option-number" aria-label={'Opción '+(index+1)}>{index+1}</span><h4>{href?<a className={titleClassName} href={href}>{title}</a>:title}</h4></header>
  <p className="rd-option-description">{preview(description)}</p>
  <div className="rd-follow-actions">
   {href&&<a className="button button--primary button--md" href={href} aria-label={'Autopreparación: '+title}>Autopreparación</a>}
   <Button variant="secondary" onClick={onOpen} aria-label={openLabel+': '+title}>{openLabel}</Button>
  </div>
 </article>;
}
