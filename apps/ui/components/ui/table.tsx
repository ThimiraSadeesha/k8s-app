import { cn } from "@/lib/utils";

export const Table = (p: React.HTMLAttributes<HTMLTableElement>) => (
  <div className="overflow-x-auto"><table className="w-full text-left text-sm" {...p} /></div>
);
export const Th = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("border-b border-border px-5 py-2.5 text-xs font-medium text-muted", className)} {...p} />
);
export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("border-b border-border px-5 py-3 align-top", className)} {...p} />
);
