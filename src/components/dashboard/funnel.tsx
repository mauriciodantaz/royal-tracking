"use client";

export function FunnelVisual({
  visited,
  checkout,
  purchase,
  visitToCheckout,
  checkoutToPurchase,
}: {
  visited: number;
  checkout: number;
  purchase: number;
  visitToCheckout: number;
  checkoutToPurchase: number;
}) {
  const steps = [
    { label: "Visitou", value: visited },
    { label: "Checkout", value: checkout, pct: visitToCheckout },
    { label: "Compra", value: purchase, pct: checkoutToPurchase },
  ];

  const max = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="space-y-4">
      {steps.map((step, i) => (
        <div key={step.label} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">{step.label}</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {step.value}
              {i > 0 && step.pct !== undefined ? (
                <span className="ml-2 text-primary">
                  {step.pct.toFixed(1)}%
                </span>
              ) : null}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(step.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
