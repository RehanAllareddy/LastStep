"use client";

import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-4">
      <Alert tone="danger" title="Something went wrong loading this page.">
        Your data is safe. Try again in a moment.
      </Alert>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
