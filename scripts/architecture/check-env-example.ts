import * as ts from "typescript";

export const envExampleDocument = ".env.example";
export const declarationListName = "moduleEnvVariables";
export const envFilePattern = /^apps\/[^/]+\/src\/main\/env\.ts$/;

export type DeclaredEnvVariable = {
  readonly file: string;
  readonly variable: string;
};

export type EnvExampleFailure = {
  readonly file: string;
  readonly variable: string;
};

function unwrapAsConst(expression: ts.Expression): ts.Expression {
  return ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) ? unwrapAsConst(expression.expression) : expression;
}

function tupleSecondStringLiteral(element: ts.Expression): string | undefined {
  if (!ts.isArrayLiteralExpression(element)) return undefined;
  const second = element.elements[1];
  return second && ts.isStringLiteralLike(second) ? second.text : undefined;
}

function variablesInModuleArray(moduleArray: ts.Expression): readonly string[] {
  if (!ts.isArrayLiteralExpression(moduleArray)) return [];
  const variables: string[] = [];
  for (const element of moduleArray.elements) {
    const variable = tupleSecondStringLiteral(element);
    if (variable !== undefined) variables.push(variable);
  }
  return variables;
}

export function declaredVariablesInSource(source: ts.SourceFile): readonly string[] {
  const variables: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === declarationListName &&
      node.initializer
    ) {
      const initializer = unwrapAsConst(node.initializer);
      if (ts.isObjectLiteralExpression(initializer)) {
        for (const property of initializer.properties) {
          if (ts.isPropertyAssignment(property)) {
            variables.push(...variablesInModuleArray(unwrapAsConst(property.initializer)));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return variables;
}

export function declaredVariablesFrom(file: string, text: string): readonly DeclaredEnvVariable[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return declaredVariablesInSource(source).map((variable) => ({ file, variable }));
}

export function documentedEnvVariables(document: string): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const rawLine of document.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    keys.add(line.slice(0, separator).trim());
  }
  return keys;
}

export function compareEnvExample(
  declared: readonly DeclaredEnvVariable[],
  documented: ReadonlySet<string>,
): readonly EnvExampleFailure[] {
  return declared.filter((entry) => !documented.has(entry.variable));
}
