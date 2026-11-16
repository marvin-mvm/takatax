import { createFileRoute } from "@tanstack/react-router";

import { PartnerDashboard } from "@/components/app/PartnerDashboard";
import { TaxpayerDashboard } from "@/components/app/TaxpayerDashboard";
import { useAppUser } from "@/components/app/app-user";
import { isPartner } from "@/lib/data/repository";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

/** Taxpayers get their tracker; bookkeepers, CPAs and tax lawyers get their client list. */
function Dashboard() {
  const { role } = useAppUser();
  return isPartner(role) ? <PartnerDashboard /> : <TaxpayerDashboard />;
}
