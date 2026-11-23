import { forwardRef, memo, type ReactNode, type SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

const BaseIcon = forwardRef<SVGSVGElement, IconProps>(({ size = 24, children, ...props }, ref) => (
  <svg
    ref={ref}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
));
BaseIcon.displayName = "BaseIcon";

const createIcon = (children: ReactNode, displayName: string) => {
  const Icon = memo(forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <BaseIcon ref={ref} {...props}>{children}</BaseIcon>
  )));
  Icon.displayName = displayName;
  return Icon;
};

/* Gothic satchel — leather bag with strap + buckle */
export const ShoppingBagIcon = createIcon(
  <>
    <path d="M4.5 8h15l-1 12a2 2 0 0 1-2 1.8H7.5a2 2 0 0 1-2-1.8L4.5 8Z" />
    <path d="M8 8V6.2A4 4 0 0 1 12 2.2 4 4 0 0 1 16 6.2V8" />
    <path d="M9 12h6" />
    <circle cx="12" cy="14.4" r="0.8" fill="currentColor" stroke="none" />
  </>,
  "ShoppingBagIcon"
);

/* Gothic bars — three bars with pointed ends (spear tips) */
export const MenuIcon = createIcon(
  <>
    <path d="M3 7h15l2 0" />
    <path d="M3 12h13l4 0" />
    <path d="M3 17h17l0 0" />
    <path d="m20 7 1.5-0" />
    <path d="m20 17 1.5-0" />
  </>,
  "MenuIcon"
);

/* Cross-shaped close */
export const XIcon = createIcon(
  <>
    <path d="M12 4v16" />
    <path d="M4 12h16" />
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" opacity="0.35" />
  </>,
  "XIcon"
);

export const FacebookIcon = createIcon(
  <path d="M13 20v-6h2.2l.3-2H13V10.7c0-.6.2-1.2 1.2-1.2H15V7.3c-.2 0-.8-.1-1.6-.1-1.6 0-2.7 1-2.7 2.9V12H9v2h1.7v6" />,
  "FacebookIcon"
);

export const InstagramIcon = createIcon(
  <>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
  </>,
  "InstagramIcon"
);

export const TwitterIcon = createIcon(
  <path d="M20 6.5c-.6.3-1.3.5-2 .6.7-.4 1.2-1 1.5-1.8-.7.4-1.5.7-2.3.9A3.4 3.4 0 0 0 11.4 9c0 .3 0 .6.1.9-2.8-.1-5.4-1.5-7-3.6-.3.5-.5 1-.5 1.7 0 1.2.6 2.2 1.5 2.8-.6 0-1.1-.2-1.5-.4v.1c0 1.6 1.1 3 2.7 3.3-.3.1-.7.2-1 .2-.3 0-.5 0-.7-.1.5 1.3 1.7 2.2 3.2 2.2A6.8 6.8 0 0 1 4 17.5 9.6 9.6 0 0 0 9.2 19c6.2 0 9.7-5.4 9.7-10.1v-.5c.7-.5 1.3-1.1 1.8-1.9Z" />,
  "TwitterIcon"
);

/* Ornate magnifying glass — extra ring detail */
export const SearchIcon = createIcon(
  <>
    <circle cx="11" cy="11" r="7" />
    <circle cx="11" cy="11" r="4.2" opacity="0.35" />
    <path d="m20 20-3.5-3.5" />
    <path d="m20.5 20.5-.6.6" />
  </>,
  "SearchIcon"
);

export const ChevronDownIcon = createIcon(<path d="m6 9 6 6 6-6" />, "ChevronDownIcon");
export const ChevronUpIcon = createIcon(<path d="m18 15-6-6-6 6" />, "ChevronUpIcon");
export const CircleIcon = createIcon(<circle cx="12" cy="12" r="10" />, "CircleIcon");
export const DotIcon = createIcon(<circle cx="12.1" cy="12.1" r="1" fill="currentColor" stroke="none" />, "DotIcon");
export const ArrowRightIcon = createIcon(<path d="M5 12h14" />, "ArrowRightIcon");
export const ArrowLeftIcon = createIcon(<path d="M19 12H5" />, "ArrowLeftIcon");
export const MinusIcon = createIcon(<path d="M5 12h14" />, "MinusIcon");
export const PlusIcon = createIcon(<><path d="M12 5v14" /><path d="M5 12h14" /></>, "PlusIcon");
export const CheckIcon = createIcon(<path d="m5 12 4 4L19 6" />, "CheckIcon");
export const TruckIcon = createIcon(
  <>
    <path d="M3 7h11v8H3z" />
    <path d="M14 10h3l3 3v2h-6" />
    <circle cx="7.5" cy="17.5" r="1.5" />
    <circle cx="17.5" cy="17.5" r="1.5" />
  </>,
  "TruckIcon"
);

export const TagIcon = createIcon(
  <>
    <path d="M20 10 12 18 4 10V4h6Z" />
    <circle cx="8.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
  </>,
  "TagIcon"
);

export const GiftIcon = createIcon(
  <>
    <path d="M4 10h16v10H4z" />
    <path d="M12 10v10" />
    <path d="M4 10h16" />
    <path d="M12 10H8.5a2.5 2.5 0 1 1 0-5c2 0 3.5 2.3 3.5 5Z" />
    <path d="M12 10h3.5a2.5 2.5 0 1 0 0-5C13.5 5 12 7.3 12 10Z" />
  </>,
  "GiftIcon"
);

export const SparklesIcon = createIcon(
  <>
    <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z" />
    <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z" />
    <path d="m5 14 .7 1.8L7.5 16l-1.8.7L5 18.5l-.7-1.8L2.5 16l1.8-.2Z" />
  </>,
  "SparklesIcon"
);

export const PartyPopperIcon = createIcon(
  <>
    <path d="M5 19c6-1 9-4 12-12l2 2c-2 7-5 10-12 12Z" />
    <path d="m15 5 1-2" />
    <path d="m18 7 2-1" />
    <path d="m17 10 2 1" />
  </>,
  "PartyPopperIcon"
);

export const ZapIcon = createIcon(
  <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
  "ZapIcon"
);

export const ShieldCheckIcon = createIcon(
  <>
    <path d="M12 2s-6 2-6 8v5l6 4 6-4V10c0-6-6-8-6-8Z" />
    <path d="m9 12 2 2 4-4" />
  </>,
  "ShieldCheckIcon"
);

export const CheckCircleIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </>,
  "CheckCircleIcon"
);

export const ClockIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </>,
  "ClockIcon"
);

/* Treasure chest — for packages/orders */
export const PackageIcon = createIcon(
  <>
    <path d="M3 10h18v10H3z" />
    <path d="M3 10a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4" />
    <path d="M3 14h18" />
    <path d="M10.5 12.5h3v3h-3z" />
    <path d="M12 6v4" />
  </>,
  "PackageIcon"
);

/* Wax-sealed envelope */
export const MailIcon = createIcon(
  <>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    <circle cx="18" cy="17" r="2" fill="currentColor" stroke="none" opacity="0.55" />
  </>,
  "MailIcon"
);

export const PhoneIcon = createIcon(
  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />,
  "PhoneIcon"
);

/* Ancient compass — for address/location */
export const MapPinIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 4v2" />
    <path d="M12 18v2" />
    <path d="M4 12h2" />
    <path d="M18 12h2" />
    <path d="m9.5 9.5 3-3.5 3 3.5-3 8.5-3-8.5Z" fill="currentColor" stroke="none" opacity="0.7" />
  </>,
  "MapPinIcon"
);

export const SendIcon = createIcon(
  <>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="m22 2-11 11" />
  </>,
  "SendIcon"
);

export const ExternalLinkIcon = createIcon(
  <>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6" />
    <path d="m10 14 11-11" />
  </>,
  "ExternalLinkIcon"
);

export const HeartIcon = createIcon(
  <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />,
  "HeartIcon"
);

export const UserIcon = createIcon(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </>,
  "UserIcon"
);

/* Castle — for Home */
export const HomeIcon = createIcon(
  <>
    <path d="M3 21V9l2-1v-2l2 1V6l2-1v3l2-1v3l2-1v-2l2 1v2l2-1v3l2 1v9Z" />
    <path d="M10 21v-5h4v5" />
  </>,
  "HomeIcon"
);

export const InfoIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01" />
    <path d="M11 12h1v5h1" />
  </>,
  "InfoIcon"
);

export const SlidersIcon = createIcon(
  <>
    <path d="M4 6h10" />
    <path d="M18 6h2" />
    <circle cx="16" cy="6" r="2" />
    <path d="M4 12h4" />
    <path d="M12 12h8" />
    <circle cx="10" cy="12" r="2" />
    <path d="M4 18h12" />
    <path d="M20 18h0" />
    <circle cx="18" cy="18" r="2" />
  </>,
  "SlidersIcon"
);

export const StarIcon = createIcon(
  <path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.77 6.1 20.78l1.13-6.58L2.45 9.54l6.6-.96L12 2.6Z" />,
  "StarIcon"
);

export const FilledStarIcon = createIcon(
  <path d="M12 2.6l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.77 6.1 20.78l1.13-6.58L2.45 9.54l6.6-.96L12 2.6Z" fill="currentColor" stroke="none" />,
  "FilledStarIcon"
);

export const PlayIcon = createIcon(
  <path d="M7 4.5v15l13-7.5L7 4.5Z" />,
  "PlayIcon"
);

export const ImageIcon = createIcon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <circle cx="9" cy="9" r="1.6" />
    <path d="m21 16-5-5L4 21" />
  </>,
  "ImageIcon"
);

export const VideoIcon = createIcon(
  <>
    <rect x="2.5" y="6" width="14" height="12" rx="2.5" />
    <path d="m16.5 10 5-3v10l-5-3Z" />
  </>,
  "VideoIcon"
);

export const TypeIcon = createIcon(
  <>
    <path d="M4 6V4h16v2" />
    <path d="M9 20h6" />
    <path d="M12 4v16" />
  </>,
  "TypeIcon"
);

export const ChevronLeftIcon = createIcon(<path d="m15 18-6-6 6-6" />, "ChevronLeftIcon");
export const ChevronRightIcon = createIcon(<path d="m9 18 6-6-6-6" />, "ChevronRightIcon");

export const PauseIcon = createIcon(
  <>
    <rect x="6" y="4.5" width="4" height="15" rx="1" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" />
  </>,
  "PauseIcon"
);

export const Volume2Icon = createIcon(
  <>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
  </>,
  "Volume2Icon"
);

export const VolumeXIcon = createIcon(
  <>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="m17 9 5 6" />
    <path d="m22 9-5 6" />
  </>,
  "VolumeXIcon"
);

export const Maximize2Icon = createIcon(
  <>
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="M21 3l-7 7" />
    <path d="M3 21l7-7" />
  </>,
  "Maximize2Icon"
);


