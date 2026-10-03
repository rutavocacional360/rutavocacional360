import type { Instrument } from '../types';
import { calculateTest, type AnswerMap } from './test-engine';

type SavedScore = {dimension:string;raw?:number;value:number;min:number;max:number;[key:string]:unknown};
type SavedEvaluation = {aggregation?:string;engineVersion?:string;trace?:unknown[]};
type Bounds = {min:number;max:number;weight:number};
const close = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) <= 1e-8*Math.max(1,Math.abs(a),Math.abs(b));

/** Keep saved/reviewed values; only repair a demonstrated mixture of sum and mean units. */
export function guidanceScores(instrument: Instrument, answers: AnswerMap, evaluation: SavedEvaluation | undefined, scores: SavedScore[]): (SavedScore & {displayRaw?:number;guidanceScaleValid?:boolean;guidanceScale?:string})[] {
  let trace = evaluation?.trace;
  if (!trace?.length && scores.length && !instrument.questions.some(q=>(q.policy||instrument.scoring)==='rubric')) {
    // Older original results saved a mean without its bounds. Rebuild bounds, never the saved score.
    try { trace = calculateTest({...instrument,scoring:instrument.scoring||'dimensions'},answers).trace; } catch { /* Invalid legacy snapshots cannot supply trustworthy bounds. */ }
  }
  const bounds = new Map<string,Bounds>();
  for (const item of trace || []) {
    const row = item as {dimension?:string;min?:number;max?:number;weight?:number};
    if (!row.dimension || !Number.isFinite(row.min) || !Number.isFinite(row.max) || !Number.isFinite(row.weight) || row.weight! < 0) continue;
    const total = bounds.get(row.dimension) || {min:0,max:0,weight:0};
    total.min += row.min!; total.max += row.max!; total.weight += row.weight!;
    bounds.set(row.dimension,total);
  }
  const aggregation = evaluation?.aggregation || instrument.aggregation || (instrument.schemaVersion===2?'sum':'mean');
  return scores.map(score=>{
    const bound = bounds.get(score.dimension);
    if (!bound || !bound.weight || bound.max<=bound.min) return {...score};
    const sum = {min:bound.min,max:bound.max,divisor:1,scale:'sum'}, mean = {min:bound.min/bound.weight,max:bound.max/bound.weight,divisor:bound.weight,scale:'mean'};
    let units = aggregation==='mean'?mean:sum;
    const matchesBounds = (candidate: typeof sum) => close(score.min,candidate.min)&&close(score.max,candidate.max);
    const matchesRaw = (candidate: typeof sum) => Number.isFinite(score.raw)&&close(score.value,score.raw!/candidate.divisor);
    if (!matchesRaw(units)) {
      const other = aggregation==='mean'?sum:mean;
      if (!evaluation?.engineVersion && matchesRaw(other)) units=other;
      // A current reviewed value can differ from raw. Display its weighted sum without changing saved raw.
      else if (matchesBounds(units)) return {...score,displayRaw:score.value*units.divisor};
      else if (matchesBounds(other)) return {...score,displayRaw:score.value*other.divisor};
      else if (!Number.isFinite(score.raw)&&Number.isFinite(score.value)&&score.value>=units.min&&score.value<=units.max) { /* Legacy mean-only scores use the snapshot's declared scale. */ }
      else return {...score,guidanceScaleValid:false};
    }
    return {...score,min:units.min,max:units.max,guidanceScale:units.scale,displayRaw:score.value*units.divisor,
      ...(score.normalized!==undefined?{normalized:(score.value-units.min)/(units.max-units.min)*100}:{})};
  });
}
