import layersFile from "./architecture/layers.json" with { type: "json" };

const scope = layersFile.scope;
const layerNames = Object.keys(layersFile.layers);
const layers = layerNames.map((name) => ({ name, ...layersFile.layers[name] }));

const externalDependencyTypes = [
  "npm",
  "npm-dev",
  "npm-optional",
  "npm-peer",
  "npm-bundled",
  "npm-no-pkg",
  "npm-unknown",
  "core",
  "deprecated",
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patternToRegex(pattern) {
  if (pattern.endsWith("/*")) {
    return `^${escapeRegex(pattern.slice(0, -2))}/`;
  }
  return `^${escapeRegex(pattern)}$`;
}

function alternation(patterns) {
  return patterns.map(patternToRegex).join("|");
}

function layerPathRegex(layer) {
  return `^${escapeRegex(layer.path)}/`;
}

const dependencyRules = layers.flatMap((layer) => {
  const rules = [];
  const restricted = layer.mayImportOnlyFrom ?? {};
  const allowedLayerNames = new Set([...layer.mayImport, ...Object.keys(restricted)]);
  const disallowedLayers = layers.filter(
    (other) => other.name !== layer.name && !allowedLayerNames.has(other.name),
  );

  if (disallowedLayers.length > 0) {
    rules.push({
      name: `dependency-rule-${layer.name}`,
      severity: "error",
      comment: `${layer.name} must only import from: ${[...allowedLayerNames].join(", ") || "nothing"}. Enforces the Clean Architecture dependency rule from architecture/layers.json.`,
      from: { path: layerPathRegex(layer) },
      to: { path: `(${disallowedLayers.map(layerPathRegex).join("|")})` },
    });
  }

  for (const [targetName, allowedDirs] of Object.entries(restricted)) {
    const target = layers.find((candidate) => candidate.name === targetName);
    if (!target) continue;
    rules.push({
      name: `dependency-rule-${layer.name}-${targetName}-restricted`,
      severity: "error",
      comment: `${layer.name} may import ${targetName} only from ${allowedDirs.join(", ")} (architecture/layers.json mayImportOnlyFrom).`,
      from: {
        path: layerPathRegex(layer),
        pathNot: allowedDirs.map((dir) => `^${escapeRegex(layer.path)}/${escapeRegex(dir)}/`),
      },
      to: { path: layerPathRegex(target) },
    });
  }

  return rules;
});

const externalRules = layers.flatMap((layer) => {
  const rules = [];
  const internalPathNot = `^${escapeRegex(scope)}/`;

  if (layer.externalForbidden && layer.externalForbidden.length > 0) {
    rules.push({
      name: `external-forbidden-${layer.name}`,
      severity: "error",
      comment: `${layer.name} must not depend on: ${layer.externalForbidden.join(", ")} (architecture/layers.json externalForbidden).`,
      from: { path: layerPathRegex(layer) },
      to: { path: alternation(layer.externalForbidden) },
    });
  }

  if (layer.externalAllowed !== undefined) {
    const allowedPatterns = layer.externalAllowed.map(patternToRegex);
    rules.push({
      name: `external-not-allowed-${layer.name}`,
      severity: "error",
      comment:
        layer.externalAllowed.length > 0
          ? `${layer.name} may only depend on external packages: ${layer.externalAllowed.join(", ")} (architecture/layers.json externalAllowed).`
          : `${layer.name} must not depend on any external package (architecture/layers.json externalAllowed is empty).`,
      from: { path: layerPathRegex(layer) },
      to: {
        pathNot: [internalPathNot, ...allowedPatterns],
        dependencyTypes: externalDependencyTypes,
      },
    });
  }

  return rules;
});

export default {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies break the acyclic dependency principle required by Clean Architecture.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment: "This module is not imported anywhere. Use it or remove it.",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)[.][^/]+[.](?:js|cjs|mjs|ts|cts|mts|json)$",
          "[.]d[.]ts$",
          "(^|/)tsconfig[.]json$",
          "(^|/)(?:next|postcss|eslint)[.]config[.](?:js|cjs|mjs|ts)$",
          "(^|/)(?:page|layout|loading|error|not-found|template|default|global-error|route|proxy)[.]tsx?$",
        ],
      },
      to: {},
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      comment: "This module depends on a module that cannot be resolved to disk.",
      from: {},
      to: { couldNotResolve: true },
    },
    ...dependencyRules,
    ...externalRules,
  ],
  options: {
    exclude: {
      path: "(^|/)(node_modules|\\.next|dist|coverage)(/|$)",
    },
    doNotFollow: {
      path: "node_modules",
    },
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};
