import {calculate} from './calculate.mjs';

// Every destination receives the same savings and income, as an alternative move.
// Savings must never be divided among destinations or counted as monthly income.
export function assess(input,rates){
  const result=calculate(input,rates);
  const recurringBalance=result.income-result.monthlyPlanned;
  const last=result.schedule.at(-1);
  return {...result,recurringBalance,endBalance:last.balance,
    fits:result.gap===0,
    fundedMonths:result.firstShortfall===null?result.months:result.firstShortfall-1};
}
