import { MainNav } from "@/components/common/main-nav";
import { SiteFooter } from "@/components/common/site-footer";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="container py-5">
          <MainNav />
        </div>
      </header>
      <main className="container flex-1 pt-10">{children}</main>
      <SiteFooter />
    </div>
  );
}
