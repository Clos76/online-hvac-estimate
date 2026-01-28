import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { calculateHVACEstimate } from "../_shared/hvac-calculator.ts";

// ============================================
// VALIDATION SCHEMAS
// ============================================

const HVACLeadSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/)
    .optional(),
  customFields: z
    .object({
      zip_code: z.string().regex(/^\d{5}$/),
      system_type: z.enum([
        "ac_only",
        "ac_furnace_80",
        "ac_furnace_90",
        "heat_pump",
        "gas_furnace_only",
      ]),
      home_size: z.enum(["small", "medium", "large", "xlarge"]),
      num_systems: z.number().int().min(1).max(2).default(1),
      selected_tier: z.enum(["silver", "gold", "platinum"]).optional(),
    })
    .passthrough(),
  honeypot: z.string().max(0),
  timestamp: z.number(),
  source: z.string().optional(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();

    // Resolve landing page
    const { data: landingPage, error: lpError } = await supabase
      .from("landing_pages")
      .select(
        `
        id,
        tenant_id,
        schema_config,
        tenants (
          id,
          rate_limit_per_hour
        )
      `,
      )
      .eq("client_id", body.clientId)
      .eq("is_active", true)
      .single();

    if (lpError || !landingPage) {
      return new Response(JSON.stringify({ error: "Invalid client ID" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let validated: any;
    let estimate: any = null;

    // HVAC-specific handling
    if (landingPage.schema_config?.type === "hvac_estimator") {
      validated = HVACLeadSchema.parse(body);

      // CALCULATE ESTIMATE
      try {
        estimate = await calculateHVACEstimate(
          supabase,
          landingPage.tenant_id,
          {
            zipCode: validated.customFields.zip_code,
            systemType: validated.customFields.system_type,
            homeSize: validated.customFields.home_size,
            numSystems: validated.customFields.num_systems || 1,
          },
        );

        // Enrich custom fields
        const selectedTier = validated.customFields.selected_tier || "silver";
        const selectedOption = estimate.options.find(
          (o: any) => o.tier === selectedTier,
        );

        validated.customFields.estimate = estimate;
        validated.customFields.estimated_value =
          selectedOption?.totalPrice || estimate.options[0]?.totalPrice;
        validated.customFields.selected_option =
          selectedOption || estimate.options[0];
      } catch (estimateError) {
        console.error("Estimate calculation error:", estimateError);
        return new Response(
          JSON.stringify({
            error: estimateError.message || "Unable to calculate estimate",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Rate limiting
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", landingPage.tenant_id)
      .eq("ip_address", clientIp)
      .gte("created_at", oneHourAgo);

    const rateLimit = landingPage.tenants?.rate_limit_per_hour || 5;

    if (count && count >= rateLimit) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded. Please try again later.",
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // CREATE LEAD
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        tenant_id: landingPage.tenant_id,
        landing_page_id: landingPage.id,
        name: validated.name,
        email: validated.email,
        phone: validated.phone,
        custom_fields: validated.customFields,
        source: validated.source || "hvac_estimator",
        ip_address: clientIp,
        user_agent: req.headers.get("user-agent"),
      })
      .select()
      .single();

    if (leadError) {
      console.error("Lead insert error:", leadError);
      throw new Error("Failed to create lead");
    }

    // SAVE HVAC ESTIMATE
    if (estimate) {
      const selectedTier = validated.customFields.selected_tier || "silver";
      const selectedOption =
        estimate.options.find((o: any) => o.tier === selectedTier) ||
        estimate.options[0];

      await supabase.from("hvac_estimates").insert({
        tenant_id: landingPage.tenant_id,
        lead_id: lead.id,
        source: "hvac_estimator",
        zip_code: validated.customFields.zip_code,
        home_size_category: validated.customFields.home_size,
        system_type: validated.customFields.system_type,
        num_systems: validated.customFields.num_systems || 1,
        selected_equipment: selectedOption.equipment,
        equipment_subtotal: selectedOption.equipmentSubtotal,
        installation_cost: selectedOption.installationCost,
        permits_fees: selectedOption.permitsFees,
        discount_amount: selectedOption.discountAmount,
        total_price: selectedOption.totalPrice,
        monthly_payment: selectedOption.monthlyPayment,
        financing_apr: 0.0999,
        financing_term_months: 120,
        selected_tier: selectedTier,
        applied_promotions: selectedOption.appliedPromotions,
        potential_rebates: selectedOption.potentialRebates,
      });
    }

    // Log event
    await supabase.from("lead_events").insert({
      tenant_id: landingPage.tenant_id,
      lead_id: lead.id,
      event_type: "created",
      payload: {
        source: "hvac_estimator",
        ip: clientIp,
        has_estimate: !!estimate,
      },
    });

    // SUCCESS RESPONSE
    return new Response(
      JSON.stringify({
        success: true,
        leadId: lead.id,
        estimate: estimate,
        message: "Thank you! We'll contact you within 24 hours.",
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Lead ingestion error:", error);

    if (error.name === "ZodError") {
      return new Response(
        JSON.stringify({
          error: "Invalid input",
          details: error.errors,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ error: "An error occurred. Please try again." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
