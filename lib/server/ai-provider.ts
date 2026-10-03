// Provider credentials remain private. Personal orientation sends only scored aggregates.
export {refreshAcademicContent} from './academic-content.mjs';
export const providerName=()=> 'gemini';
export const providerReady=()=>!!process.env.GEMINI_API_KEY?.trim();
