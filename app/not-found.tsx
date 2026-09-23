import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container flex min-h-screen flex-col items-center justify-center text-center">
      <p className="label mb-6">404</p>
      <h1 className="font-display text-5xl leading-none tracking-tight sm:text-6xl">
        Nothing here
      </h1>
      <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
        This one either never existed or got cut. Both happen a lot around
        here.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:border-accent"
      >
        Back to the start
      </Link>
    </div>
  );
}
