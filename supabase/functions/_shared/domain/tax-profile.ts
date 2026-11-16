/**
 * What a taxpayer's Certificate of Registration (BIR Form 2303) says, and which taxes and
 * returns follow from it. Pure data and functions: no I/O.
 */

import type { CorTaxType } from "../parser/registration.ts";
import type { IsoDate } from "./dates.ts";

/** How income tax is computed for the year. The choice is made once a year. */
export type IncomeTaxOption = "eight_percent" | "graduated_osd" | "graduated_itemized";

export type TaxTypeId = "income_tax" | "percentage_tax" | "vat" | "withholding";

/** The profile read from the COR, confirmed by the user. */
export interface TaxProfile {
  tin: string;
  registeredName: string;
  tradeName?: string | undefined;
  rdoCode: string;
  registeredAddress: string;
  lineOfBusiness: string;
  registrationDate: IsoDate;
  /** Registered for VAT (gross sales above ₱3M, or by choice). */
  vatRegistered: boolean;
  /** Withholds tax on rent or contractor payments, so files 0619-E, 1601-EQ and 1604-E. */
  withholdingAgent: boolean;
  incomeTaxOption: IncomeTaxOption;
  businessType: "services" | "goods";
  /** Also earns a salary; 8% filers with a salary do not get the ₱250,000 reduction. */
  mixedIncome: boolean;
  /** The tax types and forms printed on the COR, as confirmed by the owner. */
  corTaxTypes?: CorTaxType[] | undefined;
}

export interface TaxTypeInfo {
  id: TaxTypeId;
  label: string;
  /** One plain sentence about what it is. */
  description: string;
  /** Returns it is reported on. */
  forms: string[];
}

export const TAX_TYPES: Record<TaxTypeId, TaxTypeInfo> = {
  income_tax: {
    id: "income_tax",
    label: "Income tax",
    description: "Tax on what your business earns, filed every quarter and once a year.",
    forms: ["1701Q", "1701A / 1701"],
  },
  percentage_tax: {
    id: "percentage_tax",
    label: "Percentage tax",
    description: "3% of your quarterly sales, for businesses that are not VAT-registered.",
    forms: ["2551Q"],
  },
  vat: {
    id: "vat",
    label: "VAT",
    description: "12% on sales, less the VAT on your purchases, filed every quarter.",
    forms: ["2550Q"],
  },
  withholding: {
    id: "withholding",
    label: "Withholding tax",
    description: "Tax you hold back when you pay rent or contractors, paid to the BIR for them.",
    forms: ["0619-E", "1601-EQ", "1604-E"],
  },
};

export const INCOME_TAX_OPTION_LABEL: Record<IncomeTaxOption, string> = {
  eight_percent: "8% of gross sales",
  graduated_osd: "Graduated rates with the 40% standard deduction (OSD)",
  graduated_itemized: "Graduated rates with itemized deductions",
};

/**
 * The taxes a profile has to file. 8% filers pay no percentage tax (the 8% replaces it), and
 * VAT-registered businesses file VAT instead of percentage tax.
 */
export function taxTypesFor(profile: TaxProfile): TaxTypeId[] {
  const types: TaxTypeId[] = ["income_tax"];
  if (profile.vatRegistered) types.push("vat");
  else if (profile.incomeTaxOption !== "eight_percent") types.push("percentage_tax");
  if (profile.withholdingAgent) types.push("withholding");
  return types;
}

/** "123456789000" or "123-456-789-000" -> "123-456-789-000". Leaves anything else as is. */
export function formatTin(tin: string): string {
  const digits = tin.replace(/\D/g, "");
  if (digits.length < 9) return tin;
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)];
  if (digits.length > 9) parts.push(digits.slice(9));
  return parts.join("-");
}

/** Shows only the last three digits of the 9-digit TIN, for lists other people may see. */
export function maskTin(tin: string): string {
  const digits = tin.replace(/\D/g, "");
  if (digits.length < 9) return "•••";
  return `•••-•••-${digits.slice(6, 9)}`;
}
