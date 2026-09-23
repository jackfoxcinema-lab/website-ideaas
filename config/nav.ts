export interface NavItem {
  title: string;
  href: string;
}

export const mainNav: NavItem[] = [
  { title: "Snippets", href: "/snippets" },
  { title: "Writing", href: "/writing" },
  { title: "About", href: "/about" },
];
