import ts from "typescript";
import type {
  Declaration,
  ExportRecord,
  ImportBinding,
  ImportRecord,
  ParsedModule,
  Reference,
} from "./types";

/**
 * Parses one JavaScript/TypeScript module with the TypeScript compiler's
 * syntax-only parser (`ts.createSourceFile`). No type checker, no program, no
 * module loading, and never any evaluation of the source.
 */

export const ANALYZABLE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

export function isAnalyzablePath(path: string): boolean {
  if (path.endsWith(".d.ts") || path.endsWith(".d.mts") || path.endsWith(".d.cts")) return false;
  if (/\.min\.js$/.test(path)) return false;
  return ANALYZABLE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

function scriptKindFor(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(js|mjs|cjs)$/.test(path)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function oneLine(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return !!mods?.some((m) => m.kind === kind);
}

function moduleNameText(name: ts.ModuleExportName): string {
  return ts.isIdentifier(name) ? name.text : name.text;
}

export function parseModule(path: string, content: string): ParsedModule {
  const sf = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, scriptKindFor(path));
  const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const textOf = (node: ts.Node) => oneLine(node.getText(sf));

  const imports: ImportRecord[] = [];
  const exports: ExportRecord[] = [];
  const starReexports: ParsedModule["starReexports"] = [];
  const declarations: Declaration[] = [];
  const topLevelRefs: Reference[] = [];
  const nonLiteralImports: ParsedModule["nonLiteralImports"] = [];

  /** Collects identifier references inside a subtree. Namespace member accesses are recorded as `ns.member`. */
  const collectRefs = (root: ts.Node, out: Reference[]) => {
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
        out.push({ name: `${node.expression.text}.${node.name.text}`, line: lineOf(node) });
        return; // do not also record the bare namespace identifier
      }
      if (ts.isQualifiedName(node) && ts.isIdentifier(node.left)) {
        out.push({ name: `${node.left.text}.${node.right.text}`, line: lineOf(node) });
        return;
      }
      if (ts.isIdentifier(node)) {
        const parent = node.parent;
        // Skip names that are declarations or property keys rather than references.
        const isPropertyName =
          (ts.isPropertyAssignment(parent) && parent.name === node) ||
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertySignature(parent) && parent.name === node) ||
          (ts.isPropertyDeclaration(parent) && parent.name === node) ||
          (ts.isMethodDeclaration(parent) && parent.name === node) ||
          (ts.isJsxAttribute(parent) && parent.name === node);
        if (!isPropertyName) out.push({ name: node.text, line: lineOf(node) });
      }
      ts.forEachChild(node, visit);
    };
    visit(root);
  };

  const pushDeclaration = (name: string, node: ts.Node) => {
    const refs: Reference[] = [];
    collectRefs(node, refs);
    declarations.push({ name, line: lineOf(node), refs: refs.filter((r) => r.name !== name) });
  };

  const bindingNames = (name: ts.BindingName): string[] => {
    if (ts.isIdentifier(name)) return [name.text];
    const out: string[] = [];
    for (const el of name.elements) {
      if (ts.isOmittedExpression(el)) continue;
      out.push(...bindingNames(el.name));
    }
    return out;
  };

  for (const stmt of sf.statements) {
    // ---- import declarations -------------------------------------------
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const clause = stmt.importClause;
      const typeOnly = !!clause?.isTypeOnly;
      const bindings: ImportBinding[] = [];
      if (clause?.name) bindings.push({ imported: "default", local: clause.name.text, typeOnly });
      const nb = clause?.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) bindings.push({ imported: "*", local: nb.name.text, typeOnly });
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) {
          bindings.push({
            imported: el.propertyName ? moduleNameText(el.propertyName) : el.name.text,
            local: el.name.text,
            typeOnly: typeOnly || el.isTypeOnly,
          });
        }
      }
      imports.push({
        specifier: stmt.moduleSpecifier.text,
        kind: clause ? "static" : "side-effect",
        bindings,
        typeOnly,
        line: lineOf(stmt),
        text: textOf(stmt),
      });
      continue;
    }

    // ---- import x = require("y") ---------------------------------------
    if (
      ts.isImportEqualsDeclaration(stmt) &&
      ts.isExternalModuleReference(stmt.moduleReference) &&
      ts.isStringLiteral(stmt.moduleReference.expression)
    ) {
      imports.push({
        specifier: stmt.moduleReference.expression.text,
        kind: "require",
        bindings: [{ imported: "*", local: stmt.name.text, typeOnly: stmt.isTypeOnly }],
        typeOnly: stmt.isTypeOnly,
        line: lineOf(stmt),
        text: textOf(stmt),
      });
      if (hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) {
        exports.push({ name: stmt.name.text, kind: "variable", line: lineOf(stmt), typeOnly: false, local: stmt.name.text });
      }
      continue;
    }

    // ---- export ... from / export { ... } -------------------------------
    if (ts.isExportDeclaration(stmt)) {
      const spec = stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : null;
      const typeOnly = stmt.isTypeOnly;
      if (spec) {
        if (!stmt.exportClause) {
          starReexports.push({ specifier: spec, line: lineOf(stmt), text: textOf(stmt) });
          imports.push({ specifier: spec, kind: "re-export-all", bindings: [{ imported: "*", local: null, typeOnly }], typeOnly, line: lineOf(stmt), text: textOf(stmt) });
        } else if (ts.isNamespaceExport(stmt.exportClause)) {
          const name = moduleNameText(stmt.exportClause.name);
          exports.push({ name, kind: "namespace", line: lineOf(stmt), typeOnly, local: null, from: { specifier: spec, imported: "*" } });
          imports.push({ specifier: spec, kind: "re-export", bindings: [{ imported: "*", local: null, typeOnly }], typeOnly, line: lineOf(stmt), text: textOf(stmt) });
        } else {
          const bindings: ImportBinding[] = [];
          for (const el of stmt.exportClause.elements) {
            const imported = el.propertyName ? moduleNameText(el.propertyName) : moduleNameText(el.name);
            const name = moduleNameText(el.name);
            bindings.push({ imported, local: null, typeOnly: typeOnly || el.isTypeOnly });
            exports.push({ name, kind: "re-export", line: lineOf(el), typeOnly: typeOnly || el.isTypeOnly, local: null, from: { specifier: spec, imported } });
          }
          imports.push({ specifier: spec, kind: "re-export", bindings, typeOnly, line: lineOf(stmt), text: textOf(stmt) });
        }
      } else if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          const local = el.propertyName ? moduleNameText(el.propertyName) : moduleNameText(el.name);
          exports.push({ name: moduleNameText(el.name), kind: "variable", line: lineOf(el), typeOnly: typeOnly || el.isTypeOnly, local });
        }
      }
      continue;
    }

    // ---- export default <expr> / export = <expr> ------------------------
    if (ts.isExportAssignment(stmt)) {
      const local = ts.isIdentifier(stmt.expression) ? stmt.expression.text : "default";
      if (local === "default") pushDeclaration("default", stmt.expression);
      exports.push({ name: "default", kind: "default", line: lineOf(stmt), typeOnly: false, local });
      continue;
    }

    const exported = hasModifier(stmt, ts.SyntaxKind.ExportKeyword);
    const isDefault = hasModifier(stmt, ts.SyntaxKind.DefaultKeyword);

    // ---- declarations ---------------------------------------------------
    if (
      ts.isFunctionDeclaration(stmt) ||
      ts.isClassDeclaration(stmt) ||
      ts.isInterfaceDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt) ||
      ts.isEnumDeclaration(stmt)
    ) {
      const name = stmt.name?.text ?? "default";
      pushDeclaration(name, stmt);
      if (exported) {
        const kind: ExportRecord["kind"] = ts.isFunctionDeclaration(stmt)
          ? "function"
          : ts.isClassDeclaration(stmt)
            ? "class"
            : ts.isInterfaceDeclaration(stmt)
              ? "interface"
              : ts.isTypeAliasDeclaration(stmt)
                ? "type"
                : "enum";
        const typeOnly = kind === "interface" || kind === "type";
        exports.push({ name: isDefault ? "default" : name, kind: isDefault ? "default" : kind, line: lineOf(stmt), typeOnly, local: name });
      }
      continue;
    }

    if (ts.isModuleDeclaration(stmt) && ts.isIdentifier(stmt.name)) {
      pushDeclaration(stmt.name.text, stmt);
      if (exported) exports.push({ name: stmt.name.text, kind: "namespace", line: lineOf(stmt), typeOnly: false, local: stmt.name.text });
      continue;
    }

    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        const names = bindingNames(decl.name);
        // const { a, b } = require("x")  /  const x = require("x")
        if (decl.initializer) {
          const req = unwrapRequire(decl.initializer);
          if (req) {
            const bindings: ImportBinding[] = ts.isObjectBindingPattern(decl.name)
              ? decl.name.elements.map((el) => ({
                  imported: el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : bindingNames(el.name)[0],
                  local: bindingNames(el.name)[0],
                  typeOnly: false,
                }))
              : names.map((n) => ({ imported: "*", local: n, typeOnly: false }));
            imports.push({ specifier: req.text, kind: "require", bindings, typeOnly: false, line: lineOf(stmt), text: textOf(stmt) });
          }
        }
        for (const n of names) {
          pushDeclaration(n, decl);
          if (exported) exports.push({ name: n, kind: "variable", line: lineOf(decl), typeOnly: false, local: n });
        }
      }
      continue;
    }

    // ---- CommonJS exports ------------------------------------------------
    if (ts.isExpressionStatement(stmt) && ts.isBinaryExpression(stmt.expression) && stmt.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const { left, right } = stmt.expression;
      const target = left.getText(sf);
      const exportsMember = /^(?:module\.)?exports\.([A-Za-z_$][\w$]*)$/.exec(target);
      if (exportsMember) {
        const name = exportsMember[1];
        pushDeclaration(name, right);
        exports.push({ name, kind: "commonjs", line: lineOf(stmt), typeOnly: false, local: name });
        continue;
      }
      if (target === "module.exports") {
        if (ts.isObjectLiteralExpression(right)) {
          for (const prop of right.properties) {
            if ((ts.isShorthandPropertyAssignment(prop) || ts.isPropertyAssignment(prop)) && ts.isIdentifier(prop.name)) {
              const local = ts.isShorthandPropertyAssignment(prop)
                ? prop.name.text
                : ts.isIdentifier(prop.initializer)
                  ? prop.initializer.text
                  : `module.exports.${prop.name.text}`;
              if (local.startsWith("module.exports.") && ts.isPropertyAssignment(prop)) pushDeclaration(local, prop.initializer);
              exports.push({ name: prop.name.text, kind: "commonjs", line: lineOf(prop), typeOnly: false, local });
            }
          }
        }
        pushDeclaration("module.exports", right);
        exports.push({ name: "default", kind: "commonjs", line: lineOf(stmt), typeOnly: false, local: "module.exports" });
        continue;
      }
    }

    collectRefs(stmt, topLevelRefs);
  }

  // ---- dynamic import() / require() anywhere in the file -----------------
  const alreadyRecorded = new Set(imports.filter((i) => i.kind === "require").map((i) => `${i.line}:${i.specifier}`));
  const walk = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require" && node.arguments.length === 1;
      if (isDynamicImport || isRequire) {
        const arg = node.arguments[0];
        const stmtNode = enclosingStatement(node);
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
          const key = `${lineOf(stmtNode)}:${arg.text}`;
          if (!(isRequire && alreadyRecorded.has(key))) {
            imports.push({
              specifier: arg.text,
              kind: isDynamicImport ? "dynamic" : "require",
              bindings: [{ imported: "*", local: null, typeOnly: false }],
              typeOnly: false,
              line: lineOf(node),
              text: textOf(stmtNode),
            });
          }
        } else if (arg) {
          nonLiteralImports.push({ line: lineOf(node), text: textOf(node) });
        }
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);

  const diagnostics = (sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics ?? [];

  return {
    path,
    imports,
    exports,
    starReexports,
    declarations,
    topLevelRefs,
    nonLiteralImports,
    loc: content.split("\n").length,
    syntaxErrors: diagnostics.length,
  };
}

function unwrapRequire(expr: ts.Expression): ts.StringLiteral | null {
  let e = expr;
  while (ts.isAwaitExpression(e) || ts.isParenthesizedExpression(e)) e = e.expression;
  if (
    ts.isCallExpression(e) &&
    ts.isIdentifier(e.expression) &&
    e.expression.text === "require" &&
    e.arguments.length === 1 &&
    ts.isStringLiteral(e.arguments[0])
  ) {
    return e.arguments[0];
  }
  return null;
}

function enclosingStatement(node: ts.Node): ts.Node {
  let n: ts.Node = node;
  while (n.parent && !ts.isSourceFile(n.parent)) {
    if (ts.isStatement(n) && n.getText().length < 200) return n;
    n = n.parent;
  }
  return n;
}
