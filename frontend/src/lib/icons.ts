import {
  Banknote,
  Baby,
  Briefcase,
  Building2,
  Car,
  Coins,
  CreditCard,
  Dumbbell,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  PawPrint,
  PiggyBank,
  Plane,
  Receipt,
  ShoppingBag,
  Tag,
  TrendingUp,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const ACCOUNT_ICONS: Record<string, LucideIcon> = {
  wallet: Wallet,
  bank: Landmark,
  card: CreditCard,
  savings: PiggyBank,
  cash: Banknote,
  coins: Coins,
  building: Building2,
};

export const ACCOUNT_ICON_KEYS = Object.keys(ACCOUNT_ICONS);

export function getAccountIcon(icon: string): LucideIcon {
  return ACCOUNT_ICONS[icon] ?? Wallet;
}

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  tag: Tag,
  shopping: ShoppingBag,
  food: Utensils,
  home: Home,
  car: Car,
  health: HeartPulse,
  travel: Plane,
  fun: Gamepad2,
  work: Briefcase,
  education: GraduationCap,
  gift: Gift,
  bills: Wifi,
  fitness: Dumbbell,
  family: Baby,
  pet: PawPrint,
  maintenance: Wrench,
  income: TrendingUp,
  budget: PiggyBank,
  receipt: Receipt,
};

export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICONS);

export function getCategoryIcon(icon: string): LucideIcon {
  return CATEGORY_ICONS[icon] ?? Tag;
}
