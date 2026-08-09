import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names, with later Tailwind utilities beating earlier ones.
 *
 * Plain clsx would emit "px-4 px-6" and let CSS source order decide, which
 * makes a component's `className` prop unreliable as an override. twMerge
 * resolves the conflict so the caller always wins.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
