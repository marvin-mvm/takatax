/**
 * Every BIR return a Certificate of Registration (Form 2303) can list: what it is, how often it
 * is filed and how its due dates repeat. Pure data and functions: no I/O.
 *
 * A COR prints the taxpayer's tax types, each with the form it is filed on. Whatever a COR lists
 * is looked up here, so the app is not limited to the forms of one sample COR. A form that is not
 * in this table is still kept and shown as printed; it just has no calendar yet.
 *
 * Checked on 2026-11-16 against the BIR's list of forms and its 2026 tax calendar (bir.gov.ph),
 * with RR 11-2018 (withholding returns), RMO 23-2018 (the 8% rate), RMC 5-2023 (monthly VAT),
 * RMC 14-2024 (the registration fee) and RMC 20-2026 (annual income tax forms).
 *
 * Due dates are the ones for manual and eBIRForms filers. eFPS filers get a few extra days for
 * some monthly returns. Dates the BIR moves for a weekend, a holiday or a one-off extension are
 * not applied. A CPA should review this table before launch.
 */

/** How a return's due dates repeat. */
export type FormSchedule =
  /** Individuals: three cumulative quarterly returns, due May 15, August 15 and November 15. */
  | "income_quarterly"
  /** April 15 of the next year. */
  | "annual_april_15"
  /** Corporations: 60 days after each of the first three quarters. */
  | "corporate_quarterly"
  /** The 25th day after each quarter. */
  | "quarterly_25th"
  /** The last day of the month after each quarter. */
  | "quarterly_month_end"
  /** The 10th of the next month, every month. */
  | "monthly_10th"
  /** The 10th of the next month, with December's return due January 15. */
  | "monthly_10th_december_15th"
  /** The 10th of the next month, for the first two months of each quarter only. */
  | "monthly_10th_two_of_three"
  /** Five days after the end of each month. */
  | "monthly_5th"
  /** The 20th of the next month, every month. */
  | "monthly_20th"
  /** January 31 of the next year. */
  | "annual_january_31"
  /** March 1 of the next year. */
  | "annual_march_1"
  /** Filed when the transaction happens, so it has no place on a calendar. */
  | "per_transaction"
  /** No longer filed. */
  | "retired";

/** The tax type a form belongs to, the way a COR groups them. */
export type BirTaxType =
  | "income_tax"
  | "vat"
  | "percentage_tax"
  | "withholding_expanded"
  | "withholding_final"
  | "withholding_compensation"
  | "withholding_other"
  | "documentary_stamp"
  | "excise"
  | "capital_gains"
  | "transfer_tax"
  | "registration";

export const BIR_TAX_TYPE_LABEL: Record<BirTaxType, string> = {
  income_tax: "Income tax",
  vat: "VAT",
  percentage_tax: "Percentage tax",
  withholding_expanded: "Expanded withholding tax",
  withholding_final: "Final withholding tax",
  withholding_compensation: "Withholding tax on salaries",
  withholding_other: "Other withholding tax",
  documentary_stamp: "Documentary stamp tax",
  excise: "Excise tax",
  capital_gains: "Capital gains tax",
  transfer_tax: "Estate and donor's tax",
  registration: "Registration",
};

/**
 * What a return's deadline means for money:
 * - "estimated": Takatax works out an amount from the records read so far;
 * - "none": an information return, nothing is paid with it;
 * - "not_estimated": tax may be due, but Takatax does not compute it yet.
 */
export type FormPayment = "estimated" | "none" | "not_estimated";

/** What to say where a return's amount would go. */
export const FORM_PAYMENT_TEXT: Record<FormPayment, string> = {
  estimated: "From the records read so far",
  none: "Nothing is paid with this return",
  not_estimated: "Takatax does not estimate this return yet",
};

export interface BirForm {
  /** The form number the way the BIR writes it, for example "1601-EQ" or "2551Q". */
  form: string;
  taxType: BirTaxType;
  /** What the return is, in plain words. */
  title: string;
  /** The short name used in the deadline list. */
  shortTitle: string;
  /** How often it is filed, in plain words. */
  frequency: string;
  schedule: FormSchedule;
  payment: FormPayment;
  /** What to have ready before the deadline. */
  needs: string[];
  /**
   * For a form number the BIR retired: the forms filed in its place today. An old COR can still
   * print the old number, and the taxpayer then files these.
   */
  replacedBy?: string[];
}

const TRANSACTION = "When the transaction happens";

const form = (
  code: string,
  taxType: BirTaxType,
  title: string,
  shortTitle: string,
  frequency: string,
  schedule: FormSchedule,
  payment: FormPayment,
  needs: string[] = [],
): BirForm => ({ form: code, taxType, title, shortTitle, frequency, schedule, payment, needs });

/** A form number the BIR no longer uses, and what is filed in its place (if anything). */
const retired = (
  code: string,
  taxType: BirTaxType,
  title: string,
  shortTitle: string,
  replacedBy: string[] = [],
): BirForm => ({
  form: code,
  taxType,
  title,
  shortTitle,
  frequency: "No longer filed",
  schedule: "retired",
  payment: "none",
  needs: [],
  ...(replacedBy.length ? { replacedBy } : {}),
});

const SALES = "Sales invoices you issued in the quarter";
const ANNUAL_INCOME = [
  "The year's sales invoices (fourth quarter included)",
  "All Form 2307s for the year",
  "Audited financial statements if sales passed ₱3 million",
];
const PAYROLL = "The month's payroll and the tax you held back from salaries";

export const BIR_FORMS: BirForm[] = [
  // ---------------------------------------------------------------------------- Income tax
  form(
    "1701Q",
    "income_tax",
    "Quarterly income tax return",
    "Quarterly income tax",
    "Quarterly",
    "income_quarterly",
    "estimated",
    [SALES, "Form 2307s your clients gave you for the quarter"],
  ),
  form(
    "1701",
    "income_tax",
    "Annual income tax return",
    "Annual income tax",
    "Yearly",
    "annual_april_15",
    "estimated",
    ANNUAL_INCOME,
  ),
  form(
    "1701A",
    "income_tax",
    "Annual income tax return (business or profession only)",
    "Annual income tax",
    "Yearly",
    "annual_april_15",
    "estimated",
    ANNUAL_INCOME,
  ),
  form(
    "1701-MS",
    "income_tax",
    "Annual income tax return for micro and small taxpayers (optional, in place of 1701 or 1701A)",
    "Annual income tax",
    "Yearly",
    "annual_april_15",
    "not_estimated",
    ANNUAL_INCOME,
  ),
  form(
    "1700",
    "income_tax",
    "Annual income tax return (salary income only)",
    "Annual income tax on salary",
    "Yearly",
    "annual_april_15",
    "not_estimated",
    ["Form 2316 from each employer for the year"],
  ),
  form(
    "1702Q",
    "income_tax",
    "Quarterly corporate income tax return",
    "Quarterly corporate income tax",
    "Quarterly",
    "corporate_quarterly",
    "not_estimated",
    ["The quarter's sales and expenses", "Form 2307s your clients gave you for the quarter"],
  ),
  form(
    "1702-RT",
    "income_tax",
    "Annual corporate income tax return (regular rate)",
    "Annual corporate income tax",
    "Yearly",
    "annual_april_15",
    "not_estimated",
    ["The year's books and financial statements", "All Form 2307s for the year"],
  ),
  form(
    "1702-EX",
    "income_tax",
    "Annual corporate income tax return (exempt)",
    "Annual corporate income tax",
    "Yearly",
    "annual_april_15",
    "not_estimated",
    ["The year's books and financial statements"],
  ),
  form(
    "1702-MX",
    "income_tax",
    "Annual corporate income tax return (mixed rates)",
    "Annual corporate income tax",
    "Yearly",
    "annual_april_15",
    "not_estimated",
    ["The year's books and financial statements", "All Form 2307s for the year"],
  ),
  retired(
    "1702",
    "income_tax",
    "Annual corporate income tax return (old form, replaced by 1702-RT, 1702-EX and 1702-MX)",
    "Annual corporate income tax",
    ["1702-RT"],
  ),
  retired(
    "1704",
    "income_tax",
    "Improperly accumulated earnings tax return (the tax was repealed in 2021)",
    "Improperly accumulated earnings tax",
  ),

  // ---------------------------------------------------------------------------- VAT
  form(
    "2550Q",
    "vat",
    "Quarterly VAT return",
    "Quarterly VAT",
    "Quarterly",
    "quarterly_25th",
    "estimated",
    ["Sales invoices showing VAT", "Purchase invoices showing VAT, addressed to your TIN"],
  ),
  retired(
    "2550M",
    "vat",
    "Monthly VAT declaration (not required since January 2023; the quarterly 2550Q is)",
    "Monthly VAT",
    ["2550Q"],
  ),
  form(
    "2550-DS",
    "vat",
    "VAT return for digital service providers based outside the Philippines",
    "Quarterly VAT on digital services",
    "Quarterly",
    "quarterly_25th",
    "not_estimated",
    ["Sales of digital services to customers in the Philippines in the quarter"],
  ),

  // ---------------------------------------------------------------------------- Percentage tax
  form(
    "2551Q",
    "percentage_tax",
    "Quarterly percentage tax return",
    "Quarterly percentage tax",
    "Quarterly",
    "quarterly_25th",
    "estimated",
    [SALES],
  ),
  retired(
    "2551M",
    "percentage_tax",
    "Monthly percentage tax return (replaced by 2551Q in 2018)",
    "Monthly percentage tax",
    ["2551Q"],
  ),
  form(
    "2552",
    "percentage_tax",
    "Percentage tax on shares sold through the stock exchange or in a public offering",
    "Percentage tax on stock sales",
    TRANSACTION,
    "per_transaction",
    "not_estimated",
  ),
  form(
    "2553",
    "percentage_tax",
    "Percentage tax return under special laws",
    "Percentage tax under special laws",
    "As the special law says",
    "per_transaction",
    "not_estimated",
  ),

  // ---------------------------------------------------------------------------- Withholding: expanded
  form(
    "0619-E",
    "withholding_expanded",
    "Monthly remittance of expanded withholding tax",
    "Monthly withholding tax",
    "Monthly (first two months of each quarter)",
    "monthly_10th_two_of_three",
    "estimated",
    ["Rent and contractor payments for the month, and the tax you held back"],
  ),
  form(
    "1601-EQ",
    "withholding_expanded",
    "Quarterly return of expanded withholding tax",
    "Quarterly withholding tax",
    "Quarterly",
    "quarterly_month_end",
    "estimated",
    [
      "The third month's rent and contractor payments",
      "Copies of the Form 2307s you gave your payees",
    ],
  ),
  form(
    "1604-E",
    "withholding_expanded",
    "Annual information return of expanded withholding tax",
    "Annual withholding tax information return",
    "Yearly",
    "annual_march_1",
    "none",
    [
      "The year's rent and contractor payments, listed by payee",
      "The tax you held back from each payee, matching your four 1601-EQ returns",
    ],
  ),
  retired(
    "1601-E",
    "withholding_expanded",
    "Monthly return of expanded withholding tax (replaced by 0619-E and 1601-EQ in 2018)",
    "Monthly expanded withholding tax",
    ["0619-E", "1601-EQ", "1604-E"],
  ),

  // ---------------------------------------------------------------------------- Withholding: final
  form(
    "0619-F",
    "withholding_final",
    "Monthly remittance of final withholding tax",
    "Monthly final withholding tax",
    "Monthly (first two months of each quarter)",
    "monthly_10th_two_of_three",
    "not_estimated",
    ["Payments in the month that carry final tax, and the tax you held back"],
  ),
  form(
    "1601-FQ",
    "withholding_final",
    "Quarterly return of final withholding tax",
    "Quarterly final withholding tax",
    "Quarterly",
    "quarterly_month_end",
    "not_estimated",
    ["The quarter's payments that carry final tax, and the tax you held back"],
  ),
  form(
    "1602Q",
    "withholding_final",
    "Quarterly return of final tax withheld on interest from deposits",
    "Quarterly final tax on interest",
    "Quarterly",
    "quarterly_month_end",
    "not_estimated",
    ["Interest paid in the quarter and the final tax held back"],
  ),
  form(
    "1603Q",
    "withholding_final",
    "Quarterly return of final tax withheld on fringe benefits",
    "Quarterly fringe benefits tax",
    "Quarterly",
    "quarterly_month_end",
    "not_estimated",
    ["Fringe benefits given to managers and supervisors in the quarter"],
  ),
  form(
    "1604-F",
    "withholding_final",
    "Annual information return of final withholding tax",
    "Annual final withholding tax information return",
    "Yearly",
    "annual_january_31",
    "none",
    ["The year's payments that carried final tax, listed by payee"],
  ),
  retired(
    "1601-F",
    "withholding_final",
    "Monthly return of final withholding tax (replaced by 0619-F and 1601-FQ in 2018)",
    "Monthly final withholding tax",
    ["0619-F", "1601-FQ", "1604-F"],
  ),
  retired(
    "1602",
    "withholding_final",
    "Monthly return of final tax withheld on interest from deposits (replaced by 1602Q in 2018)",
    "Monthly final tax on interest",
    ["1602Q"],
  ),
  retired(
    "1603",
    "withholding_final",
    "Monthly return of final tax withheld on fringe benefits (replaced by 1603Q in 2018)",
    "Monthly fringe benefits tax",
    ["1603Q"],
  ),

  // ---------------------------------------------------------------------------- Withholding: salaries
  form(
    "1601-C",
    "withholding_compensation",
    "Monthly return of tax withheld on salaries",
    "Monthly withholding tax on salaries",
    "Monthly",
    "monthly_10th_december_15th",
    "not_estimated",
    [PAYROLL],
  ),
  form(
    "1604-C",
    "withholding_compensation",
    "Annual information return of tax withheld on salaries",
    "Annual information return on salaries",
    "Yearly",
    "annual_january_31",
    "none",
    ["The year's payroll, listed by employee", "The Form 2316 you give each employee"],
  ),
  retired(
    "1604-CF",
    "withholding_compensation",
    "Annual information return on salaries and final taxes (old form, split into 1604-C and 1604-F)",
    "Annual information return on salaries and final taxes",
    ["1604-C", "1604-F"],
  ),

  // ---------------------------------------------------------------------------- Withholding: other
  form(
    "1600-VT",
    "withholding_other",
    "Monthly remittance of VAT withheld",
    "Monthly VAT withheld",
    "Monthly",
    "monthly_10th",
    "not_estimated",
    ["Payments in the month that carry withheld VAT"],
  ),
  form(
    "1600-PT",
    "withholding_other",
    "Monthly remittance of percentage tax withheld",
    "Monthly percentage tax withheld",
    "Monthly",
    "monthly_10th",
    "not_estimated",
    ["Payments in the month that carry withheld percentage tax"],
  ),
  retired(
    "1600",
    "withholding_other",
    "Monthly remittance of VAT and percentage tax withheld (replaced by 1600-VT and 1600-PT)",
    "Monthly VAT and percentage tax withheld",
    ["1600-VT", "1600-PT"],
  ),
  form(
    "1600-WP",
    "withholding_other",
    "Remittance of percentage tax withheld on race track winnings",
    "Tax withheld on race track winnings",
    "Monthly",
    "monthly_20th",
    "not_estimated",
    ["Winnings and prizes paid in the month and the tax held back"],
  ),
  form(
    "1606",
    "withholding_other",
    "Remittance of tax withheld on a sale of real property",
    "Tax withheld on a property sale",
    TRANSACTION,
    "per_transaction",
    "not_estimated",
  ),
  form(
    "0620",
    "withholding_other",
    "Monthly remittance of tax withheld on withdrawals from a deceased depositor's account",
    "Monthly tax on deceased depositors' accounts",
    "Monthly (first two months of each quarter)",
    "monthly_10th_two_of_three",
    "not_estimated",
    ["Withdrawals from deceased depositors' accounts in the month"],
  ),
  form(
    "1621",
    "withholding_other",
    "Quarterly return of tax withheld on withdrawals from a deceased depositor's account",
    "Quarterly tax on deceased depositors' accounts",
    "Quarterly",
    "quarterly_month_end",
    "not_estimated",
    ["Withdrawals from deceased depositors' accounts in the quarter"],
  ),

  // ---------------------------------------------------------------------------- Documentary stamp tax
  form(
    "2000",
    "documentary_stamp",
    "Monthly documentary stamp tax declaration",
    "Monthly documentary stamp tax",
    "Monthly",
    "monthly_5th",
    "not_estimated",
    ["Loan papers, leases and other documents signed in the month that carry stamp tax"],
  ),
  form(
    "2000-OT",
    "documentary_stamp",
    "Documentary stamp tax on a one-time transaction",
    "Documentary stamp tax on a sale",
    TRANSACTION,
    "per_transaction",
    "not_estimated",
  ),

  // ---------------------------------------------------------------------------- Excise tax
  ...(
    [
      ["2200-A", "alcohol products"],
      ["2200-AN", "automobiles and non-essential goods"],
      ["2200-P", "petroleum products"],
      ["2200-S", "sweetened beverages"],
      ["2200-T", "tobacco and vapor products"],
    ] as const
  ).map(([code, goods]) =>
    form(
      code,
      "excise",
      `Excise tax return for ${goods}`,
      `Excise tax on ${goods}`,
      "Before the goods leave the place of production",
      "per_transaction",
      "not_estimated",
    ),
  ),
  form(
    "2200-M",
    "excise",
    "Excise tax return for mineral products",
    "Excise tax on mineral products",
    "When the minerals are removed (each quarter for metallic minerals)",
    "per_transaction",
    "not_estimated",
  ),
  form(
    "2200-C",
    "excise",
    "Excise tax return for cosmetic procedures",
    "Monthly excise tax on cosmetic procedures",
    "Monthly",
    "monthly_10th",
    "not_estimated",
    ["Cosmetic procedures performed in the month and what was charged for them"],
  ),

  // ---------------------------------------------------------------------------- Capital gains
  form(
    "1706",
    "capital_gains",
    "Capital gains tax return for a sale of real property",
    "Capital gains tax on a property sale",
    TRANSACTION,
    "per_transaction",
    "not_estimated",
  ),
  form(
    "1707",
    "capital_gains",
    "Capital gains tax return for a sale of shares not traded on the exchange",
    "Capital gains tax on a share sale",
    TRANSACTION,
    "per_transaction",
    "not_estimated",
  ),
  form(
    "1707-A",
    "capital_gains",
    "Annual capital gains tax return for shares not traded on the exchange",
    "Annual capital gains tax on shares",
    "Yearly",
    "annual_april_15",
    "not_estimated",
    ["The year's sales of shares not traded on the exchange"],
  ),

  // ---------------------------------------------------------------------------- Estate and donor's tax
  form(
    "1800",
    "transfer_tax",
    "Donor's tax return",
    "Donor's tax",
    TRANSACTION,
    "per_transaction",
    "not_estimated",
  ),
  form(
    "1801",
    "transfer_tax",
    "Estate tax return",
    "Estate tax",
    TRANSACTION,
    "per_transaction",
    "not_estimated",
  ),

  // ---------------------------------------------------------------------------- Registration
  retired(
    "0605",
    "registration",
    "Annual registration fee (no longer paid since January 22, 2024)",
    "Annual registration fee",
  ),
];

const BY_FORM = new Map(BIR_FORMS.map((entry) => [entry.form, entry]));
/** "0619E", "1702RT" -> the form as the BIR writes it. */
const BY_COMPACT = new Map(BIR_FORMS.map((entry) => [entry.form.replace(/-/g, ""), entry.form]));

/** The table's entry for a form number written the BIR's way, if the form is known. */
export function birForm(code: string | null | undefined): BirForm | undefined {
  return code ? BY_FORM.get(code) : undefined;
}

/**
 * The BIR's spelling of a form number from its digits and letters, however it was typed:
 * ("0619", "E") -> "0619-E", ("1702", "RT") -> "1702-RT", ("1701", "A") -> "1701A".
 * Null when the form is not in the table.
 */
export function canonicalFormCode(digits: string, letters: string): string | null {
  return BY_COMPACT.get(`${digits}${letters.toUpperCase()}`) ?? null;
}

/**
 * The forms filed today for a form number printed on a COR: the form itself, or what replaced it
 * when the BIR retired the number (an old COR's 2551M means 2551Q). Empty for a retired form with
 * nothing in its place, like the registration fee on 0605.
 */
export function formsFiledFor(code: string): string[] {
  const entry = birForm(code);
  if (!entry) return [code];
  if (entry.schedule !== "retired") return [code];
  return entry.replacedBy ?? [];
}

/** True for a form that still has to be filed (so not 0605, 2550M, 2551M and the like). */
export function isFiled(code: string): boolean {
  return birForm(code)?.schedule !== "retired";
}

/** True for a form with repeating due dates, which the calendar can show. */
export function isOnCalendar(code: string): boolean {
  const schedule = birForm(code)?.schedule;
  return schedule !== undefined && schedule !== "retired" && schedule !== "per_transaction";
}
