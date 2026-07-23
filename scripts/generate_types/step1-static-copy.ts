import path from "node:path";
import { Node, type SourceFile, SyntaxKind } from "ts-morph";
import type { EnumDeclaration, Identifier, Symbol as MorphSymbol, TypeAliasDeclaration, VariableStatement } from "ts-morph";
import { SCHEMA_DIR, schemaFileToOutputName } from "./paths";

/**
 * STEP 1 — Static copy (ts-morph, no code execution).
 *
 * Classifies every top-level VariableStatement / EnumDeclaration /
 * TypeAliasDeclaration in a schema file using the TYPE CHECKER (never plain
 * name matching):
 *
 *   (a) DRIZZLE DEFINITION        — resolves to pgTable/pgView/pgEnum/pgSchema
 *                                    from drizzle-orm/pg-core. Skipped here;
 *                                    Step 2 regenerates it from real column
 *                                    metadata.
 *   (b) NON-POSTGRES DEFINITION    — resolves to a mysql-core/sqlite-core/
 *                                    singlestore-core/gel-core/... construct.
 *                                    Throws immediately.
 *   (c) DRIZZLE-DERIVED TYPE       — a type that references a drizzle table
 *                                    or an inference helper (InferSelectModel,
 *                                    `typeof table.$inferSelect`, ...).
 *                                    Skipped; Step 2's *SelectType/*InsertType
 *                                    replace it.
 *   (e) DRIZZLE COLUMN-BUILDER     — not a full table/view/enum, but still
 *       HELPER                       composed from drizzle-orm column
 *                                    builders (e.g. `helpers.ts`'s
 *                                    `Identifier`/`timestamps`). Can't be
 *                                    copied without a forbidden import, and
 *                                    doesn't need to be: Step 2 reads the
 *                                    *effective* columns straight off the
 *                                    real table object at runtime.
 *   (d) EVERYTHING ELSE            — plain TS const/enum/type, or a TypeBox
 *                                    schema built from '@sinclair/typebox'.
 *                                    Kept.
 *
 * Rather than pattern-matching each of these separately, (a)/(b)/(c)/(e) are
 * unified into a single question answered via the checker: "does this
 * declaration's value/type — directly, or transitively through same-file
 * helpers it calls — touch a symbol declared inside drizzle-orm?" If yes, it
 * is not safely copyable (and, if the touched symbol lives under a
 * non-pg-core dialect folder, that's exactly case (b) and we throw). If no,
 * it's case (d) and gets copied, together with the transitive closure of its
 * same-file local dependencies (so non-exported helpers used by exported
 * kept declarations are pulled in too), with imports rewritten per the
 * cross-file rules described in AGENTS.md/the task spec.
 */

type TopLevelDeclaration = VariableStatement | EnumDeclaration | TypeAliasDeclaration;

export interface StaticCopyResult {
    /** Assembled TypeScript source text for every "kept" declaration (already import-rewritten via `.getText()` on the original nodes — imports themselves are emitted separately, see `importsText`). */
    bodyText: string;
    /** Import statement text the kept declarations need (schema-sibling imports already rewritten to `./_<Other>Type`). */
    importsText: string;
    /** Names exported by kept declarations — lets *later* files (in topological order) validate/rewrite imports that depend on this file. */
    keptExportedNames: Set<string>;
}

interface DeclarationAnalysis {
    touchesDrizzle: boolean;
    /** Set only when a NON-pg-core drizzle-orm dialect construct was found (directly, or via a same-file local dependency). */
    nonPgDialect: string | null;
    offendingDeclarationName?: string;
    /** Other top-level declarations in the SAME file this one (transitively) depends on. */
    localDeps: Set<TopLevelDeclaration>;
}

/** Analyzes one schema file and returns its Step 1 static-copy output. */
export function analyzeSchemaFile(sourceFile: SourceFile, keptExportsByFile: Map<string, Set<string>>): StaticCopyResult {
    const declarations = getTopLevelDeclarations(sourceFile);
    const cache = new Map<TopLevelDeclaration, DeclarationAnalysis>();
    const visiting = new Set<TopLevelDeclaration>();

    const analyses = declarations.map(declaration => ({
        declaration,
        analysis: analyzeDeclaration(declaration, sourceFile, cache, visiting),
    }));

    // (b) Fail loudly and immediately on any non-PostgreSQL Drizzle construct.
    for (const { declaration, analysis } of analyses) {
        if (analysis.nonPgDialect) {
            const names = getDeclaredNames(declaration).join(", ");
            throw new Error(
                `Non-PostgreSQL Drizzle construct found in ${relativeToRoot(sourceFile.getFilePath())} ` +
                    `(declaration "${analysis.offendingDeclarationName ?? names}"): resolves to drizzle-orm/${analysis.nonPgDialect}-core. ` +
                    `Only drizzle-orm/pg-core (pgTable/pgView/pgEnum/pgSchema) is supported by this generator — ` +
                    `refusing to guess how to handle another dialect.`,
            );
        }
    }

    // (d) Kept top-level declarations = anything that never touches drizzle-orm.
    const keptTopLevel = analyses.filter(({ analysis }) => !analysis.touchesDrizzle).map(({ declaration }) => declaration);

    // Pull in each kept declaration's transitive same-file dependencies too
    // (already fully resolved by analyzeDeclaration's recursive merging).
    const emitSet = new Set<TopLevelDeclaration>(keptTopLevel);
    for (const declaration of keptTopLevel) {
        for (const dep of cache.get(declaration)!.localDeps) emitSet.add(dep);
    }

    // Preserve original source order when emitting for readability.
    const orderedEmitSet = declarations.filter(declaration => emitSet.has(declaration));

    const keptExportedNames = new Set<string>();
    for (const declaration of orderedEmitSet) {
        if (declaration.isExported()) {
            for (const name of getDeclaredNames(declaration)) keptExportedNames.add(name);
        }
    }

    const usedIdentifierNames = collectUsedIdentifierNames(orderedEmitSet);
    const importsText = buildRewrittenImports(sourceFile, usedIdentifierNames, keptExportsByFile);
    const bodyText = orderedEmitSet.map(declaration => declaration.getText({ includeJsDocComments: true })).join("\n\n");

    return { bodyText, importsText, keptExportedNames };
}

// ---------------------------------------------------------------------------
// Top-level declaration discovery
// ---------------------------------------------------------------------------

function getTopLevelDeclarations(sourceFile: SourceFile): TopLevelDeclaration[] {
    const declarations: TopLevelDeclaration[] = [];
    for (const statement of sourceFile.getStatements()) {
        if (Node.isVariableStatement(statement) || Node.isEnumDeclaration(statement) || Node.isTypeAliasDeclaration(statement)) {
            declarations.push(statement);
        } else if (Node.isImportDeclaration(statement) || Node.isExportDeclaration(statement) || Node.isExportAssignment(statement)) {
            // Handled separately (imports) or not expected in schema files (export assignments/re-exports).
        } else {
            console.warn(
                `  ⚠️  ${relativeToRoot(sourceFile.getFilePath())}: unhandled top-level statement kind "${statement.getKindName()}" — ` +
                    `it will NOT be copied or regenerated. Extend the generator if this needs to be supported.`,
            );
        }
    }
    return declarations;
}

function getValueBearingNodes(declaration: TopLevelDeclaration): Node[] {
    const nodes: Node[] = [];
    if (Node.isVariableStatement(declaration)) {
        for (const d of declaration.getDeclarations()) {
            const initializer = d.getInitializer();
            if (initializer) nodes.push(initializer);
        }
        return nodes;
    }
    if (Node.isTypeAliasDeclaration(declaration)) {
        const typeNode = declaration.getTypeNode();
        if (typeNode) nodes.push(typeNode);
        return nodes;
    }
    // EnumDeclaration
    for (const member of declaration.getMembers()) {
        const initializer = member.getInitializer();
        if (initializer) nodes.push(initializer);
    }
    return nodes;
}

function getDeclaredNames(declaration: TopLevelDeclaration): string[] {
    if (Node.isVariableStatement(declaration)) {
        return declaration.getDeclarations().map(d => d.getName());
    }
    return [declaration.getName()];
}

// ---------------------------------------------------------------------------
// Drizzle-touch detection (via the type checker, not name matching)
// ---------------------------------------------------------------------------

/** Walks descendant identifiers of `node`, skipping ones that are purely a
 * declaration/binding name (object literal keys, parameter names, ...) since
 * those never need symbol resolution. */
function collectReferenceIdentifiers(node: Node): Identifier[] {
    return node
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .concat(node.isKind(SyntaxKind.Identifier) ? [node] : [])
        .filter(identifier => !isBindingNamePosition(identifier));
}

function isBindingNamePosition(identifier: Identifier): boolean {
    const parent = identifier.getParent();
    if (!parent) return false;
    if (Node.isPropertyAssignment(parent)) return parent.getNameNode() === identifier;
    if (Node.isParameterDeclaration(parent)) return parent.getNameNode() === identifier;
    if (Node.isBindingElement(parent)) return parent.getNameNode() === identifier;
    if (Node.isPropertySignature(parent)) return parent.getNameNode() === identifier;
    if (Node.isMethodDeclaration(parent)) return parent.getNameNode() === identifier;
    if (Node.isMethodSignature(parent)) return parent.getNameNode() === identifier;
    return false;
}

/** Resolves an identifier to its symbol, following import aliases through to
 * their true originating declaration (e.g. `uuid` imported from
 * 'drizzle-orm/pg-core' resolves all the way to that package's declaration,
 * not just the local import specifier). */
function resolveAliasedSymbol(identifier: Identifier): MorphSymbol | undefined {
    const symbol = identifier.getSymbol();
    if (!symbol) return undefined;
    if (symbol.isAlias()) return symbol.getAliasedSymbol() ?? symbol;
    return symbol;
}

interface DrizzlePathInfo {
    touchesDrizzle: boolean;
    /** e.g. "mysql", "sqlite", "singlestore", "gel" — set only for non-pg dialects. */
    nonPgDialect: string | null;
}

function classifyDeclarationPath(filePath: string): DrizzlePathInfo {
    const normalized = filePath.replace(/\\/g, "/");
    if (!normalized.includes("/drizzle-orm/")) return { touchesDrizzle: false, nonPgDialect: null };

    const dialectMatch = normalized.match(/\/drizzle-orm\/([a-z0-9]+)-core\//i);
    if (dialectMatch && dialectMatch[1]!.toLowerCase() !== "pg") {
        return { touchesDrizzle: true, nonPgDialect: dialectMatch[1]!.toLowerCase() };
    }
    return { touchesDrizzle: true, nonPgDialect: null };
}

/**
 * Recursively (and memoized) determines whether a top-level declaration
 * touches drizzle-orm — directly, or transitively through same-file local
 * helpers it calls — and collects the closure of same-file local
 * dependencies along the way. Cycles (shouldn't normally occur) are broken
 * defensively rather than looping forever.
 */
function analyzeDeclaration(
    declaration: TopLevelDeclaration,
    sourceFile: SourceFile,
    cache: Map<TopLevelDeclaration, DeclarationAnalysis>,
    visiting: Set<TopLevelDeclaration>,
): DeclarationAnalysis {
    const cached = cache.get(declaration);
    if (cached) return cached;

    const result: DeclarationAnalysis = { touchesDrizzle: false, nonPgDialect: null, localDeps: new Set() };
    if (visiting.has(declaration)) return result;
    visiting.add(declaration);

    for (const valueNode of getValueBearingNodes(declaration)) {
        for (const identifier of collectReferenceIdentifiers(valueNode)) {
            const symbol = resolveAliasedSymbol(identifier);
            if (!symbol) continue;

            for (const decl of symbol.getDeclarations()) {
                const declFilePath = decl.getSourceFile().getFilePath();
                const drizzleInfo = classifyDeclarationPath(declFilePath);

                if (drizzleInfo.touchesDrizzle) {
                    result.touchesDrizzle = true;
                    if (drizzleInfo.nonPgDialect && !result.nonPgDialect) {
                        result.nonPgDialect = drizzleInfo.nonPgDialect;
                        result.offendingDeclarationName = getDeclaredNames(declaration)[0] ?? identifier.getText();
                    }
                    continue;
                }

                if (declFilePath === sourceFile.getFilePath()) {
                    const otherDeclaration = findEnclosingTopLevelDeclaration(decl, sourceFile);
                    if (otherDeclaration && otherDeclaration !== declaration) {
                        result.localDeps.add(otherDeclaration);
                        const subResult = analyzeDeclaration(otherDeclaration, sourceFile, cache, visiting);
                        mergeAnalysis(result, subResult);
                    }
                }
                // Declarations from OTHER files (sibling schema files, npm
                // packages, util files) don't affect drizzle-touch status —
                // they're handled purely by import rewriting/copying.
            }
        }
    }

    visiting.delete(declaration);
    cache.set(declaration, result);
    return result;
}

function mergeAnalysis(target: DeclarationAnalysis, source: DeclarationAnalysis): void {
    if (source.touchesDrizzle) target.touchesDrizzle = true;
    if (source.nonPgDialect && !target.nonPgDialect) {
        target.nonPgDialect = source.nonPgDialect;
        target.offendingDeclarationName = source.offendingDeclarationName;
    }
    for (const dep of source.localDeps) target.localDeps.add(dep);
}

function findEnclosingTopLevelDeclaration(node: Node, sourceFile: SourceFile): TopLevelDeclaration | undefined {
    let current: Node | undefined = node;
    while (current && current.getParent() !== sourceFile) current = current.getParent();
    if (current && (Node.isVariableStatement(current) || Node.isEnumDeclaration(current) || Node.isTypeAliasDeclaration(current))) {
        return current;
    }
    return undefined;
}

// ---------------------------------------------------------------------------
// Import assembly (schema-sibling imports rewritten to ./_<Other>Type;
// everything else copied as-is; anything unused is dropped)
// ---------------------------------------------------------------------------

function collectUsedIdentifierNames(emittedDeclarations: TopLevelDeclaration[]): Set<string> {
    const used = new Set<string>();
    for (const declaration of emittedDeclarations) {
        for (const valueNode of getValueBearingNodes(declaration)) {
            for (const identifier of collectReferenceIdentifiers(valueNode)) used.add(identifier.getText());
        }
    }
    return used;
}

function buildRewrittenImports(sourceFile: SourceFile, usedNames: Set<string>, keptExportsByFile: Map<string, Set<string>>): string {
    const lines: string[] = [];

    for (const importDecl of sourceFile.getImportDeclarations()) {
        const usedNamedImports = importDecl
            .getNamedImports()
            .filter(named => usedNames.has((named.getAliasNode() ?? named.getNameNode()).getText()));

        const defaultImport = importDecl.getDefaultImport();
        const usedDefault = defaultImport && usedNames.has(defaultImport.getText()) ? defaultImport.getText() : undefined;

        const namespaceImport = importDecl.getNamespaceImport();
        const usedNamespace = namespaceImport && usedNames.has(namespaceImport.getText()) ? namespaceImport.getText() : undefined;

        if (usedNamedImports.length === 0 && !usedDefault && !usedNamespace) continue; // fully unused -> drop entirely

        const targetSourceFile = importDecl.getModuleSpecifierSourceFile();
        const isSiblingSchemaFile = !!targetSourceFile && isWithinSchemaDir(targetSourceFile.getFilePath()) && targetSourceFile !== sourceFile;

        let moduleSpecifier = importDecl.getModuleSpecifierValue();
        if (isSiblingSchemaFile && targetSourceFile) {
            const otherName = schemaFileToOutputName(targetSourceFile.getBaseNameWithoutExtension());
            const otherKeptExports = keptExportsByFile.get(targetSourceFile.getFilePath());
            for (const named of usedNamedImports) {
                const importedName = named.getNameNode().getText();
                if (!otherKeptExports?.has(importedName)) {
                    throw new Error(
                        `${relativeToRoot(sourceFile.getFilePath())} depends on "${importedName}" from ${targetSourceFile.getBaseName()}, ` +
                            `but that declaration was not kept as browser-safe there (it is drizzle-derived). Cannot rewrite this import safely.`,
                    );
                }
            }
            moduleSpecifier = `./_${otherName}Type`;
        }

        const parts: string[] = [];
        if (usedDefault) parts.push(usedDefault);
        if (usedNamespace) parts.push(`* as ${usedNamespace}`);
        if (usedNamedImports.length > 0) {
            const namedText = usedNamedImports
                .map(named => {
                    const base = named.getAliasNode() ? `${named.getNameNode().getText()} as ${named.getAliasNode()!.getText()}` : named.getNameNode().getText();
                    return named.isTypeOnly() ? `type ${base}` : base;
                })
                .join(", ");
            parts.push(`{ ${namedText} }`);
        }

        lines.push(`import ${importDecl.isTypeOnly() ? "type " : ""}${parts.join(", ")} from '${moduleSpecifier}';`);
    }

    return lines.join("\n");
}

function isWithinSchemaDir(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, "/");
    return normalized.startsWith(`${SCHEMA_DIR.replace(/\\/g, "/")}/`);
}

function relativeToRoot(filePath: string): string {
    return path.relative(process.cwd(), filePath);
}


