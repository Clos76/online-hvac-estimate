import { SupabaseClient } from "@supabase/supabase-js";

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface HVACEstimateInput {
  zipCode: string;
  systemType: string; // 'ac_only', 'ac_furnace_80', 'ac_furnace_90', 'heat_pump', 'gas_furnace_only'
  homeSize: string; // 'small', 'medium', 'large', 'xlarge'
  numSystems: number;
}

export interface EquipmentOption {
  tier: "silver" | "gold" | "platinum";
  equipment: any[];
  equipmentSubtotal: number;
  installationCost: number;
  permitsFees: number;
  discountAmount: number;
  totalPrice: number;
  monthlyPayment: number;
  appliedPromotions: any[];
  potentialRebates: any[];
  features: string[];
}

export interface HVACEstimateResult {
  options: EquipmentOption[];
  zone: any;
  availablePromotions: any[];
  availableRebates: any[];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getTonnageForHomeSize(homeSize: string): number {
  const tonnageMap: Record<string, number> = {
    small: 2.5, // Under 1,600 sqft
    medium: 3.5, // 1,600-2,400 sqft
    large: 4.5, // 2,400-3,600 sqft
    xlarge: 5.0, // Over 3,600 sqft
  };
  return tonnageMap[homeSize] || 3.0;
}

function getCategoriesForSystemType(systemType: string): string[] {
  const categoryMap: Record<string, string[]> = {
    ac_only: ["air_conditioner"],
    ac_furnace_80: ["air_conditioner", "furnace"],
    ac_furnace_90: ["air_conditioner", "furnace"],
    heat_pump: ["heat_pump", "air_handler"],
    gas_furnace_only: ["furnace"],
  };
  return categoryMap[systemType] || ["air_conditioner"];
}

function calculateMonthlyPayment(
  principal: number,
  annualRate: number = 0.0999, // 9.99% APR
  termMonths: number = 120, // 10 years
): number {
  const monthlyRate = annualRate / 12;
  const payment =
    (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
  return Math.round(payment);
}

function filterEquipmentByTonnage(
  equipment: any[],
  targetTonnage: number,
  tolerance: number = 0.5,
): any[] {
  return equipment.filter((item) => {
    if (!item.tonnage) return true; // Air handlers don't have tonnage
    return Math.abs(item.tonnage - targetTonnage) <= tolerance;
  });
}

function applyPromotions(
  subtotal: number,
  tier: string,
  systemType: string,
  promotions: any[],
): { discountAmount: number; appliedPromotions: any[] } {
  let totalDiscount = 0;
  const applied: any[] = [];

  for (const promo of promotions) {
    const tierMatch =
      !promo.applicable_tiers || promo.applicable_tiers.includes(tier);
    const amountMatch =
      !promo.min_purchase_amount || subtotal >= promo.min_purchase_amount;

    if (tierMatch && amountMatch) {
      let discount = 0;

      if (promo.discount_type === "percentage") {
        discount = subtotal * (promo.discount_value / 100);
      } else if (promo.discount_type === "fixed_amount") {
        discount = promo.discount_value;
      } else if (promo.discount_type === "tiered") {
        // For tiered, use max value as placeholder
        discount = promo.discount_value;
      }

      totalDiscount += discount;
      applied.push({
        id: promo.id,
        name: promo.name,
        description: promo.description,
        discount: Math.round(discount),
      });
    }
  }

  return {
    discountAmount: Math.round(totalDiscount),
    appliedPromotions: applied,
  };
}

function findApplicableRebates(
  systemType: string,
  tier: string,
  rebates: any[],
): any[] {
  const categories = getCategoriesForSystemType(systemType);

  return rebates
    .filter((rebate) => {
      const systemMatch =
        !rebate.applicable_systems ||
        rebate.applicable_systems.some((sys: string) =>
          categories.includes(sys),
        );

      const tierMatch =
        !rebate.applicable_tiers || rebate.applicable_tiers.includes(tier);

      return systemMatch && tierMatch;
    })
    .map((rebate) => ({
      id: rebate.id,
      program_name: rebate.program_name,
      provider: rebate.provider,
      description: rebate.description,
      estimated_amount: rebate.estimated_amount,
      rebate_type: rebate.rebate_type,
      disclaimer: rebate.disclaimer,
      external_url: rebate.external_url,
      is_stackable: rebate.is_stackable,
    }));
}

// ============================================
// MAIN CALCULATOR FUNCTION
// ============================================

export async function calculateHVACEstimate(
  supabase: SupabaseClient,
  tenantId: string,
  input: HVACEstimateInput,
): Promise<HVACEstimateResult> {
  // STEP 1: RESOLVE PRICING ZONE
  const { data: zone, error: zoneError } = await supabase
    .from("hvac_pricing_zones")
    .select("*")
    .eq("tenant_id", tenantId)
    .contains("zip_codes", [input.zipCode])
    .eq("is_serviceable", true)
    .single();

  if (zoneError || !zone) {
    throw new Error(
      `Service not available in ZIP code ${input.zipCode}. Please contact us for assistance.`,
    );
  }

  // STEP 2: GET ALL ACTIVE EQUIPMENT
  const { data: allEquipment, error: equipError } = await supabase
    .from("hvac_equipment")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("tier", { ascending: true })
    .order("tonnage", { ascending: true });

  if (equipError || !allEquipment || allEquipment.length === 0) {
    throw new Error("Unable to load equipment catalog. Please try again.");
  }

  // STEP 3: GET ACTIVE PROMOTIONS
  const now = new Date().toISOString();
  const { data: promotions } = await supabase
    .from("hvac_promotions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .lte("valid_from", now)
    .gte("valid_until", now);

  // STEP 4: GET ACTIVE REBATES
  const { data: rebates } = await supabase
    .from("hvac_rebates")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .or(`valid_until.is.null,valid_until.gte.${now}`);

  // STEP 5: DETERMINE REQUIRED EQUIPMENT
  const requiredCategories = getCategoriesForSystemType(input.systemType);
  const targetTonnage = getTonnageForHomeSize(input.homeSize);

  // STEP 6: BUILD OPTIONS FOR EACH TIER
  const tiers: Array<"silver" | "gold" | "platinum"> = [
    "silver",
    "gold",
    "platinum",
  ];
  const options: EquipmentOption[] = [];

  for (const tier of tiers) {
    // Filter equipment by tier and category
    const tierEquipment = allEquipment.filter(
      (e) => e.tier === tier && requiredCategories.includes(e.category),
    );

    if (tierEquipment.length === 0) continue;

    // Group by category to select one item per category
    const selectedEquipment: any[] = [];
    const equipmentByCategory = new Map<string, any[]>();

    tierEquipment.forEach((item) => {
      if (!equipmentByCategory.has(item.category)) {
        equipmentByCategory.set(item.category, []);
      }
      equipmentByCategory.get(item.category)!.push(item);
    });

    // Select best match for each category
    for (const category of requiredCategories) {
      const categoryItems = equipmentByCategory.get(category) || [];

      if (categoryItems.length === 0) {
        console.warn(`No ${category} found for ${tier} tier`);
        continue;
      }

      // Filter by tonnage if applicable
      const filtered = filterEquipmentByTonnage(categoryItems, targetTonnage);

      // Select first match (or closest tonnage)
      const selected = filtered.length > 0 ? filtered[0] : categoryItems[0];
      selectedEquipment.push(selected);
    }

    if (selectedEquipment.length === 0) continue;

    // CALCULATE COSTS
    let equipmentSubtotal = 0;
    let installationCost = 0;
    const features: Set<string> = new Set();

    for (const item of selectedEquipment) {
      equipmentSubtotal += item.base_price * input.numSystems;
      installationCost += item.installation_cost * input.numSystems;

      // Collect features
      if (item.features) {
        Object.keys(item.features).forEach((f) => {
          if (item.features[f]) features.add(f);
        });
      }
    }

    // Apply zone adjustments
    const laborMultiplier = zone.labor_multiplier || 1.0;
    equipmentSubtotal *= laborMultiplier;
    installationCost *= laborMultiplier;

    // Add fees (only once, not per system)
    const permitsFees = (zone.permit_fee || 0) + (zone.disposal_fee || 0);

    // Calculate subtotal before discounts
    const subtotal = equipmentSubtotal + installationCost + permitsFees;

    // Apply promotions
    const { discountAmount, appliedPromotions } = applyPromotions(
      subtotal,
      tier,
      input.systemType,
      promotions || [],
    );

    // Find applicable rebates
    const potentialRebates = findApplicableRebates(
      input.systemType,
      tier,
      rebates || [],
    );

    // Calculate final price
    const totalPrice = subtotal - discountAmount;
    const monthlyPayment = calculateMonthlyPayment(totalPrice);

    options.push({
      tier,
      equipment: selectedEquipment,
      equipmentSubtotal: Math.round(equipmentSubtotal),
      installationCost: Math.round(installationCost),
      permitsFees: Math.round(permitsFees),
      discountAmount,
      totalPrice: Math.round(totalPrice),
      monthlyPayment,
      appliedPromotions,
      potentialRebates,
      features: Array.from(features),
    });
  }

  if (options.length === 0) {
    throw new Error(
      "No equipment configurations available for your requirements. Please contact us.",
    );
  }

  return {
    options,
    zone,
    availablePromotions: promotions || [],
    availableRebates: rebates || [],
  };
}
