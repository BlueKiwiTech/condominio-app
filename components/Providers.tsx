"use client";

import { style, dataStyle } from "@/resources/once-ui.config";
import {
  LayoutProvider,
  ThemeProvider,
  DataThemeProvider,
  ToastProvider,
  IconProvider,
} from "@once-ui-system/core";
import { iconLibrary } from "@/resources/icons";
import { GlobalToaster } from "@/components/GlobalToaster";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LayoutProvider>
      <ThemeProvider
        theme={style.theme}
        brand={style.brand}
        accent={style.accent}
        neutral={style.neutral}
        solid={style.solid}
        solidStyle={style.solidStyle}
        border={style.border}
        surface={style.surface}
        transition={style.transition}
        scaling={style.scaling}
      >
        <DataThemeProvider {...dataStyle}>
          <ToastProvider>
            <IconProvider icons={iconLibrary}>
              {children}
              <GlobalToaster />
            </IconProvider>
          </ToastProvider>
        </DataThemeProvider>
      </ThemeProvider>
    </LayoutProvider>
  );
}
