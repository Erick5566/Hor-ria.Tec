/** Commercial eligibility, independent of a feature toggle or a wallet balance.
 *  Horária Plus is currently fulfilled by the existing HORARIA_PRO subscription.
 *  Never infer paid-plan access from aiEnabled alone.
 */
export const HORARIA_PLUS_PLAN_CODE = "HORARIA_PRO";
export function isHorariaPlus(planCode: unknown): boolean {
  return planCode === HORARIA_PLUS_PLAN_CODE;
}
export function canRunPaidAi(planCode: unknown, aiEnabled: boolean): boolean {
  return isHorariaPlus(planCode) && aiEnabled;
}
