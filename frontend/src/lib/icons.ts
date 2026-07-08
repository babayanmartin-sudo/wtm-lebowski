import {
  Banknote,
  Building2,
  Coins,
  CreditCard,
  Landmark,
  PiggyBank,
  Wallet,
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
