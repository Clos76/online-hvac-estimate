"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Sparkles,
  Award,
} from "lucide-react";

interface Props {
  clientId: string;
  schemaConfig: any;
}

interface StepConfig {
  id: string;
  type: "zip_input" | "radio_cards" | "select" | "radio";
  label: string;
  description?: string;
  options?: Array<{
    value: string | number;
    label: string;
    icon?: string;
    description?: string;
  }>;
}

export function HVACEstimator({ clientId, schemaConfig }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [estimate, setEstimate] = useState<any>(null);
  const [selectedTier, setSelectedTier] = useState<
    "silver" | "gold" | "platinum"
  >("gold");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps: StepConfig[] = schemaConfig.steps || [];
  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const canProceed =
    formData[step?.id] !== undefined && formData[step?.id] !== "";

  const handleNext = () => {
    if (canProceed && currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else if (isLastStep) {
      setCurrentStep(steps.length); // Show contact form
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleInputChange = (stepId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [stepId]: value }));
    setError(null);
  };

  const handleSubmit = async (contactInfo: {
    name: string;
    email: string;
    phone?: string;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest-lead`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            clientId,
            ...contactInfo,
            customFields: {
              ...formData,
              selected_tier: selectedTier,
            },
            honeypot: "",
            timestamp: Date.now(),
            source: "hvac_estimator",
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Submission failed");
      }

      setEstimate(result.estimate);
      setCurrentStep(steps.length + 1); // Show results
    } catch (err: any) {
      console.error("Submission error:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50">
      <div className="container mx-auto px-4 py-8 md:py-12">
        {/* Progress Bar */}
        {currentStep < steps.length && (
          <div className="max-w-3xl mx-auto mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Step {currentStep + 1} of {steps.length}
              </span>
              <span className="text-sm text-gray-500">⏱ ~2 minutes</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-600 to-orange-500"
                initial={{ width: 0 }}
                animate={{
                  width: `${((currentStep + 1) / steps.length) * 100}%`,
                }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
          </div>
        )}

        {/* Question Steps */}
        <AnimatePresence mode="wait">
          {currentStep < steps.length && step && (
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
              className="max-w-3xl mx-auto"
            >
              <div className="bg-white rounded-3xl shadow-xl p-6 md:p-10">
                <div className="mb-8">
                  <h2 className="text-3xl md:text-4xl font-bold mb-3 text-gray-900">
                    {step.label}
                  </h2>
                  {step.description && (
                    <p className="text-gray-600 text-lg">{step.description}</p>
                  )}
                </div>

                <div className="mb-8">
                  {step.type === "zip_input" && (
                    <ZipCodeInput
                      value={formData[step.id] || ""}
                      onChange={(value) => handleInputChange(step.id, value)}
                    />
                  )}

                  {step.type === "radio_cards" && (
                    <RadioCards
                      options={step.options || []}
                      value={formData[step.id]}
                      onChange={(value) => {
                        handleInputChange(step.id, value);
                        setTimeout(handleNext, 400);
                      }}
                    />
                  )}

                  {step.type === "select" && (
                    <Select
                      options={step.options || []}
                      value={formData[step.id] || ""}
                      onChange={(value) => handleInputChange(step.id, value)}
                    />
                  )}

                  {step.type === "radio" && (
                    <RadioButtons
                      options={step.options || []}
                      value={formData[step.id]}
                      onChange={(value) => handleInputChange(step.id, value)}
                    />
                  )}
                </div>

                <div className="flex gap-3">
                  {currentStep > 0 && (
                    <button
                      onClick={handleBack}
                      className="px-6 py-3 rounded-xl border-2 border-gray-300 hover:bg-gray-50 font-medium transition-colors flex items-center gap-2"
                    >
                      <ChevronLeft size={20} />
                      Back
                    </button>
                  )}
                  <button
                    onClick={handleNext}
                    disabled={!canProceed}
                    className="flex-1 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-semibold hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {isLastStep ? "See My Estimate" : "Continue"}
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Contact Form */}
          {currentStep === steps.length && (
            <ContactForm
              onSubmit={handleSubmit}
              loading={loading}
              error={error}
              formData={formData}
            />
          )}

          {/* Estimate Results */}
          {currentStep === steps.length + 1 && estimate && (
            <EstimateResults
              estimate={estimate}
              selectedTier={selectedTier}
              onSelectTier={setSelectedTier}
              formData={formData}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function ZipCodeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <input
      type="text"
      maxLength={5}
      placeholder="Enter your ZIP code"
      value={value}
      onChange={(e) => {
        const numericValue = e.target.value.replace(/\D/g, "");
        onChange(numericValue);
      }}
      className="w-full text-2xl md:text-3xl px-6 py-5 border-2 border-gray-300 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none"
      autoFocus
    />
  );
}

function RadioCards({
  options,
  value,
  onChange,
}: {
  options: any[];
  value: any;
  onChange: (val: any) => void;
}) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <motion.button
            key={option.value}
            onClick={() => onChange(option.value)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`relative p-6 rounded-2xl border-2 transition-all text-left ${
              isSelected
                ? "border-blue-500 bg-blue-50 shadow-lg ring-2 ring-blue-200"
                : "border-gray-200 hover:border-gray-300 hover:shadow-md"
            }`}
          >
            {isSelected && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-3 right-3 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center"
              >
                <Check size={16} className="text-white" />
              </motion.div>
            )}

            {option.icon && <div className="text-5xl mb-3">{option.icon}</div>}

            <div className="text-lg font-semibold text-gray-900 mb-1">
              {option.label}
            </div>

            {option.description && (
              <div className="text-sm text-gray-600">{option.description}</div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

function Select({
  options,
  value,
  onChange,
}: {
  options: any[];
  value: any;
  onChange: (val: any) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-xl px-6 py-4 border-2 border-gray-300 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none bg-white"
    >
      <option value="">Select an option...</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function RadioButtons({
  options,
  value,
  onChange,
}: {
  options: any[];
  value: any;
  onChange: (val: any) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`px-6 py-4 rounded-xl border-2 transition-all text-left font-medium ${
              isSelected
                ? "border-blue-500 bg-blue-50 text-blue-900"
                : "border-gray-200 hover:border-gray-300 text-gray-700"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  isSelected ? "border-blue-500" : "border-gray-300"
                }`}
              >
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-3 h-3 rounded-full bg-blue-500"
                  />
                )}
              </div>
              {option.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ContactForm({
  onSubmit,
  loading,
  error,
  formData,
}: {
  onSubmit: (data: any) => void;
  loading: boolean;
  error: string | null;
  formData: any;
}) {
  const [localData, setLocalData] = useState({
    name: "",
    email: "",
    phone: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(localData);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto"
    >
      <div className="bg-white rounded-3xl shadow-xl p-8 md:p-12">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-full font-medium mb-4">
            <Check size={18} />
            Almost Done!
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">
            Get Your Personalized Estimate
          </h2>
          <p className="text-gray-600 text-lg">
            See pricing for your {formData.home_size} home in{" "}
            {formData.zip_code}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Full Name *
            </label>
            <input
              type="text"
              required
              disabled={loading}
              value={localData.name}
              onChange={(e) =>
                setLocalData({ ...localData, name: e.target.value })
              }
              className="w-full px-6 py-4 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none disabled:bg-gray-50"
              placeholder="John Smith"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address *
            </label>
            <input
              type="email"
              required
              disabled={loading}
              value={localData.email}
              onChange={(e) =>
                setLocalData({ ...localData, email: e.target.value })
              }
              className="w-full px-6 py-4 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none disabled:bg-gray-50"
              placeholder="john@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              disabled={loading}
              value={localData.phone}
              onChange={(e) =>
                setLocalData({ ...localData, phone: e.target.value })
              }
              className="w-full px-6 py-4 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none disabled:bg-gray-50"
              placeholder="+1 (555) 123-4567"
            />
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 border-2 border-red-200 rounded-xl p-4"
            >
              <p className="text-red-700 font-medium">{error}</p>
            </motion.div>
          )}

          <button
            type="submit"
            disabled={loading || !localData.name || !localData.email}
            className="w-full py-5 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-semibold text-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Calculating Your Estimate...
              </>
            ) : (
              <>
                View My Estimate
                <ChevronRight size={22} />
              </>
            )}
          </button>

          <p className="text-xs text-gray-500 text-center mt-4">
            By submitting, you agree to receive calls and texts about your
            estimate.
          </p>
        </form>
      </div>
    </motion.div>
  );
}

function EstimateResults({
  estimate,
  selectedTier,
  onSelectTier,
  formData,
}: {
  estimate: any;
  selectedTier: string;
  onSelectTier: (tier: any) => void;
  formData: any;
}) {
  const options = estimate.options || [];
  const selectedOption = options.find((o: any) => o.tier === selectedTier);

  // Calculate total potential rebates
  const totalRebates =
    selectedOption?.potentialRebates?.reduce(
      (sum: number, rebate: any) => sum + (rebate.estimated_amount || 0),
      0,
    ) || 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-7xl mx-auto"
    >
      {/* Header */}
      <div className="text-center mb-12">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2 }}
          className="inline-flex items-center gap-2 px-5 py-2 bg-green-100 text-green-800 rounded-full font-semibold mb-6 text-lg"
        >
          <Check size={22} />
          Your Estimate is Ready!
        </motion.div>

        <h2 className="text-4xl md:text-5xl font-bold mb-4">
          Choose Your System
        </h2>

        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Professional installation included • 10-year warranty
          {selectedOption?.appliedPromotions?.length > 0 && (
            <span className="text-green-600 font-semibold">
              {" • "}Save ${selectedOption.discountAmount.toLocaleString()}
            </span>
          )}
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        {options.map((option: any, index: number) => (
          <PricingCard
            key={option.tier}
            option={option}
            isSelected={selectedTier === option.tier}
            onSelect={() => onSelectTier(option.tier)}
            isPopular={option.tier === "gold"}
            delay={index * 0.1}
          />
        ))}
      </div>

      {/* Rebates Section */}
      {selectedOption?.potentialRebates?.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gradient-to-br from-green-50 to-blue-50 rounded-3xl shadow-xl p-8 mb-12"
        >
          <div className="flex items-center gap-3 mb-6">
            <Sparkles size={32} className="text-green-600" />
            <div>
              <h3 className="text-2xl font-bold text-gray-900">
                You May Qualify for Up to ${totalRebates.toLocaleString()} in
                Rebates!
              </h3>
              <p className="text-gray-600">
                Available government and utility incentives for your system
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {selectedOption.potentialRebates.map(
              (rebate: any, index: number) => (
                <div key={index} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-semibold text-gray-900">
                        {rebate.program_name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {rebate.provider}
                      </div>
                    </div>
                    <div className="text-lg font-bold text-green-600">
                      ${rebate.estimated_amount?.toLocaleString()}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {rebate.description}
                  </p>
                  {rebate.disclaimer && (
                    <p className="text-xs text-gray-500 italic">
                      {rebate.disclaimer}
                    </p>
                  )}
                </div>
              ),
            )}
          </div>

          <p className="text-sm text-gray-600 mt-4">
            * Rebate availability subject to program requirements. We'll help
            you apply during installation.
          </p>
        </motion.div>
      )}

      {/* CTA Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-3xl shadow-xl p-8 text-center"
      >
        <h3 className="text-2xl font-bold mb-3">What Happens Next?</h3>
        <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
          A certified comfort engineer will contact you within 24 hours to
          schedule your free in-home consultation and finalize your quote.
        </p>

        <div className="grid md:grid-cols-3 gap-4 max-w-3xl mx-auto mb-8">
          <div className="p-4">
            <div className="text-4xl mb-2">📞</div>
            <div className="font-semibold">Free Consultation</div>
            <div className="text-sm text-gray-600">
              Expert advice, no pressure
            </div>
          </div>
          <div className="p-4">
            <div className="text-4xl mb-2">📋</div>
            <div className="font-semibold">Custom Quote</div>
            <div className="text-sm text-gray-600">Tailored to your home</div>
          </div>
          <div className="p-4">
            <div className="text-4xl mb-2">✅</div>
            <div className="font-semibold">Expert Install</div>
            <div className="text-sm text-gray-600">Licensed & insured</div>
          </div>
        </div>

        <div className="text-sm text-gray-600 space-y-1">
          <p>
            <strong>Your estimate:</strong> $
            {selectedOption?.totalPrice.toLocaleString()} or $
            {selectedOption?.monthlyPayment}/mo
          </p>
          <p>
            <strong>Location:</strong> {formData.zip_code} (
            {estimate.zone.zone_name})
          </p>
          <p>
            <strong>System:</strong>{" "}
            {formData.system_type?.replace(/_/g, " ").toUpperCase()} for{" "}
            {formData.home_size} home
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PricingCard({ option, isSelected, onSelect, isPopular, delay }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ scale: 1.02, y: -5 }}
      className={`relative bg-white rounded-3xl overflow-hidden transition-all cursor-pointer ${
        isSelected
          ? "ring-4 ring-blue-500 shadow-2xl"
          : "shadow-xl hover:shadow-2xl"
      }`}
      onClick={onSelect}
    >
      {isPopular && (
        <div className="absolute top-0 right-0 bg-gradient-to-r from-yellow-400 to-orange-400 text-white px-4 py-1 text-sm font-bold rounded-bl-xl flex items-center gap-1">
          <Award size={16} />
          MOST POPULAR
        </div>
      )}

      <div className="p-8">
        <h3 className="text-2xl font-bold mb-4 capitalize flex items-center gap-2">
          {option.tier}
          {isSelected && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center"
            >
              <Check size={16} className="text-white" />
            </motion.div>
          )}
        </h3>

        <div className="mb-6">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-5xl font-bold text-gray-900">
              ${option.totalPrice.toLocaleString()}
            </span>
            {option.discountAmount > 0 && (
              <span className="text-xl text-gray-400 line-through">
                ${(option.totalPrice + option.discountAmount).toLocaleString()}
              </span>
            )}
          </div>

          <div className="text-gray-600 font-medium">
            or ${option.monthlyPayment}/month
          </div>

          {option.discountAmount > 0 && (
            <div className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold mt-2">
              <Sparkles size={14} />
              Save ${option.discountAmount.toLocaleString()}
            </div>
          )}
        </div>

        <div className="space-y-3 mb-8">
          {option.equipment.map((item: any, i: number) => (
            <div key={i} className="flex items-start gap-2">
              <Check
                size={20}
                className="text-green-500 mt-0.5 flex-shrink-0"
              />
              <div className="text-sm">
                <div className="font-semibold text-gray-900">
                  {item.brand} {item.model}
                </div>
                <div className="text-gray-600">
                  {item.efficiency_rating} • {item.category.replace(/_/g, " ")}
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-start gap-2">
            <Check size={20} className="text-green-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-gray-700">
              Professional installation & {option.equipment[0]?.warranty_years}
              -year warranty
            </div>
          </div>
        </div>

        <button
          className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
            isSelected
              ? "bg-blue-600 text-white shadow-lg"
              : "bg-gray-100 text-gray-900 hover:bg-gray-200"
          }`}
        >
          {isSelected ? "Selected ✓" : "Select Package"}
        </button>
      </div>
    </motion.div>
  );
}
