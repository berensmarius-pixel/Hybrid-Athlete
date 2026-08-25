import AppShell from "@/components/shell/AppShell";
import AuthGate from "@/components/shell/AuthGate";

export default function Home() {
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  );
}
