import * as ts from "typescript";

export const schemaVariableName = "environmentSchema";
export const intentionallyOptionalListName = "intentionallyOptionalEnvVariables";

export type UngovernedEnvVariable = {
  readonly file: string;
  readonly property: string;
  readonly variable: string;
};

function unwrapAsConst(expression: ts.Expression): ts.Expression {
  return ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)
    ? unwrapAsConst(expression.expression)
    : expression;
}

function schemaFieldIsOptional(expression: ts.Expression): boolean {
  let current: ts.Node = expression;
  while (ts.isCallExpression(current)) {
    const callee = current.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      if (callee.name.text === "optional") return true;
      current = callee.expression;
      continue;
    }
    current = callee;
  }
  return false;
}

function findCallByCalleeName(root: ts.Node, name: string): ts.CallExpression | undefined {
  let found: ts.CallExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === name
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function objectLiteralOfSchemaCall(root: ts.Node): ts.ObjectLiteralExpression | undefined {
  const objectCall = findCallByCalleeName(root, "object");
  const argument = objectCall?.arguments[0];
  return argument && ts.isObjectLiteralExpression(argument) ? argument : undefined;
}

export function optionalSchemaFields(source: ts.SourceFile): readonly string[] {
  const schemaDeclaration = source.statements
    .flatMap((statement) => (ts.isVariableStatement(statement) ? statement.declarationList.declarations : []))
    .find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === schemaVariableName);
  if (!schemaDeclaration?.initializer) return [];
  const objectLiteral = objectLiteralOfSchemaCall(schemaDeclaration.initializer);
  if (!objectLiteral) return [];

  const fields: string[] = [];
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = ts.isIdentifier(property.name) ? property.name.text : undefined;
    if (name === undefined) continue;
    if (schemaFieldIsOptional(property.initializer)) fields.push(name);
  }
  return fields;
}

export function governedSchemaFields(source: ts.SourceFile): ReadonlySet<string> {
  const refineCall = findCallByCalleeName(source, "superRefine");
  const callback = refineCall?.arguments[0];
  const governed = new Set<string>();
  if (!callback || !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) return governed;
  const parameter = callback.parameters[0]?.name;
  if (!parameter || !ts.isIdentifier(parameter)) return governed;
  const valueName = parameter.text;

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === valueName
    ) {
      governed.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(callback.body);
  return governed;
}

export function declaredIntentionallyOptionalFields(source: ts.SourceFile): ReadonlySet<string> {
  const declared = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === intentionallyOptionalListName &&
      node.initializer
    ) {
      const initializer = unwrapAsConst(node.initializer);
      if (ts.isArrayLiteralExpression(initializer)) {
        for (const element of initializer.elements) {
          if (ts.isStringLiteralLike(element)) declared.add(element.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return declared;
}

function envVariableNameFor(source: ts.SourceFile, property: string): string {
  let found: string | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === property &&
      ts.isPropertyAccessExpression(node.initializer) &&
      ts.isPropertyAccessExpression(node.initializer.expression) &&
      node.initializer.expression.name.text === "env"
    ) {
      found = node.initializer.name.text;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found ?? property;
}

export function ungovernedOptionalVariables(file: string, text: string): readonly UngovernedEnvVariable[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const optional = optionalSchemaFields(source);
  const governed = governedSchemaFields(source);
  const declaredOptional = declaredIntentionallyOptionalFields(source);

  return optional
    .filter((property) => !governed.has(property) && !declaredOptional.has(property))
    .map((property) => ({ file, property, variable: envVariableNameFor(source, property) }));
}
