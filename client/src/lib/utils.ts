import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Normalize a string for case-insensitive search that also works correctly
// with Turkish characters. JavaScript's default `.toLowerCase()` mishandles
// Turkish "İ" (it produces "i" + a combining dot above, which never matches
// a plain "i"). Using `toLocaleLowerCase('tr')` fixes that, but maps "I" to
// the dotless "ı" — so a search for "i" wouldn't match "I". To make every
// 'i'-variant equivalent we additionally collapse "ı" → "i".
//
// Examples (all become "istanbul"):
//   normalizeForSearch("ISTANBUL")  → "istanbul"
//   normalizeForSearch("İSTANBUL")  → "istanbul"
//   normalizeForSearch("Istanbul")  → "istanbul"
//   normalizeForSearch("istanbul")  → "istanbul"
export function normalizeForSearch(value: string | null | undefined): string {
  if (!value) return '';
  return value.toLocaleLowerCase('tr').replace(/ı/g, 'i');
}
