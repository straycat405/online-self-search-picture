import { AppHeader } from "@/components/app-header";
import { SafeUploadFlow } from "@/components/safe-upload-flow";

export default function ProtectPage() {
  return (
    <main className="app-page">
      <AppHeader compact />
      <SafeUploadFlow />
    </main>
  );
}
