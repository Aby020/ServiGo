import { ApiError } from "@/lib/api";

/**
 * Turn a thrown value into a field-keyed error map a form can render.
 *
 * DRF answers a validation failure with `{"email": ["..."], "password":
 * ["..."]}`. Dropping that on the form as one blob loses the only thing the
 * user can act on — *which* field to fix. `ApiError.fieldErrors` flattens it
 * to `Record<string, string>` so each message can sit under its own input,
 * which is what the `Input` component's `error` prop is for.
 *
 * A failure that is *not* a field error — a 500, a dropped connection — has
 * no fields to show, so it is keyed under `non_field` and the caller renders
 * it as one message. Without that fallback the form would appear to have done
 * nothing at all, which is the most confusing possible failure mode.
 *
 * Shared between the two admin pages that provision staff, so a new rejection
 * reason surfaces in both dialogs the moment it is added.
 */
export function toFieldErrors(err: unknown): Record<string, string> {
  if (err instanceof ApiError) {
    const fields = err.fieldErrors;
    return Object.keys(fields).length > 0 ? fields : { non_field: err.message };
  }
  return {
    non_field:
      err instanceof Error
        ? err.message
        : "The account could not be created. Try again.",
  };
}
