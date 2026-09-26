"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // Without this, toggling repaints ~200 elements through a transition.
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
