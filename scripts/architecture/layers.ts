import layersFile from "../../architecture/layers.json";

export type LayerName = keyof typeof layersFile.layers;

export type Layer = {
  name: LayerName;
  path: string;
  ring: number;
  mayImport: LayerName[];
  externalAllowed?: string[];
  externalForbidden?: string[];
  mayImportOnlyFrom?: Partial<Record<LayerName, string[]>>;
  main?: string;
};

export const scope = layersFile.scope;

export const envAccessOnlyIn = layersFile.envAccessOnlyIn;

export const serverOnlyPackages = layersFile.serverOnlyPackages as LayerName[];

export const layers: Layer[] = (Object.keys(layersFile.layers) as LayerName[]).map(
  (name) => ({ name, ...(layersFile.layers[name] as Omit<Layer, "name">) }),
);

export function layerOf(relativePath: string): Layer | undefined {
  return layers.find(
    (layer) => relativePath === layer.path || relativePath.startsWith(`${layer.path}/`),
  );
}

export function packageName(layer: Layer): string {
  return `${scope}/${layer.name}`;
}

export function layerByPackage(specifier: string): Layer | undefined {
  if (!specifier.startsWith(`${scope}/`)) return undefined;
  const name = specifier.slice(scope.length + 1).split("/")[0] as LayerName;
  return layers.find((layer) => layer.name === name);
}
