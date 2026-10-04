/** Preserve complete study guidance without repeating a shorter version of the same text. */
export function careerStudyDetails(career:{comparison?:string;explore?:string}):string[]{
 const comparison=career.comparison?.trim()||'',explore=career.explore?.trim()||'';
 if(!comparison)return explore?[explore]:[];
 if(!explore)return [comparison];
 const normalize=(value:string)=>' '+value.normalize('NFC').toLocaleLowerCase('es').replace(/[.,;:!?…]+/g,' ').replace(/\s+/g,' ').trim()+' ';
 if(normalize(explore).includes(normalize(comparison)))return [explore];
 if(normalize(comparison).includes(normalize(explore)))return [comparison];
 return [comparison,explore];
}
