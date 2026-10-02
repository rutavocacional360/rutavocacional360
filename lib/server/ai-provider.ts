// No transport accepting student data. Gemini public academic content only.
export {refreshAcademicContent} from './academic-content.mjs';
export const providerName=()=> 'gemini';
export const providerReady=()=>!!process.env.GEMINI_API_KEY?.trim();
