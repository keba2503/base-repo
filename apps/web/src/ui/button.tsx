import type { ComponentPropsWithRef } from "react";

export function Button(props: ComponentPropsWithRef<"button">) {
  return <button {...props} />;
}
