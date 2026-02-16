import React from 'react';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  ClipboardList,
  ClipboardCheck,
  Wallet,
  Hand,
  Salad,
  Stethoscope,
  Dumbbell,
  Send,
  Bell,
  Settings,
  BookOpen,
  Moon,
  Sun,
  LogOut,
  Download,
  MessageCircle,
  FileText,
  Check,
  X,
  CircleDot,
  ChevronUp,
  Phone,
} from 'lucide-react';

const ICON_SIZE = 20;
const ICON_SIZE_NAV = 22;
const ICON_SIZE_BN = 24;

export const iconSize = { nav: ICON_SIZE_NAV, bottomNav: ICON_SIZE_BN, default: ICON_SIZE };

/** Wrapper so SVG icons inherit color and size from CSS when needed */
function IconWrap({
  icon: Icon,
  size = ICON_SIZE,
  className = '',
  ...rest
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  size?: number;
  className?: string;
}) {
  return <Icon size={size} className={className} aria-hidden {...rest} />;
}

export const AppIcons = {
  dashboard: () => <IconWrap icon={LayoutDashboard} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  main: () => <IconWrap icon={Users} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  add: () => <IconWrap icon={UserPlus} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  enquiries: () => <IconWrap icon={ClipboardList} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  checkin: () => <IconWrap icon={ClipboardCheck} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  finance: () => <IconWrap icon={Wallet} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  onboarding: () => <IconWrap icon={Hand} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  'nutrition-ai': () => <IconWrap icon={Salad} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  'medical-history': () => <IconWrap icon={Stethoscope} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  'workout-plan': () => <IconWrap icon={Dumbbell} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  telegram: () => <IconWrap icon={Send} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  notifications: () => <IconWrap icon={Bell} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  settings: () => <IconWrap icon={Settings} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  guide: () => <IconWrap icon={BookOpen} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  moon: () => <IconWrap icon={Moon} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  sun: () => <IconWrap icon={Sun} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  logout: () => <IconWrap icon={LogOut} size={ICON_SIZE_NAV} className="nav-icon-svg" />,
  download: () => <IconWrap icon={Download} size={ICON_SIZE} className="icon-svg" />,
  messageCircle: () => <IconWrap icon={MessageCircle} size={ICON_SIZE} className="icon-svg" />,
  fileText: () => <IconWrap icon={FileText} size={ICON_SIZE} className="icon-svg" />,
  check: () => <IconWrap icon={Check} size={ICON_SIZE} className="icon-svg" />,
  x: () => <IconWrap icon={X} size={ICON_SIZE} className="icon-svg" />,
  circleDot: () => <IconWrap icon={CircleDot} size={ICON_SIZE} className="icon-svg" />,
  chevronUp: () => <IconWrap icon={ChevronUp} size={26} className="icon-svg fab-chevron" />,
  phone: () => <IconWrap icon={Phone} size={ICON_SIZE} className="icon-svg" />,
  clipboard: () => <IconWrap icon={ClipboardList} size={ICON_SIZE} className="icon-svg" />,
} as const;

/** Bottom nav uses slightly larger icons */
export const BottomNavIcons = {
  main: () => <IconWrap icon={Users} size={ICON_SIZE_BN} className="bn-icon-svg" />,
  dashboard: () => <IconWrap icon={LayoutDashboard} size={ICON_SIZE_BN} className="bn-icon-svg" />,
  finance: () => <IconWrap icon={Wallet} size={ICON_SIZE_BN} className="bn-icon-svg" />,
  logout: () => <IconWrap icon={LogOut} size={ICON_SIZE_BN} className="bn-icon-svg" />,
} as const;

export type NavIconId = keyof typeof AppIcons;
