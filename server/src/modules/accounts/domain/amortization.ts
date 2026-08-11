import { Money } from '@/common/money/money';
import { clampToMonth } from './billing-cycle';

/**
 * Loan amortization - the numbers behind design 2d.
 *
 *   "98 of 240 EMIs paid · 36% principal cleared · Closes Mar 2038"
 *   "Interest paid ₹14.2 L · Principal paid ₹7.38 L · Prepay saving ₹3.9 L"
 *
 * None of this exists in the architecture doc. It's the largest single gap
 * between what the design renders and what the specs modelled.
 *
 * Everything runs on integer paise through `Money`. The schedule is built
 * month by month rather than closed-form because the closed-form total drifts
 * from the sum of rounded monthly payments, and it's the monthly figures a
 * user reconciles against their bank statement.
 */

export interface LoanTerms {
  principal: Money;
  /** Annual nominal rate, as a percentage. 8.4 means 8.4%. */
  annualRatePercent: number;
  tenureMonths: number;
  /**
   * Overrides the computed EMI. Real EMIs often include insurance or fees, so
   * the spec requires allowing the user's actual figure.
   */
  emi?: Money;
  firstEmiDate: Date;
}

export interface ScheduleRow {
  /** 1-based. */
  installment: number;
  date: Date;
  payment: Money;
  interest: Money;
  principal: Money;
  /** Remaining after this payment. */
  balance: Money;
}

export interface LoanSummary {
  principal: Money;
  emi: Money;
  tenureMonths: number;
  emisPaid: number;
  emisRemaining: number;
  outstanding: Money;
  principalPaid: Money;
  interestPaid: Money;
  totalPaid: Money;
  /** Design 2d: "36% principal cleared". */
  principalClearedPercent: number;
  totalInterestOverLife: Money;
  /** Design 2d: "Closes Mar 2038". */
  closureDate: Date;
  nextEmiDate: Date | null;
}

export interface PrepaySimulation {
  prepayment: Money;
  /** Design 2d: "Prepay saving ₹3.9 L". */
  interestSaved: Money;
  monthsSaved: number;
  newClosureDate: Date;
  newTenureMonths: number;
}

export class AmortizationError extends Error {}

/**
 * The standard EMI formula:
 *
 *   EMI = P · r · (1+r)^n / ((1+r)^n − 1)
 *
 * where r is the monthly rate and n the number of months.
 */
export function computeEmi(
  principal: Money,
  annualRatePercent: number,
  tenureMonths: number,
): Money {
  assertTerms(annualRatePercent, tenureMonths);

  const monthlyRate = annualRatePercent / 100 / 12;

  // An interest-free loan divides by zero in the formula above.
  if (monthlyRate === 0) {
    return principal.multiply(1 / tenureMonths, 'ceil');
  }

  const growth = Math.pow(1 + monthlyRate, tenureMonths);
  const factor = (monthlyRate * growth) / (growth - 1);

  // Rounded up, as lenders do - rounding down would leave a residue that the
  // final instalment has to absorb.
  return principal.multiply(factor, 'ceil');
}

/**
 * Builds the full schedule.
 *
 * The final instalment is adjusted to whatever actually clears the balance.
 * Rounding each month's EMI up accumulates a small overpayment across the
 * term, so a fixed last payment would leave the balance slightly negative -
 * a loan that repays more than was borrowed.
 */
export function buildSchedule(terms: LoanTerms): ScheduleRow[] {
  assertTerms(terms.annualRatePercent, terms.tenureMonths);

  if (!terms.principal.isPositive) {
    throw new AmortizationError('Principal must be positive');
  }

  const monthlyRate = terms.annualRatePercent / 100 / 12;
  const emi =
    terms.emi ??
    computeEmi(terms.principal, terms.annualRatePercent, terms.tenureMonths);

  if (!emi.isPositive) {
    throw new AmortizationError('EMI must be positive');
  }

  // An EMI that doesn't cover the first month's interest never amortises -
  // the balance grows every month and the schedule would run forever.
  const firstInterest = terms.principal.multiply(monthlyRate);
  if (monthlyRate > 0 && !emi.greaterThan(firstInterest)) {
    throw new AmortizationError(
      `EMI of ${emi.toString()} does not cover the first month's interest of ` +
        `${firstInterest.toString()}; this loan would never be repaid`,
    );
  }

  const rows: ScheduleRow[] = [];
  let balance = terms.principal;
  const dayOfMonth = terms.firstEmiDate.getUTCDate();

  for (let i = 0; i < terms.tenureMonths && balance.isPositive; i += 1) {
    const isFinalInstallment = i === terms.tenureMonths - 1;
    const interest = balance.multiply(monthlyRate);
    let principalPart = emi.subtract(interest);
    let payment = emi;

    // The last instalment clears whatever remains, plus its interest.
    //
    // Both conditions are needed. The overshoot case handles a loan that
    // repays early because the EMI was rounded up or supplied by the user.
    // The final-instalment case handles the opposite residue: per-month
    // rounding can leave a few paise outstanding after the last scheduled
    // payment, and a loan that ends owing ₹0.01 forever is worse than one
    // whose closing payment differs by a paisa.
    if (!principalPart.lessThan(balance) || isFinalInstallment) {
      principalPart = balance;
      payment = balance.add(interest);
    }

    balance = balance.subtract(principalPart);

    rows.push({
      installment: i + 1,
      date: clampToMonth(
        terms.firstEmiDate.getUTCFullYear(),
        terms.firstEmiDate.getUTCMonth() + i,
        dayOfMonth,
      ),
      payment,
      interest,
      principal: principalPart,
      balance,
    });
  }

  return rows;
}

/** The position after `emisPaid` instalments. */
export function summariseLoan(terms: LoanTerms, emisPaid: number): LoanSummary {
  const schedule = buildSchedule(terms);
  const paid = Math.max(0, Math.min(Math.trunc(emisPaid), schedule.length));
  const settled = schedule.slice(0, paid);

  const principalPaid = Money.sum(settled.map((row) => row.principal));
  const interestPaid = Money.sum(settled.map((row) => row.interest));
  const outstanding = settled.at(-1)?.balance ?? terms.principal;
  const emi =
    terms.emi ??
    computeEmi(terms.principal, terms.annualRatePercent, terms.tenureMonths);

  return {
    principal: terms.principal,
    emi,
    tenureMonths: terms.tenureMonths,
    emisPaid: paid,
    emisRemaining: schedule.length - paid,
    outstanding,
    principalPaid,
    interestPaid,
    totalPaid: principalPaid.add(interestPaid),
    principalClearedPercent: principalPaid.ratioOf(terms.principal),
    totalInterestOverLife: Money.sum(schedule.map((row) => row.interest)),
    // The schedule can be shorter than the nominal tenure when a user-supplied
    // EMI exceeds the computed one, so closure comes from the schedule itself.
    closureDate: schedule.at(-1)?.date ?? terms.firstEmiDate,
    nextEmiDate: schedule[paid]?.date ?? null,
  };
}

/**
 * What a lump-sum prepayment today would save.
 *
 * Models the common Indian arrangement: the EMI stays fixed and the tenure
 * shortens. (Reducing the EMI instead saves far less interest - worth
 * surfacing as a separate option later.)
 */
export function simulatePrepayment(
  terms: LoanTerms,
  emisPaid: number,
  prepayment: Money,
): PrepaySimulation {
  if (!prepayment.isPositive) {
    throw new AmortizationError('Prepayment must be positive');
  }

  const current = summariseLoan(terms, emisPaid);

  if (!current.outstanding.isPositive) {
    throw new AmortizationError('Loan is already settled');
  }

  const baselineRemaining = Money.sum(
    buildSchedule(terms)
      .slice(current.emisPaid)
      .map((row) => row.interest),
  );

  // Clearing the loan outright saves every remaining rupee of interest.
  if (!prepayment.lessThan(current.outstanding)) {
    return {
      prepayment: current.outstanding,
      interestSaved: baselineRemaining,
      monthsSaved: current.emisRemaining,
      newClosureDate: current.nextEmiDate ?? current.closureDate,
      newTenureMonths: current.emisPaid,
    };
  }

  const nextDate = current.nextEmiDate ?? terms.firstEmiDate;
  const reduced = buildSchedule({
    principal: current.outstanding.subtract(prepayment),
    annualRatePercent: terms.annualRatePercent,
    tenureMonths: current.emisRemaining,
    emi: current.emi,
    firstEmiDate: nextDate,
  });

  const newInterest = Money.sum(reduced.map((row) => row.interest));

  return {
    prepayment,
    interestSaved: baselineRemaining.subtract(newInterest),
    monthsSaved: current.emisRemaining - reduced.length,
    newClosureDate: reduced.at(-1)?.date ?? nextDate,
    newTenureMonths: current.emisPaid + reduced.length,
  };
}

function assertTerms(annualRatePercent: number, tenureMonths: number): void {
  if (!Number.isFinite(annualRatePercent) || annualRatePercent < 0) {
    throw new AmortizationError(
      `Annual rate must be a non-negative number, got ${annualRatePercent}`,
    );
  }
  if (!Number.isInteger(tenureMonths) || tenureMonths < 1) {
    throw new AmortizationError(
      `Tenure must be a positive whole number of months, got ${tenureMonths}`,
    );
  }
}
