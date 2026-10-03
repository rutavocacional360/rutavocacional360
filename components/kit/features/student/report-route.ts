import {defaultPreparationLevel,type EducationLevel} from '../../data/school-training';

/** Resolve saved reports by their own profile, including reports predating route metadata. */
export function reportEducationLevel(report:any,profile?:any):EducationLevel {
  if(report?.educationLevel==='bachillerato'||report?.educationLevel==='universidad')return report.educationLevel;
  const savedProfile=[report?.profile,report?.student?.profile,report?.student,report?.analysis?.pathway?.profile].find(item=>typeof item?.stage==='string'&&item.stage.length>0);
  return defaultPreparationLevel(savedProfile||profile);
}

export function reportNextSteps(report:any,profile?:any):string[] {
  const level=reportEducationLevel(report,profile);
  const steps=level==='bachillerato'?report?.analysis?.pathway?.nextSteps||[]:report?.analysis?.nextSteps||[];
  return [...new Set<string>(steps)].filter(step=>level!=='bachillerato'||!/universidad|universitari|educación superior/i.test(step));
}
