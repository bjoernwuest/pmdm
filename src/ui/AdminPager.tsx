/**
 * Shared admin list pager: page navigation, page-size select, and total display.
 * Parameterized by the `useAdminListQuery` outputs and the entity label.
 */
export function AdminPager({
    page,
    pageSize,
    total,
    availablePageSizes,
    onUpdate,
    entityLabel,
}: {
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
    onUpdate: (patch: { page?: number; pageSize?: number; showDisabled?: boolean }) => void;
    entityLabel: string;
}) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <div className="admin-pager-row">
            <button type="button" disabled={page <= 1} onClick={() => onUpdate({ page: Math.max(1, page - 1) })}>
                Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => onUpdate({ page: Math.min(totalPages, page + 1) })}>
                Next
            </button>
            <label>
                Page size
                <select
                    className="admin-page-size"
                    value={pageSize}
                    onChange={(event) => {
                        onUpdate({ page: 1, pageSize: Number(event.target.value) });
                    }}
                >
                    {availablePageSizes.map((size) => (
                        <option key={size} value={size}>{size}</option>
                    ))}
                </select>
            </label>
            <span>{total} {entityLabel}</span>
        </div>
    );
}
