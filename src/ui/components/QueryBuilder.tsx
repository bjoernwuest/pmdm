import React, { useState, useCallback } from "react";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Dropdown } from "primereact/dropdown";
import { MultiSelect } from "primereact/multiselect";
import { Checkbox } from "primereact/checkbox";
import { SelectButton } from "primereact/selectbutton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RuleNode = {
    id: string;
    type: "rule";
    dataTypeIdentifier: string | null;
    operator: string | null;
    value: unknown;
    values: unknown[];
    caseInsensitive?: boolean;
};

export type GroupNode = {
    id: string;
    type: "group";
    logic: "AND" | "OR";
    not: boolean;
    children: FilterNode[];
};

export type FilterNode = RuleNode | GroupNode;
export type QueryBuilderTree = GroupNode;

export type DataTypeMeta = {
    identifier: string;
    name: string;
    kind: string;
    lookupTypeIdentifier?: string | null;
};

export type ProductTypeMeta = {
    identifier: string;
    name: string;
};

export type QueryBuilderProps = {
    visible: boolean;
    onHide: () => void;
    dataTypes: DataTypeMeta[];
    productTypes: ProductTypeMeta[];
    lookupOptionsByType: Record<string, Array<{ label: string; value: string }>>;
    onEnsureLookup: (refIdentifier: string, kind?: string) => void;
    onApply: (payload: FilterPayload | null, tree: QueryBuilderTree | null) => void;
    currentTree?: QueryBuilderTree | null;
    currentPayload?: FilterPayload | null;
};

export type ApiCriterion = {
    dataTypeIdentifier: string;
    operator: string;
    value?: unknown;
    values?: unknown[];
    caseInsensitive?: boolean;
};

export type FilterPayload = {
    criteria: ApiCriterion[];
    expression: string;
    productNumberContains?: string;
    productTypeIdentifier?: string;
    disabled?: boolean;
};

// ---------------------------------------------------------------------------
// Pseudo data types for rule builder
// ---------------------------------------------------------------------------

const PSEUDO_DT_PRODUCT_NUMBER = "__pseudo_productNumber";
const PSEUDO_DT_PRODUCT_TYPE = "__pseudo_productType";

// ---------------------------------------------------------------------------
// Operator definitions by kind
// ---------------------------------------------------------------------------

const OPERATORS_BY_KIND: Record<string, string[]> = {
    boolean: ["TRUE", "FALSE", "NOT TRUE", "NOT FALSE", "EMPTY", "NOT EMPTY"],
    numeric: ["=", "!=", ">", ">=", "<", "<=", "EMPTY", "NOT EMPTY"],
    string: ["=", "!=", "CONTAINS", "NOT CONTAINS", "STARTS WITH", "ENDS WITH", "REGEX", "NOT REGEX", "EMPTY", "NOT EMPTY"],
    lookup: ["=", "!=", "CONTAINS", "NOT CONTAINS", "STARTS WITH", "ENDS WITH", "EMPTY", "NOT EMPTY"],
    consumable: ["=", "!=", "CONTAINS", "NOT CONTAINS", "STARTS WITH", "ENDS WITH", "EMPTY", "NOT EMPTY"],
    product: ["=", "!=", "CONTAINS", "NOT CONTAINS", "STARTS WITH", "ENDS WITH", "EMPTY", "NOT EMPTY"],
    __pseudo__: ["=", "!=", "CONTAINS", "NOT CONTAINS", "STARTS WITH", "ENDS WITH", "REGEX", "NOT REGEX", "EMPTY", "NOT EMPTY"],
};

/** Operators that can be made case-insensitive for string/text-like criteria */
const CASE_INSENSITIVE_OPERATORS = new Set(["=", "!=", "CONTAINS", "NOT CONTAINS", "STARTS WITH", "ENDS WITH", "REGEX", "NOT REGEX", "IN", "NOT IN"]);

const VALUE_LESS_OPERATORS = new Set(["EMPTY", "NOT EMPTY", "TRUE", "FALSE", "NOT TRUE", "NOT FALSE"]);

const GROUP_COLORS = [
    "var(--indigo-500, #6366f1)",
    "var(--sky-500, #0ea5e9)",
    "var(--emerald-500, #10b981)",
    "var(--amber-500, #f59e0b)",
    "var(--pink-500, #ec4899)",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let uidCounter = 0;
function uid(): string {
    return `node_${++uidCounter}_${Date.now()}`;
}

function createEmptyRule(): RuleNode {
    return { id: uid(), type: "rule", dataTypeIdentifier: null, operator: null, value: null, values: [], caseInsensitive: false };
}

function createEmptyGroup(): GroupNode {
    return { id: uid(), type: "group", logic: "AND", not: false, children: [createEmptyRule()] };
}

function countRules(tree: FilterNode): number {
    if (tree.type === "rule") return 1;
    return tree.children.reduce((sum, c) => sum + countRules(c), 0);
}

// ---------------------------------------------------------------------------
// Build combined DataType + pseudo list for dropdown
// ---------------------------------------------------------------------------

interface CombinedOption {
    label: string;
    value: string;   // identifier
    kind: string;
    lookupTypeIdentifier?: string | null;
}

function buildCombinedOptions(
    dataTypes: DataTypeMeta[],
    productTypes: ProductTypeMeta[],
): CombinedOption[] {
    const options: CombinedOption[] = [
        { label: "Product Number", value: PSEUDO_DT_PRODUCT_NUMBER, kind: "__pseudo__" },
    ];

    // Only show Product Type as rule if there are product types loaded
    if (productTypes.length > 0) {
        options.push({ label: "Product Type", value: PSEUDO_DT_PRODUCT_TYPE, kind: "__pseudo__" });
    }

    for (const dt of dataTypes) {
        options.push({
            label: dt.name,
            value: dt.identifier,
            kind: dt.kind,
            lookupTypeIdentifier: dt.lookupTypeIdentifier,
        });
    }
    return options;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const QueryBuilder: React.FC<QueryBuilderProps> = ({
    visible,
    onHide,
    dataTypes,
    productTypes,
    lookupOptionsByType,
    onEnsureLookup,
    onApply,
    currentTree,
    currentPayload,
}) => {
    const [tree, setTree] = useState<QueryBuilderTree>(() => {
        if (currentTree) return JSON.parse(JSON.stringify(currentTree));
        return createEmptyGroup();
    });
    const [quickProductNumber, setQuickProductNumber] = useState(currentPayload?.productNumberContains ?? "");
    const [quickProductType, setQuickProductType] = useState(currentPayload?.productTypeIdentifier ?? "any");
    const [quickDisabled, setQuickDisabled] = useState<string>(
        currentPayload?.disabled === true ? "disabled" : currentPayload?.disabled === false ? "active" : "any",
    );
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

    const combinedOptions = buildCombinedOptions(dataTypes, productTypes);

    React.useEffect(() => {
        if (visible) {
            if (currentTree) {
                setTree(JSON.parse(JSON.stringify(currentTree)));
            } else {
                setTree(createEmptyGroup());
            }
            setQuickProductNumber(currentPayload?.productNumberContains ?? "");
            setQuickProductType(currentPayload?.productTypeIdentifier ?? "any");
            setQuickDisabled(
                currentPayload?.disabled === true ? "disabled" : currentPayload?.disabled === false ? "active" : "any",
            );
            setValidationErrors({});
        }
    }, [visible, currentTree, currentPayload]);

    const updateNode = useCallback((nodeId: string, updater: (node: FilterNode) => FilterNode) => {
        setTree((prev) => {
            const update = (node: FilterNode): FilterNode => {
                if (node.id === nodeId) return updater(node);
                if (node.type === "group") return { ...node, children: node.children.map(update) };
                return node;
            };
            return update(prev) as GroupNode;
        });
    }, []);

    const addChild = useCallback((groupId: string, node: FilterNode) => {
        setTree((prev) => {
            const update = (n: FilterNode): FilterNode => {
                if (n.id === groupId && n.type === "group") return { ...n, children: [...n.children, node] };
                if (n.type === "group") return { ...n, children: n.children.map(update) };
                return n;
            };
            return update(prev) as GroupNode;
        });
    }, []);

    const removeNode = useCallback((nodeId: string) => {
        setTree((prev) => {
            const update = (n: FilterNode): FilterNode | null => {
                if (n.type === "group") {
                    const filtered = n.children.map(update).filter(Boolean) as FilterNode[];
                    if (filtered.length === 0 && n.id === prev.id) {
                        return { ...n, children: [createEmptyRule()] };
                    }
                    return { ...n, children: filtered };
                }
                if (n.id === nodeId) return null;
                return n;
            };
            return update(prev) as GroupNode;
        });
    }, []);

    const validate = useCallback((): boolean => {
        const errors: Record<string, string> = {};
        const validateNode = (node: FilterNode) => {
            if (node.type === "rule") {
                if (!node.dataTypeIdentifier) errors[node.id] = "Select a data type";
                else if (!node.operator) errors[node.id] = "Select an operator";
                else if (!VALUE_LESS_OPERATORS.has(node.operator)) {
                    if (node.operator === "IN" || node.operator === "NOT IN") {
                        if (!node.values || node.values.length === 0) errors[node.id] = "Select at least one value";
                    } else if (node.value === null || node.value === undefined || node.value === "") {
                        errors[node.id] = "Enter a value";
                    }
                }
            } else {
                node.children.forEach(validateNode);
            }
        };
        validateNode(tree);
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    }, [tree]);

    const handleApply = useCallback(() => {
        const hasQuickFilter = !!quickProductNumber || quickProductType !== "any" || quickDisabled !== "any";
        const ruleCount = countRules(tree);

        if (!hasQuickFilter && ruleCount === 0) {
            onApply(null, null);
            onHide();
            return;
        }

        if (!validate()) return;

        const criteria: ApiCriterion[] = [];
        const buildExpression = (node: FilterNode): string => {
            if (node.type === "rule") {
                const idx = criteria.length + 1;
                criteria.push({
                    dataTypeIdentifier: node.dataTypeIdentifier!,
                    operator: node.operator!,
                    value: node.value,
                    values: node.values,
                    caseInsensitive: node.caseInsensitive,
                });
                return String(idx);
            }
            const childExprs = node.children.map(buildExpression).filter(Boolean);
            if (childExprs.length === 0) return "";
            if (childExprs.length === 1) {
                return node.not ? `NOT ${childExprs[0]}` : childExprs[0]!;
            }
            const joined = childExprs.join(` ${node.logic} `);
            const inner = `(${joined})`;
            return node.not ? `NOT ${inner}` : inner;
        };

        const expression = buildExpression(tree);

        const payload: FilterPayload = {
            criteria,
            expression,
            productNumberContains: quickProductNumber || undefined,
            productTypeIdentifier: quickProductType !== "any" ? quickProductType : undefined,
            disabled: quickDisabled === "disabled" ? true : quickDisabled === "active" ? false : undefined,
        };

        onApply(payload, tree);
        onHide();
    }, [tree, quickProductNumber, quickProductType, quickDisabled, validate, onApply, onHide]);

    const handleClear = useCallback(() => {
        setTree(createEmptyGroup());
        setQuickProductNumber("");
        setQuickProductType("");
        setQuickDisabled("any");
        setValidationErrors({});
        onApply(null, null);
        onHide();
    }, [onApply, onHide]);

    const ruleCount = countRules(tree);

    // Get kind for a node identifier (pseudo or real)
    function getKindForIdentifier(identifier: string): string {
        if (identifier === PSEUDO_DT_PRODUCT_NUMBER || identifier === PSEUDO_DT_PRODUCT_TYPE) return "__pseudo__";
        const dt = dataTypes.find((d) => d.identifier === identifier);
        return dt?.kind ?? "string";
    }

    // Check if an operator supports case insensitivity
    function supportsCaseInsensitive(node: RuleNode): boolean {
        const kind = getKindForIdentifier(node.dataTypeIdentifier ?? "");
        if (kind === "boolean") return false;
        return node.operator ? CASE_INSENSITIVE_OPERATORS.has(node.operator) : false;
    }

    const renderRule = (node: RuleNode, _depth: number) => {
        const kind = getKindForIdentifier(node.dataTypeIdentifier ?? "");
        const operators = OPERATORS_BY_KIND[kind] ?? OPERATORS_BY_KIND["string"]!;
        const needsValue = node.operator && !VALUE_LESS_OPERATORS.has(node.operator);
        const isMulti = node.operator === "IN" || node.operator === "NOT IN";
        const hasError = !!validationErrors[node.id];

        // Show dropdown for =/!= and IN/NOT IN on lookup/consumable/product/pseudo types
        const isDropdownableKind = kind === "lookup" || kind === "consumable" || kind === "product" || kind === "__pseudo__";
        const dt = combinedOptions.find((d) => d.value === node.dataTypeIdentifier);
        const lookupKey = (kind === "lookup" || kind === "consumable") ? dt?.lookupTypeIdentifier : null;
        const productKey = kind === "product" ? "__all_products__" : null;
        const valueOptions = (lookupKey && lookupOptionsByType[lookupKey]) ? lookupOptionsByType[lookupKey]! : [];
        const productValueOptions = (productKey && lookupOptionsByType[productKey]) ? lookupOptionsByType[productKey]! : [];

        // Product Type pseudo has its own options from loaded productTypes
        const ptOptions = node.dataTypeIdentifier === PSEUDO_DT_PRODUCT_TYPE
            ? productTypes.map((pt) => ({ label: pt.name, value: pt.identifier }))
            : [];

        const resolvedOptions = ptOptions.length > 0 ? ptOptions : productValueOptions.length > 0 ? productValueOptions : valueOptions;
        // Always show dropdown/multiselect for these kinds — empty list is fine (will populate on load)

        return (
            <div
                key={node.id}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem",
                    borderRadius: "0.375rem",
                    border: hasError ? "1px solid var(--red-500)" : "1px solid transparent",
                    flexWrap: "wrap",
                }}
            >
                <Dropdown
                    value={node.dataTypeIdentifier}
                    options={combinedOptions.map((o) => ({ label: o.label, value: o.value }))}
                    onChange={(e) => {
                        const newDt = combinedOptions.find((d) => d.value === e.value);
                        updateNode(node.id, (n) => ({
                            ...(n as RuleNode),
                            dataTypeIdentifier: e.value,
                            operator: null,
                            value: null,
                            values: [],
                            caseInsensitive: false,
                        }));
                        if (newDt?.lookupTypeIdentifier) {
                            onEnsureLookup(newDt.lookupTypeIdentifier, newDt.kind);
                        } else if (newDt?.kind === "product") {
                            onEnsureLookup("__all_products__", "product");
                        }
                    }}
                    placeholder="Data Type"
                    style={{ minWidth: "140px" }}
                    filter
                />
                <Dropdown
                    value={node.operator}
                    options={operators.map((o) => ({ label: o, value: o }))}
                    onChange={(e) => updateNode(node.id, (n) => ({ ...(n as RuleNode), operator: e.value, value: null, values: [] }))}
                    placeholder="Operator"
                    style={{ minWidth: "120px" }}
                />

                {/* Case-insensitive checkbox for string/pseudo-like data types */}
                {needsValue && supportsCaseInsensitive(node) && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <Checkbox
                            checked={node.caseInsensitive ?? false}
                            onChange={(e) => updateNode(node.id, (n) => ({
                                ...(n as RuleNode),
                                caseInsensitive: e.checked ?? false,
                            }))}
                        />
                        <span style={{ fontSize: "0.75rem" }}>CI</span>
                    </div>
                )}

                {/* Value input: Dropdown/MultiSelect for lookup/consumable/product/pseudo; InputText otherwise */}
                {needsValue && isDropdownableKind && !isMulti && (
                    <Dropdown
                        value={node.value}
                        options={resolvedOptions}
                        onChange={(e) => updateNode(node.id, (n) => ({ ...(n as RuleNode), value: e.value }))}
                        placeholder="Select value"
                        style={{ minWidth: "160px" }}
                        filter
                    />
                )}
                {needsValue && isDropdownableKind && isMulti && (
                    <MultiSelect
                        value={node.values as any[] ?? []}
                        options={resolvedOptions}
                        onChange={(e) => updateNode(node.id, (n) => ({ ...(n as RuleNode), values: e.value as unknown[] }))}
                        placeholder="Select values"
                        style={{ minWidth: "220px" }}
                        filter
                    />
                )}
                {needsValue && !isDropdownableKind && !isMulti && (
                    <InputText
                        value={node.value as string ?? ""}
                        onChange={(e) => updateNode(node.id, (n) => ({ ...(n as RuleNode), value: e.target.value }))}
                        placeholder="Value"
                        style={{ minWidth: "120px" }}
                    />
                )}
                {needsValue && !isDropdownableKind && isMulti && (
                    <InputText
                        value={(node.values as string[] ?? []).join(", ")}
                        onChange={(e) => updateNode(node.id, (n) => ({
                            ...(n as RuleNode),
                            values: e.target.value.split(",").map((v) => v.trim()).filter(Boolean),
                        }))}
                        placeholder="Values (comma-separated)"
                        style={{ minWidth: "180px" }}
                    />
                )}
                {hasError && (
                    <small style={{ color: "var(--red-500)", width: "100%" }}>{validationErrors[node.id]}</small>
                )}
                <Button
                    icon="pi pi-times"
                    className="p-button-text p-button-sm p-button-danger"
                    onClick={() => removeNode(node.id)}
                    tooltip="Remove condition"
                />
            </div>
        );
    };

    const renderGroup = (node: GroupNode, depth: number): React.ReactNode => {
        const accentColor = GROUP_COLORS[depth % GROUP_COLORS.length]!;
        const isRoot = node.id === tree.id;

        return (
            <div
                key={node.id}
                style={{
                    border: `2px solid ${accentColor}`,
                    borderRadius: "0.5rem",
                    padding: "0.75rem",
                    margin: isRoot ? 0 : "0.5rem 0 0.5rem 0",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                    {!isRoot && (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                            <Checkbox
                                checked={node.not}
                                onChange={(e) => updateNode(node.id, (n) => ({ ...(n as GroupNode), not: e.checked ?? false }))}
                            />
                            <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>NOT</span>
                        </div>
                    )}
                    <SelectButton
                        value={node.logic}
                        options={[{ label: "AND", value: "AND" }, { label: "OR", value: "OR" }]}
                        onChange={(e) => updateNode(node.id, (n) => ({ ...(n as GroupNode), logic: e.value as "AND" | "OR" }))}
                    />
                    <Button icon="pi pi-plus" className="p-button-text p-button-sm" onClick={() => addChild(node.id, createEmptyRule())} tooltip="Add Condition" label="Condition" />
                    <Button icon="pi pi-plus-circle" className="p-button-text p-button-sm" onClick={() => addChild(node.id, createEmptyGroup())} tooltip="Add Group" label="Group" severity="secondary" />
                    {!isRoot && (
                        <Button icon="pi pi-trash" className="p-button-text p-button-sm p-button-danger" onClick={() => removeNode(node.id)} tooltip="Remove Group" />
                    )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", paddingLeft: "1rem" }}>
                    {node.children.map((child) =>
                        child.type === "group" ? renderGroup(child, depth + 1) : renderRule(child, depth + 1),
                    )}
                </div>
            </div>
        );
    };

    const footer = (
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
            <Button label="Clear filter" className="p-button-text p-button-danger" onClick={handleClear} />
            <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button label="Cancel" className="p-button-text" onClick={onHide} />
                <Button label={`Apply filter${ruleCount > 0 ? ` (${ruleCount})` : ""}`} icon="pi pi-check" onClick={handleApply} />
            </div>
        </div>
    );

    return (
        <Dialog
            header="Filter products"
            visible={visible}
            onHide={onHide}
            footer={footer}
            style={{ width: "850px", maxWidth: "95vw" }}
            maximizable
        >
            {/* Quick Filters */}
            <div style={{ marginBottom: "1rem", padding: "0.75rem", border: "1px solid var(--surface-border)", borderRadius: "0.5rem" }}>
                <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem" }}>Quick filters</h4>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                    <InputText
                        value={quickProductNumber}
                        onChange={(e) => setQuickProductNumber(e.target.value)}
                        placeholder="Product Number contains..."
                        style={{ minWidth: "200px" }}
                    />
                    <Dropdown
                        value={quickProductType}
                        options={[
                            { label: "(Any)", value: "any" },
                            ...productTypes.map((pt) => ({ label: pt.name, value: pt.identifier })),
                        ]}
                        onChange={(e) => setQuickProductType(typeof e.value === "string" ? e.value : "any")}
                        placeholder="Product Type"
                        style={{ minWidth: "180px" }}
                        filter
                        showClear
                    />
                    <Dropdown
                        value={quickDisabled}
                        options={[
                            { label: "Any", value: "any" },
                            { label: "Active only", value: "active" },
                            { label: "Disabled only", value: "disabled" },
                        ]}
                        onChange={(e) => setQuickDisabled(e.value)}
                        placeholder="Disabled"
                        style={{ minWidth: "140px" }}
                    />
                </div>
            </div>

            {/* Rule Builder */}
            <div style={{ marginBottom: "1rem" }}>
                <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem" }}>Rule builder</h4>
                {renderGroup(tree, 0)}
            </div>
        </Dialog>
    );
};

export default QueryBuilder;
