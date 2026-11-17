import { SavedApplication } from "@/components/saved-application";
import { SiteHeader } from "@/components/site-header";
export default async function SavedApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="shell">
      <SiteHeader />
      <main id="main">
        <SavedApplication id={id} />
      </main>
    </div>
  );
}
