import {
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiChevronRight,
  FiClock,
  FiCopy,
  FiExternalLink,
  FiHome,
  FiMapPin,
  FiMenu,
  FiMinus,
  FiPackage,
  FiPhone,
  FiPlus,
  FiRefreshCw,
  FiSend,
  FiShield,
  FiShoppingBag,
  FiTruck,
  FiUser,
  FiX,
} from "react-icons/fi";

type IconName =
  | "bag"
  | "arrow"
  | "back"
  | "truck"
  | "package"
  | "user"
  | "close"
  | "check"
  | "clock"
  | "copy"
  | "pin"
  | "chevron"
  | "refresh"
  | "phone"
  | "external"
  | "menu"
  | "shield"
  | "send"
  | "home"
  | "plus"
  | "minus";
const icons = {
  bag: FiShoppingBag,
  arrow: FiArrowRight,
  back: FiArrowLeft,
  truck: FiTruck,
  package: FiPackage,
  user: FiUser,
  close: FiX,
  check: FiCheck,
  clock: FiClock,
  copy: FiCopy,
  pin: FiMapPin,
  chevron: FiChevronRight,
  refresh: FiRefreshCw,
  phone: FiPhone,
  external: FiExternalLink,
  menu: FiMenu,
  shield: FiShield,
  send: FiSend,
  home: FiHome,
  plus: FiPlus,
  minus: FiMinus,
};

export default function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const Symbol = icons[name];
  return (
    <Symbol
      className={className}
      size={size}
      aria-hidden="true"
      focusable="false"
    />
  );
}
