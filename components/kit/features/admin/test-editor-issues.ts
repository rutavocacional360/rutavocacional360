import type {Instrument} from '../../types';
import {instrumentProblems} from '../../lib/test-engine';

export const TEST_EDITOR_STEPS=['Información','Preguntas','Resultados','Disponibilidad','Revisar y publicar'];
export type TestEditorIssue={questionId?:string;step:number;message:string;label:string};

export function testEditorIssues(instrument:Instrument,issues=instrumentProblems(instrument)):TestEditorIssue[]{
 return issues.map(issue=>{
  const index=issue.questionId?instrument.questions.findIndex(question=>question.id===issue.questionId):-1;
  return {...issue,label:(index>=0?'Pregunta '+(index+1):TEST_EDITOR_STEPS[issue.step]||'Revisión')+': '+issue.message};
 });
}
