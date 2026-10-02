import { BlurFade } from "@/components/ui/blur-fade";
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Resources } from '../student/Resources';
import type { Navigate } from '../../types';
import { PublicHeader } from '../../components/layout/Shells';
import { Brand } from '../../components/layout/Brand';
import { useSession } from '../../lib/session';
import { useHomeMotion } from './HomeInteractions';

import {StudyExplorer} from './StudyExplorer';
import { HowItWorksSection, ReportPresentationSection } from './JourneySections';
import './home-upgrade.css';
import './aurora-home.css';
import { HeroSection } from './HeroSection';
import { VocationalToolsSection } from './VocationalToolsSection';
import { useHomeVideo } from './useHomeVideo';
import './video-home.css';

export function PublicHome({ navigate }: { navigate: Navigate }) {
  const session = useSession();
  const motionRoot = useHomeMotion();
  const scene = useHomeVideo();
  const student = session.user?.role === 'student';
  return <div className="site-page site-home site-cinematic" id="inicio" ref={motionRoot}>
    <div className="rv-video-backdrop" aria-hidden="true">
      <img src="/media/vocational-background-poster.webp" alt="" width={1280} height={720} fetchPriority="high" />
      <video ref={scene.videoRef} autoPlay muted loop playsInline controls={false} disablePictureInPicture preload="auto" poster="/media/vocational-background-poster.webp" tabIndex={-1} hidden={scene.unavailable} />
      <div className="rv-video-shade" />
    </div>
    <PublicHeader navigate={navigate} cinematic />
    <main id="contenido">
      <HeroSection />
      <HowItWorksSection />
      <VocationalToolsSection student={student} />
      <StudyExplorer/>
      <ReportPresentationSection />
      <section id="instituciones" className="site-institutions"><div className="site-container site-institution-grid" data-reveal><div><p className="site-eyebrow">PARA INSTITUCIONES</p><h2>Una mirada más cercana a cada estudiante.</h2><p>La orientación necesita información y acompañamiento. Un espacio organizado ayuda a comprender el proceso y conversar sobre los siguientes pasos.</p></div><div className="site-institution-features">{[
        ['Evaluaciones organizadas', 'Herramientas y cuestionarios en un mismo espacio.'],
        ['Seguimiento de cada ruta', 'Respuestas y resultados para acompañar la exploración.'],
        ['Decisiones con contexto', 'Recursos y reflexiones que enriquecen la conversación.'],
      ].map(([title, text]) => <div key={title}><Check size={20} /><div><h3>{title}</h3><p>{text}</p></div></div>)}</div></div></section>
      
      <section id="preguntas-frecuentes" className="site-faq site-container"><BlurFade inView><p className="site-eyebrow">RESOLVEMOS TUS DUDAS</p><h2>Antes de dar<br />el siguiente paso.</h2><p>Elegir también es aprender a hacer preguntas.</p></BlurFade><div className="site-faq-items" data-reveal>{[
        ['¿El test me dirá qué carrera debo estudiar?', 'Los resultados ayudan a reconocer intereses y abrir posibilidades. Tu elección se construye con información sobre las carreras, experiencias y acompañamiento.'],
        ['¿Cómo me ayuda a elegir bachillerato?', 'Tu perfil y tus respuestas sugieren qué explorar en Ciencias o Técnico, con actividades, asignaturas y conexiones universitarias. La afinidad no es un certificado de aptitud; contrástala con tu orientador.'],
        ['¿Necesito tener una carrera elegida?', 'No. Puedes explorar distintas posibilidades y comparar lo que vas descubriendo, aunque todavía no tengas una opción en mente.'],
        ['¿Puedo continuar otro día?', 'Puedes avanzar por etapas. El guardado y la consulta desde otros dispositivos requieren una cuenta y el servicio de almacenamiento habilitado.'],
        ['¿A quién está dirigida esta ruta?', 'A estudiantes que eligen su bachillerato, lo están cursando o preparan su paso a la universidad. La orientación conecta Ciencias y Técnico con áreas de estudio y carreras.'],
      ].map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
    </main><PublicFooter />
  </div>;
}

export function PublicFooter() {
  return <footer className="site-footer"><div className="site-container">
    <div className="site-footer-main"><div className="site-footer-identity"><Link href="/" aria-label="Ruta Vocacional 360°, inicio"><Brand inverse /></Link><BlurFade className="rv-footer-intro" inView><p>Un espacio para conocerte, explorar tus posibilidades y construir tu camino académico y profesional.</p><span>Tu decisión. Tu ritmo. Tu camino.</span></BlurFade></div>
      <nav aria-label="Explora el sitio"><h2>Explora</h2><a href="/#como-funciona">Cómo funciona</a><a href="/#estudiantes">Herramientas</a><a href="/#areas">Áreas de estudio</a><a href="/#instituciones">Para instituciones</a></nav>
      <nav aria-label="Recursos y acceso"><h2>Enlaces útiles</h2><a href="/#preguntas-frecuentes">Preguntas frecuentes</a><Link href="/ingresar">Ingresar a mi cuenta</Link><Link href="/recuperar">Recuperar acceso</Link></nav>
    </div>
    <div className="site-footer-bottom"><p>© {new Date().getFullYear()} Ruta Vocacional 360°. Orientación académica y profesional.</p><div className="site-footer-signature"><a className="site-footer-developer" href="https://olbrox-tech.vercel.app/" target="_blank" rel="noopener noreferrer" aria-label="Desarrollo de software por Olbrox Tech (abre una nueva pestaña)"><span>Desarrollo de software</span><img className="site-footer-developer-logo" src="/media/olbrox-tech.png" alt="Olbrox Tech" width={485} height={141} loading="lazy" /></a><a href="/#inicio">Volver arriba ↑</a></div></div>
  </div></footer>;
}

export function PublicResources({ navigate }: { navigate: Navigate }) {
  return <div className="site-page" id="inicio"><PublicHeader navigate={navigate} /><main id="contenido" className="site-container site-library"><Resources /></main><PublicFooter /></div>;
}
