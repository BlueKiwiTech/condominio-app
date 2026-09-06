import type { IconType } from "react-icons";
import { HiOutlineHome } from "react-icons/hi2";

export const iconLibrary: Record<string, IconType> = {
  home: HiOutlineHome,
};

export type IconName = keyof typeof iconLibrary;
