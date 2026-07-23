// NOTE: We avoid importing InputFieldHandle here to prevent circular
// dependencies. The component parameter is typed as unknown here; the
// actual InputFieldHandle type-safety is enforced in InputField.tsx where the
// formatter is called with the concrete handle.

export type InputFormatter = (
  value: string,
  component: unknown,
  event?: InputEvent,
) => string;
