import { LegalDraftPage } from "@/components/LegalDraftPage";

// Read LEGAL_DRAFTS_ENABLED on every request, not once at build time.
export const dynamic = "force-dynamic";

export default function PrivacyPolicyPage() {
  return <LegalDraftPage file="privacy-policy.md" />;
}
