import type { PageMeta } from "@/types/PageType.ts";

export const meta: PageMeta = {
    id: "dashboard",
    urn: "urn:bun-starter:ui:page:dashboard",
    path: "/dashboard",
    title: "Dashboard",
    description: "Start page of the application.",
    menu: {
        section: "General",
        order: 0,
        label: "Dashboard",
    },
};

export function Component() {
    return (
        <div className="mui-dash-page">
            <section className="mui-kpi-grid" aria-label="Key metrics">
                <article className="at-card mui-kpi-card">
                    <p className="mui-kpi-label">Budget</p>
                    <p className="mui-kpi-value">$24k</p>
                    <p className="mui-kpi-delta positive">+12%</p>
                </article>
                <article className="at-card mui-kpi-card">
                    <p className="mui-kpi-label">Total customers</p>
                    <p className="mui-kpi-value">1,682</p>
                    <p className="mui-kpi-delta positive">+16%</p>
                </article>
                <article className="at-card mui-kpi-card">
                    <p className="mui-kpi-label">Task progress</p>
                    <p className="mui-kpi-value">75%</p>
                    <div className="mui-progress-track" role="progressbar" aria-valuenow={75} aria-valuemin={0} aria-valuemax={100}>
                        <span style={{ width: "75%" }} />
                    </div>
                </article>
                <article className="at-card mui-kpi-card">
                    <p className="mui-kpi-label">Total profit</p>
                    <p className="mui-kpi-value">$15k</p>
                    <p className="mui-kpi-delta negative">-8%</p>
                </article>
            </section>

            <section className="mui-dash-grid">
                <article className="at-card mui-panel-card">
                    <header className="mui-panel-head">
                        <h2>Sales</h2>
                        <span className="small-muted">Last 6 months</span>
                    </header>
                    <div className="mui-chart-placeholder" aria-label="Sales chart">
                        <div className="mui-chart-line" />
                    </div>
                </article>

                <article className="at-card mui-panel-card">
                    <header className="mui-panel-head">
                        <h2>Traffic by source</h2>
                    </header>
                    <div className="mui-donut-placeholder" aria-label="Traffic chart">
                        <div className="mui-donut-ring" />
                    </div>
                </article>
            </section>

            <section className="at-card mui-table-card" aria-label="Latest orders">
                <header className="mui-panel-head">
                    <h2>Latest orders</h2>
                </header>
                <table className="mui-simple-table">
                    <thead>
                        <tr>
                            <th>Order</th>
                            <th>Customer</th>
                            <th>Date</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>#1001</td>
                            <td>Ava Adams</td>
                            <td>2026-06-10</td>
                            <td><span className="mui-pill">Delivered</span></td>
                        </tr>
                        <tr>
                            <td>#1002</td>
                            <td>Noah Parker</td>
                            <td>2026-06-09</td>
                            <td><span className="mui-pill pending">Pending</span></td>
                        </tr>
                        <tr>
                            <td>#1003</td>
                            <td>Sophia Reed</td>
                            <td>2026-06-08</td>
                            <td><span className="mui-pill">Delivered</span></td>
                        </tr>
                    </tbody>
                </table>
            </section>
        </div>
    );
}

