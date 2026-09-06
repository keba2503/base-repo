import modulesFile from "./modules.json";

export type ModuleName = keyof typeof modulesFile.modules;

export type ModuleActivation = Readonly<Record<ModuleName, boolean>>;

export const moduleNames = Object.keys(modulesFile.modules) as readonly ModuleName[];

function isCoreModule(name: ModuleName): boolean {
  return modulesFile.modules[name].core;
}

function dependenciesOf(name: ModuleName): readonly ModuleName[] {
  return modulesFile.modules[name].dependsOn as readonly ModuleName[];
}

export const defaultModuleActivation: ModuleActivation = Object.fromEntries(
  moduleNames.map((name) => [name, modulesFile.modules[name].active]),
) as ModuleActivation;

export function isModuleActive(name: ModuleName, activation: ModuleActivation = defaultModuleActivation): boolean {
  return activation[name];
}

export function moduleGraphViolations(activation: ModuleActivation): readonly string[] {
  const violations: string[] = [];
  for (const name of moduleNames) {
    if (isCoreModule(name) && !activation[name]) {
      violations.push(`core module "${name}" cannot be inactive`);
      continue;
    }
    if (!activation[name]) continue;
    for (const dependency of dependenciesOf(name)) {
      if (!activation[dependency]) {
        violations.push(`module "${name}" is active but its dependency "${dependency}" is not`);
      }
    }
  }
  return violations;
}

export function assertModuleGraphIsValid(activation: ModuleActivation = defaultModuleActivation): void {
  const violations = moduleGraphViolations(activation);
  if (violations.length > 0) {
    throw new Error(`invalid module activation: ${violations.join("; ")}`);
  }
}
