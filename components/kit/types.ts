import type { LucideIcon } from "lucide-react";
export type Tone = "primary" | "success" | "warning" | "danger" | "neutral";
export type View =
  | "cursos"
  | "admin-cursos"
  | "admin-cuenta"
  | "admin-resultados"
  | "custom-test"
  | "reflexiones"
  | "catalogo"
  | "inicio"
  | "biblioteca"
  | "ingresar"
  | "registro"
  | "recuperar"
  | "admin-ingresar"
  | "mi-ruta"
  | "evaluaciones"
  | "intereses"
  | "valores"
  | "autoconocimiento"
  | "laboratorio"
  | "resultados"
  | "carreras"
  | "mi-plan"
  | "recursos"
  | "emprendimiento"
  | "mi-perfil"
  | "admin"
  | "usuarios"
  | "escuelas"
  | "grupos"
  | "editor"
  | "contenidos"
  | "reportes"
  | "ajustes";
export interface NavItem {
  id: View;
  label: string;
  icon: LucideIcon;
}
export interface Option {
  id?: string;
  points?: number;
  contributions?: Record<string,number>;
  value: number;
  label: string;
  description?: string;
}
export interface Question {
  section?: string;
  help?: string;
  minSelections?: number;
  maxSelections?: number;
  exclusiveValue?: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  maxLength?: number;
  minLength?: number;
  visibleWhen?: {questionId:string;operator:'equals'|'notEquals'|'includes';value:number|string};
  policy?: 'none'|'total'|'dimensions'|'objective'|'rubric';
  rubric?: {id:string;label:string;levels:{id:string;label:string;points:number}[]}[];
  rows?: {id:string;label:string}[];
  matrixMultiple?: boolean;
  rankingPoints?: number[];
  acceptedTexts?: string[];
  normalizeText?: boolean;
  numericKey?: {min:number;max:number};
  partialCredit?: boolean;
  incorrectPenalty?: number;
  required?: boolean;
  image?: string;
  imageAlt?: string;
  explanation?: string;
  correctValues?: number[];
  type?: 'single'|'multiple'|'likert'|'open'|'short'|'number'|'yesno'|'matrix'|'ranking'|'info';
  inverse?: boolean;
  weight?: number;
  source?: string;
  id: string;
  text: string;
  dimension?: string;
  options?: Option[];
}
export interface Instrument {
  educationLevel?: 'bachillerato'|'universidad'|'ambos';
  presentation?: {title:string;summary:string};
  audience?: 'all'|'selected';
  careerLinks?: {id:string;dimensionId:string;careerId:string;min:number;max:number;reason:string;source:string;careerName?:string;sourceUrl?:string;offers?:{institution:string;title:string;location:string;modality:string}[]}[];
  schemaVersion?: number;
  purpose?: string;
  source?: string;
  stableId?: string;
  dimensions?: {id:string;name:string}[];
  normalize?: boolean;
  minimumCoverage?: number;
  studentIds?: string[];
  durationMinutes?: number;
  releaseAt?: string;
  due?: string;
  battery?: string;
  availableFrom?: string;
  estimatedMinutes?: number;
  resultPublication?: 'immediate'|'review'|'date';
  aggregation?: 'mean'|'sum';
  ranges?: {dimension:string;min:number;max:number;label:string}[];
  scoring?: 'manual'|'dimensions'|'objective'|'total'|'rubric'|'mixed';
  sourceId?: string;
  maxAttempts?: number;
  id: string;
  version: string;
  title: string;
  description: string;
  questions: Question[];
  options: Option[];
}
export interface Career {
  sourceUrl?: string;
  sourceDate?: string;
  id: string;
  name: string;
  area: string;
  interests: string[];
  description: string;
  activities: string;
  skills: string;
  investigate: string;
}
export interface User {
  id: string;
  name: string;
  email: string;
  role: "Estudiante" | "Orientador";
  group: string;
  status: "Activo" | "Invitación pendiente" | "Suspendido";
}
export type Navigate = (view: View) => void;
