import { AppHeader } from "@/components/app-header";
import { PhotoSearchFlow } from "@/components/photo-search-flow";

export default function SearchPage() {
  return (
    <main className="app-page">
      <AppHeader compact />
      <PhotoSearchFlow />
    </main>
  );
}
