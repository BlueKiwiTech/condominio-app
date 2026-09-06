import type { IconType } from "react-icons";
import { HiOutlineHome, HiOutlineBars3 } from "react-icons/hi2";

export const iconLibrary: Record<string, IconType> = {
  home: HiOutlineHome,
  // Once UI's bundled default icon set (dist/icons.js) has no hamburger/menu
  // glyph — extended here rather than adding a second icon package, same
  // pattern already established for "home".
  menu: HiOutlineBars3,
};

export type IconName = keyof typeof iconLibrary;
