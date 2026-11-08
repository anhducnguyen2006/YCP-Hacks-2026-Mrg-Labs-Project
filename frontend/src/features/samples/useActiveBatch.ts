import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Batch } from "../../api";

// Query-cache memory is cleared on workspace/account changes; never restore a
// batch from another workspace through persistent browser storage.
export function useActiveBatch(explicitId: string | null, batches?: Batch[], selectFallback = false) {
  const client = useQueryClient();
  const remembered = client.getQueryData<string>(["active-batch"]);
  const id = explicitId || (selectFallback
    ? batches?.find(batch => batch.id === remembered)?.id || batches?.[0]?.id || null
    : null);
  useEffect(() => {
    if (id) client.setQueryData(["active-batch"], id);
  }, [id, client]);
  return id;
}
