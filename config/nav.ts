export interface NavItem {
  title: string;
  href: string;
}

export const mainNav: NavItem[] = [
  { title: "Songs", href: "/songs" },
  { title: "World", href: "/world" },
  { title: "Writing", href: "/writing" },
  { title: "About", href: "/about" },
];
