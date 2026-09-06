"use client";

import { useState, useTransition } from "react";
import { submitConsentDecision } from "./actions";

type ConsentDecision = Readonly<{ functional: boolean; analytics: boolean; marketing: boolean }>;

type Category = { readonly key: keyof ConsentDecision; readonly label: string; readonly description: string };

const categories: readonly Category[] = [
  {
    key: "functional",
    label: "Funcionales",
    description: "Recuerdan preferencias como el idioma o el tenant elegido.",
  },
  {
    key: "analytics",
    label: "Analítica",
    description: "Miden qué páginas se visitan para corregir lo que no funciona.",
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Permiten medir campañas propias. No se comparten con terceros.",
  },
];

const allAccepted: ConsentDecision = { functional: true, analytics: true, marketing: true };
const allRejected: ConsentDecision = { functional: false, analytics: false, marketing: false };

export function CookieBanner({ initiallyKnown }: { initiallyKnown: boolean }) {
  const [visible, setVisible] = useState(!initiallyKnown);
  const [expanded, setExpanded] = useState(false);
  const [selection, setSelection] = useState<ConsentDecision>(allRejected);
  const [isPending, startTransition] = useTransition();

  if (!visible) return null;

  function commit(decision: ConsentDecision): void {
    startTransition(async () => {
      await submitConsentDecision(decision);
      setVisible(false);
    });
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 flex justify-start sm:inset-x-auto sm:left-4">
      <div className="w-full max-w-sm border border-foreground/30 bg-background p-5 text-foreground">
        <p className="text-xs font-semibold tracking-widest uppercase text-foreground/60">Aviso de cookies</p>
        <p className="mt-2 text-sm leading-relaxed">
          Usamos cookies estrictamente necesarias para que esto funcione. El resto solo se activa si lo decides
          aquí, categoría por categoría.
        </p>

        {expanded ? (
          <ul className="mt-4 flex flex-col gap-3">
            {categories.map((category) => (
              <li key={category.key} className="flex items-start gap-3">
                <input
                  checked={selection[category.key]}
                  className="mt-1"
                  id={`consent-${category.key}`}
                  onChange={(event) =>
                    setSelection((current) => ({ ...current, [category.key]: event.target.checked }))
                  }
                  type="checkbox"
                />
                <label className="flex flex-col text-sm" htmlFor={`consent-${category.key}`}>
                  <span className="font-medium">{category.label}</span>
                  <span className="text-foreground/70">{category.description}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            className="border border-foreground/30 px-3 py-2 text-sm"
            disabled={isPending}
            onClick={() => commit(allRejected)}
            type="button"
          >
            Solo necesarias
          </button>
          <button
            className="border border-foreground/30 px-3 py-2 text-sm"
            disabled={isPending}
            onClick={() => (expanded ? commit(selection) : setExpanded(true))}
            type="button"
          >
            {expanded ? "Confirmar selección" : "Elegir categorías"}
          </button>
          <button
            className="border border-foreground/30 px-3 py-2 text-sm"
            disabled={isPending}
            onClick={() => commit(allAccepted)}
            type="button"
          >
            Aceptar todas
          </button>
        </div>
      </div>
    </div>
  );
}
