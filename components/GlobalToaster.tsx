'use client';

import { Toaster, useToast } from '@once-ui-system/core';

// Once UI's ToastProvider (mounted in Providers.tsx) only holds the toast
// queue in context — it doesn't render anything on its own. This is the one
// place that actually renders the queue, so any `useToast().addToast(...)`
// call anywhere in the app (e.g. PaymentFormClient's save confirmation,
// matching the A5 mockup's "toast confirmation on save") becomes visible.
export function GlobalToaster() {
  const { toasts, removeToast } = useToast();
  return <Toaster toasts={toasts} removeToast={removeToast} />;
}
