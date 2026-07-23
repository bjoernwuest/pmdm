// Applications using this template are encouraged to place their page registrations in this file and not in `PageRegistry.ts` to achieve stability with upgrades of the template.

import type {PageModule} from "@/types/PageType.ts";
import * as ConfigurationHomePage from "./pages/ConfigurationHome.tsx";
import * as ConfigurationTargetSystemsPage from "./pages/ConfigurationTargetSystems.tsx";
import * as ConfigurationProductTypesPage from "./pages/ConfigurationProductTypes.tsx";
import * as ConfigurationProductTypesDataTypesPage from "./pages/ConfigurationProductTypesDataTypes.tsx";
import * as ConfigurationProductTypesDataTypesTargetSystemsPage from "./pages/ConfigurationProductTypesDataTypesTargetSystems.tsx";
import * as ConfigurationBusinessDomainsPage from "./pages/ConfigurationBusinessDomains.tsx";
import * as ConfigurationConsumablesPage from "./pages/ConfigurationConsumables.tsx";
import * as ConfigurationConsumableDetailPage from "./pages/ConfigurationConsumableDetail.tsx";
import * as ConfigurationLookupsPage from "./pages/ConfigurationLookups.tsx";
import * as ConfigurationLookupDetailPage from "./pages/ConfigurationLookupDetail.tsx";
import * as ConfigurationDataTypesPage from "./pages/ConfigurationDataTypes.tsx";
import * as ConfigurationDataTypeDetailPage from "./pages/ConfigurationDataTypeDetail.tsx";
import * as ProductPage from "./pages/ProductPage.tsx";
import * as ProductDetailPage from "./pages/ProductDetailPage.tsx";
import * as OpenProductRequestsPage from "./pages/OpenProductRequestsPage.tsx";
import * as ProductRequestDetailPage from "./pages/ProductRequestDetailPage.tsx";
import * as ProductExportsPage from "./pages/ProductExportsPage.tsx";

export const pageModules: readonly PageModule[] = [
    { meta: ConfigurationHomePage.meta, Component: ConfigurationHomePage.Component },
    { meta: ConfigurationTargetSystemsPage.meta, Component: ConfigurationTargetSystemsPage.Component },
    { meta: ConfigurationProductTypesPage.meta, Component: ConfigurationProductTypesPage.Component },
    { meta: ConfigurationProductTypesDataTypesPage.meta, Component: ConfigurationProductTypesDataTypesPage.Component },
    { meta: ConfigurationProductTypesDataTypesTargetSystemsPage.meta, Component: ConfigurationProductTypesDataTypesTargetSystemsPage.Component },
    { meta: ConfigurationBusinessDomainsPage.meta, Component: ConfigurationBusinessDomainsPage.Component },
    { meta: ConfigurationConsumablesPage.meta, Component: ConfigurationConsumablesPage.Component },
    { meta: ConfigurationConsumableDetailPage.meta, Component: ConfigurationConsumableDetailPage.Component },
    { meta: ConfigurationLookupsPage.meta, Component: ConfigurationLookupsPage.Component },
    { meta: ConfigurationLookupDetailPage.meta, Component: ConfigurationLookupDetailPage.Component },
    { meta: ConfigurationDataTypesPage.meta, Component: ConfigurationDataTypesPage.Component },
    { meta: ConfigurationDataTypeDetailPage.meta, Component: ConfigurationDataTypeDetailPage.Component },
    { meta: OpenProductRequestsPage.meta, Component: OpenProductRequestsPage.Component },
    { meta: ProductPage.meta, Component: ProductPage.Component },
    { meta: ProductDetailPage.meta, Component: ProductDetailPage.Component },
    { meta: ProductRequestDetailPage.meta, Component: ProductRequestDetailPage.Component },
    { meta: ProductExportsPage.meta, Component: ProductExportsPage.Component },
];
