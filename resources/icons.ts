import type { IconType } from "react-icons";
import { HiOutlineHome, HiOutlineBars3, HiOutlineArrowRightOnRectangle } from "react-icons/hi2";

export const iconLibrary: Record<string, IconType> = {
  home: HiOutlineHome,
  // Once UI's bundled default icon set (dist/icons.js) has no hamburger/menu
  // glyph — extended here rather than adding a second icon package, same
  // pattern already established for "home".
  menu: HiOutlineBars3,
  // No logout/sign-out glyph in the bundled set either — used by
  // ResidentTabBar's 4th "Cerrar sesión" tab.
  logout: HiOutlineArrowRightOnRectangle,
};

export type IconName = keyof typeof iconLibrary;
