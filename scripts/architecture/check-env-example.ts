import * as ts from "typescript";

export const envExampleDocument = ".env.example";
export const requiredListName = "requiredInProduction";
export const envFilePattern = /^apps\/[^/]+\/src\/main\/env\.ts$/;

export type RequiredEnvVariable = {
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

export function requiredVariablesInSource(source: ts.SourceFile): readonly string[] {
  const variables: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === requiredListName &&
      node.initializer
    ) {
      const initializer = unwrapAsConst(node.initializer);
      if (ts.isArrayLiteralExpression(initializer)) {
        for (const element of initializer.elements) {
          const variable = tupleSecondStringLiteral(element);
          if (variable !== undefined) variables.push(variable);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return variables;
}

export function requiredVariablesFrom(file: string, text: string): readonly RequiredEnvVariable[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return requiredVariablesInSource(source).map((variable) => ({ file, variable }));
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
  required: readonly RequiredEnvVariable[],
  documented: ReadonlySet<string>,
): readonly EnvExampleFailure[] {
  return required.filter((entry) => !documented.has(entry.variable));
}
