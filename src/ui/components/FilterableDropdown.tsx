import React, { useState, useMemo, useCallback } from "react";
import { InputText } from "primereact/inputtext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterableDropdownOption {
    identifier: string;
    name: string;
    /** Optional extra display field (e.g., kind for data types) */
    kind?: string;
    [key: string]: unknown;
}

export interface FilterableDropdownProps {
    /** Label displayed above the component */
    label?: string;
    /** All available options */
    options: FilterableDropdownOption[];
    /** Currently selected identifier(s). string in single mode, string[] in multi mode */
    selected: string | string[];
    /** Callback when selection changes. Receives identifier in single mode, string[] in multi mode */
    onChange: (selected: string | string[]) => void;
    /** Selection mode */
    multiSelect?: boolean;
    /** Placeholder text for the search input */
    placeholder?: string;
    /** Whether the component is disabled */
    disabled?: boolean;
    /** Optional: maximum number of visible options before scroll (default: 200px max-height) */
    maxHeight?: string;
    /** Optional: text to show when no options match the filter */
    emptyMessage?: string;
    /** Optional: CSS class for the wrapper */
    className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A dropdown component with a built-in filter/search input. Supports single
 * and multi-select modes.
 *
 * In single mode, clicking an option selects it; clicking the already-selected
 * option deselects it (onChange("")).
 *
 * In multi mode, checkboxes are used; a "Select All"/"Deselect All" toggle is
 * shown that respects the current filter.
 */
function FilterableDropdown({
    label,
    options,
    selected,
    onChange,
    multiSelect = false,
    placeholder = "Search...",
    disabled = false,
    maxHeight = "200px",
    emptyMessage = "No options available",
    className,
}: FilterableDropdownProps) {
    const [filterText, setFilterText] = useState("");

    // Normalize selected into a Set for multi-select lookups
    const selectedSet = useMemo(() => {
        if (multiSelect && Array.isArray(selected)) {
            return new Set(selected as string[]);
        }
        if (!multiSelect && typeof selected === "string" && selected !== "") {
            return new Set([selected]);
        }
        return new Set<string>();
    }, [selected, multiSelect]);

    // Filter options case-insensitively by name and kind
    const filteredOptions = useMemo(() => {
        if (!filterText.trim()) return options;
        const lower = filterText.toLowerCase();
        return options.filter((opt) => {
            if (opt.name.toLowerCase().includes(lower)) return true;
            if (opt.kind && opt.kind.toLowerCase().includes(lower)) return true;
            return false;
        });
    }, [options, filterText]);

    // Handle single-select click
    const handleSingleClick = useCallback(
        (identifier: string) => {
            if (disabled) return;
            if (selected === identifier) {
                onChange("");
            } else {
                onChange(identifier);
            }
        },
        [disabled, selected, onChange],
    );

    // Handle multi-select toggle for a single option
    const handleMultiToggle = useCallback(
        (identifier: string) => {
            if (disabled) return;
            const current = Array.isArray(selected) ? selected : [];
            if (current.includes(identifier)) {
                onChange(current.filter((id) => id !== identifier));
            } else {
                onChange([...current, identifier]);
            }
        },
        [disabled, selected, onChange],
    );

    // Handle Select All / Deselect All for the current filtered results
    const handleSelectAllToggle = useCallback(() => {
        if (disabled) return;
        const filteredIds = filteredOptions.map((o) => o.identifier);
        const current = Array.isArray(selected) ? selected : [];
        const allFilteredSelected = filteredIds.every((id) => current.includes(id));

        if (allFilteredSelected) {
            // Deselect all filtered
            const filteredSet = new Set(filteredIds);
            onChange(current.filter((id) => !filteredSet.has(id)));
        } else {
            // Select all filtered (union)
            const newSet = new Set(current);
            for (const id of filteredIds) {
                newSet.add(id);
            }
            onChange(Array.from(newSet));
        }
    }, [disabled, filteredOptions, selected, onChange]);

    // Determine if all filtered items are currently selected
    const allFilteredSelected = useMemo(() => {
        const current = Array.isArray(selected) ? selected : [];
        if (filteredOptions.length === 0) return false;
        return filteredOptions.every((o) => current.includes(o.identifier));
    }, [filteredOptions, selected]);

    // Selected count for multi-select badge
    const selectedCount = useMemo(() => {
        if (!multiSelect) return 0;
        return Array.isArray(selected) ? selected.length : 0;
    }, [multiSelect, selected]);

    // Clear filter on Escape key
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Escape") {
                setFilterText("");
            }
        },
        [],
    );

    // -----------------------------------------------------------------------
    // Styles
    // -----------------------------------------------------------------------

    const containerStyle: React.CSSProperties = {
        border: `1px solid var(--at-surface-border, var(--surface-border, #ccc))`,
        borderRadius: "6px",
        overflow: "hidden",
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto",
        background: "var(--at-surface-100, var(--surface-0, #fff))",
    };

    const filterInputWrapperStyle: React.CSSProperties = {
        padding: "6px",
        borderBottom: `1px solid var(--at-surface-border, var(--surface-border, #e0e0e0))`,
    };

    const filterInputStyle: React.CSSProperties = {
        width: "100%",
    };

    const optionsContainerStyle: React.CSSProperties = {
        maxHeight,
        overflowY: "auto",
    };

    const optionRowBaseStyle: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 10px",
        cursor: disabled ? "default" : "pointer",
        fontSize: "0.875rem",
        borderBottom: "1px solid var(--at-surface-border, var(--surface-border, #f0f0f0))",
        transition: "background-color 0.1s",
    };

    const optionRowHoverStyle: React.CSSProperties = {
        backgroundColor: "var(--at-surface-100, var(--surface-100, #f5f5f5))",
    };

    const selectedOptionStyle: React.CSSProperties = {
        backgroundColor: "var(--at-color-success, var(--green-50, #e8f5e9))",
    };

    const mutedTextStyle: React.CSSProperties = {
        color: "var(--at-text-secondary, var(--text-color-secondary, #888))",
        fontSize: "0.875rem",
        padding: "10px",
        textAlign: "center",
    };

    const labelStyle: React.CSSProperties = {
        display: "block",
        marginBottom: "4px",
        fontSize: "0.875rem",
        fontWeight: 600,
        color: "var(--at-text-secondary, var(--text-color-secondary, #555))",
    };

    const headerStyle: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 10px",
        borderBottom: `1px solid var(--at-surface-border, var(--surface-border, #e0e0e0))`,
        fontSize: "0.75rem",
        color: "var(--at-text-secondary, var(--text-color-secondary, #888))",
    };

    const selectAllLinkStyle: React.CSSProperties = {
        cursor: "pointer",
        color: "var(--primary-color, #3b82f6)",
        fontSize: "0.75rem",
        fontWeight: 500,
        background: "none",
        border: "none",
        padding: 0,
    };

    const checkboxStyle: React.CSSProperties = {
        flexShrink: 0,
        cursor: disabled ? "default" : "pointer",
    };

    const optionTextStyle: React.CSSProperties = {
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    };

    const kindBadgeStyle: React.CSSProperties = {
        fontSize: "0.7rem",
        color: "var(--at-text-secondary, var(--text-color-secondary, #888))",
        background: "var(--at-surface-100, var(--surface-100, #f5f5f5))",
        padding: "1px 6px",
        borderRadius: "4px",
        flexShrink: 0,
    };

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div className={className}>
            {label ? <span style={labelStyle}>{label}</span> : null}
            <div style={containerStyle}>
                {/* Search input */}
                <div style={filterInputWrapperStyle}>
                    <InputText
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        placeholder={placeholder}
                        disabled={disabled}
                        style={filterInputStyle}
                        onKeyDown={handleKeyDown}
                    />
                </div>

                {/* Multi-select header with count and select-all */}
                {multiSelect && (
                    <div style={headerStyle}>
                        <span>
                            {selectedCount > 0 ? `${selectedCount} selected` : "No selection"}
                        </span>
                        <button
                            type="button"
                            style={selectAllLinkStyle}
                            onClick={handleSelectAllToggle}
                            disabled={disabled || filteredOptions.length === 0}
                        >
                            {allFilteredSelected ? "Deselect All" : "Select All"}
                        </button>
                    </div>
                )}

                {/* Options list */}
                <div style={optionsContainerStyle}>
                    {options.length === 0 ? (
                        <div style={mutedTextStyle}>
                            <i className="pi pi-info-circle" style={{ marginRight: "4px" }} />
                            {emptyMessage}
                        </div>
                    ) : filteredOptions.length === 0 ? (
                        <div style={mutedTextStyle}>
                            <i className="pi pi-search" style={{ marginRight: "4px" }} />
                            No results match your search
                        </div>
                    ) : (
                        filteredOptions.map((option) => {
                            const isSelected = selectedSet.has(option.identifier);

                            if (multiSelect) {
                                // ---- Multi-select row with checkbox ----
                                return (
                                    <label
                                        key={option.identifier}
                                        style={{
                                            ...optionRowBaseStyle,
                                            ...(isSelected ? selectedOptionStyle : {}),
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isSelected && !disabled)
                                                (e.currentTarget as HTMLElement).style.backgroundColor =
                                                    optionRowHoverStyle.backgroundColor ?? "";
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isSelected && !disabled)
                                                (e.currentTarget as HTMLElement).style.backgroundColor = "";
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            disabled={disabled}
                                            style={checkboxStyle}
                                            onChange={() => handleMultiToggle(option.identifier)}
                                        />
                                        <span style={optionTextStyle}>{option.name}</span>
                                        {option.kind ? (
                                            <span style={kindBadgeStyle}>{option.kind}</span>
                                        ) : null}
                                    </label>
                                );
                            }

                            // ---- Single-select row ----
                            return (
                                <div
                                    key={option.identifier}
                                    style={{
                                        ...optionRowBaseStyle,
                                        ...(isSelected ? selectedOptionStyle : {}),
                                    }}
                                    onClick={() => handleSingleClick(option.identifier)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            handleSingleClick(option.identifier);
                                        }
                                    }}
                                    role="option"
                                    aria-selected={isSelected}
                                    tabIndex={0}
                                    onMouseEnter={(e) => {
                                        if (!isSelected && !disabled)
                                            (e.currentTarget as HTMLElement).style.backgroundColor =
                                                optionRowHoverStyle.backgroundColor ?? "";
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isSelected && !disabled)
                                            (e.currentTarget as HTMLElement).style.backgroundColor = "";
                                    }}
                                >
                                    {isSelected ? (
                                        <i
                                            className="pi pi-check"
                                            style={{ fontSize: "0.8rem", color: "var(--at-color-success, var(--green-600, #16a34a))", flexShrink: 0 }}
                                        />
                                    ) : (
                                        <span style={{ width: "0.8rem", flexShrink: 0 }} />
                                    )}
                                    <span style={optionTextStyle}>{option.name}</span>
                                    {option.kind ? (
                                        <span style={kindBadgeStyle}>{option.kind}</span>
                                    ) : null}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

export default FilterableDropdown;
export { FilterableDropdown };
