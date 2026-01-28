import { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { HVACEstimator } from "@/src/components/hvac/HVACEstimator";

export const revalidate = 60;

function createSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function generateStaticParams() {
  const supabase = createSupabaseClient();

  const { data: pages } = await supabase
    .from("landing_pages")
    .select("slug")
    .eq("is_active", true);

  return pages?.map((page: any) => ({ slug: page.slug })) || [];
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const supabase = createSupabaseClient();

  const { data: page } = await supabase
    .from("landing_pages")
    .select("seo_config")
    .eq("slug", params.slug)
    .single();

  const seo = page?.seo_config || {};

  return {
    title: seo.title || "Get a Free Quote",
    description: seo.description,
    keywords: seo.keywords,
  };
}

export default async function LandingPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createSupabaseClient();

  const { data: page, error } = await supabase
    .from("landing_pages")
    .select("client_id, schema_config, seo_config")
    .eq("slug", params.slug)
    .eq("is_active", true)
    .single();

  if (error || !page) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Page Not Found</h1>
          <p className="text-gray-600">
            The page you're looking for doesn't exist.
          </p>
        </div>
      </div>
    );
  }

  const isHVACEstimator = page.schema_config?.type === "hvac_estimator";

  return (
    <main className="min-h-screen">
      {isHVACEstimator ? (
        <>
          <section className="bg-gradient-to-br from-blue-600 to-blue-700 text-white py-16">
            <div className="container mx-auto px-4 text-center">
              <h1 className="text-4xl md:text-6xl font-bold mb-4">
                {page.seo_config?.title || "Get Your Free HVAC Estimate"}
              </h1>
              <p className="text-xl md:text-2xl opacity-90">
                {page.seo_config?.description || "Instant pricing in 2 minutes"}
              </p>
            </div>
          </section>

          <HVACEstimator
            clientId={page.client_id}
            schemaConfig={page.schema_config}
          />
        </>
      ) : (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-600">Lead form (not HVAC estimator)</p>
        </div>
      )}
    </main>
  );
}
