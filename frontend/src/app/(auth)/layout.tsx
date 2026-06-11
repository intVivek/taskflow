import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-bg px-4 py-16">
      {/* Theme toggle — floats top-right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}
