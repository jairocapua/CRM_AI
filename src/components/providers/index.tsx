import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./theme-provider";

export function Providers({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ThemeProvider>
      <TooltipProvider delay={300}>{children}</TooltipProvider>
      <Toaster position="bottom-right" />
    </ThemeProvider>
  );
}
